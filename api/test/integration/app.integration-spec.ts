import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { get as httpsGet } from 'node:https';
import { connect } from 'node:net';
import { readdirSync } from 'node:fs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CALENDAR_PROVIDER } from '../../src/calendar/calendar.module';
import { GMAIL_PROVIDER } from '../../src/gmail/gmail.module';
import { OllamaProvider } from '../../src/jarvis/providers/ollama.provider';
import { OpenAIProvider } from '../../src/jarvis/providers/openai.provider';
import { fakeCalendar, fakeGmail } from '../fixtures/providers';
import { allowedPorts } from '../fixtures/integration-safety';

const scopes =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

describe('API against disposable migrated PostgreSQL', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let baseUrl: string;
  const calendar = fakeCalendar();
  const gmail = fakeGmail([
    {
      id: 'fixture-message',
      threadId: 'fixture-thread',
      subject: 'Test question',
      from: 'sender@example.invalid',
      to: 'recipient@example.invalid',
      date: new Date('2026-09-21T10:00:00Z'),
      snippet: 'Could you confirm?',
      bodyText: 'Could you confirm?',
      labels: ['INBOX', 'UNREAD'],
      unread: true,
    },
  ]);
  const model = jest
    .fn<Promise<string>, []>()
    .mockResolvedValue('{"type":"final","text":"Fixture response"}');

  beforeAll(async () => {
    // Existing services construct model adapters internally; stub both adapters at
    // their public boundary until JAR-024 moves provider construction into DI.
    jest.spyOn(OllamaProvider.prototype, 'chat').mockImplementation(model);
    jest.spyOn(OpenAIProvider.prototype, 'chat').mockImplementation(model);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CALENDAR_PROVIDER)
      .useValue(calendar)
      .overrideProvider(GMAIL_PROVIDER)
      .useValue(gmail)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    allowedPorts.add(address.port);
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    jest.spyOn(OllamaProvider.prototype, 'chat').mockRestore();
    jest.spyOn(OpenAIProvider.prototype, 'chat').mockRestore();
  });

  async function seedGoogle(sessionId: string) {
    await prisma.googleOAuthToken.create({
      data: {
        sessionId,
        refreshToken: 'fixture-not-a-real-token',
        scope: scopes,
      },
    });
  }

  it('replays every checked-in migration and serves HTTP', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const expected = readdirSync('prisma/migrations', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(rows.map((row) => row.migration_name).sort()).toEqual(expected);
    await request(baseUrl).get('/').expect(200, 'Hello World!');
  });

  it('persists a tool result and rejects malformed HTTP input', async () => {
    model.mockResolvedValueOnce(
      '{"type":"tool","name":"todo.add","args":{"text":"Integration fixture task"}}',
    );
    await request(baseUrl)
      .post('/jarvis/chat')
      .send({ text: 'Ajoute une tâche de test', sessionId: 'fixture-todo' })
      .expect(201);
    expect(
      await prisma.todo.count({ where: { text: 'Integration fixture task' } }),
    ).toBe(1);
    expect(
      await prisma.jarvisLog.count({
        where: { sessionId: 'fixture-todo', toolName: 'todo.add' },
      }),
    ).toBe(1);
    await request(baseUrl)
      .post('/jarvis/chat')
      .send({ text: 123, unexpected: true })
      .expect(400);
  });

  it('persists and confirms a calendar action using only the injected fake', async () => {
    const sessionId = 'fixture-calendar';
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/jarvis/chat')
      .send({ text: 'Ajoute un rendez-vous demain à 18h', sessionId })
      .expect(201);
    const pending = await prisma.pendingAction.findUniqueOrThrow({
      where: { sessionId },
    });
    expect(calendar.createEvent).not.toHaveBeenCalled();
    await request(baseUrl)
      .post('/jarvis/confirm')
      .send({ actionId: pending.id, sessionId })
      .expect(201);
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    expect(calendar.createEvent.mock.calls[0][0]).toBe(sessionId);
    expect(await prisma.pendingAction.count({ where: { sessionId } })).toBe(0);
    expect(
      await prisma.jarvisActionEvent.count({ where: { sessionId } }),
    ).toBeGreaterThan(0);
  });

  it('scans and replies to a fixture email without a real Google account', async () => {
    const sessionId = 'fixture-inbox';
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .send({ sessionId })
      .expect(201);
    expect(await prisma.inboxZeroItem.count({ where: { sessionId } })).toBe(1);
    await request(baseUrl)
      .post('/inbox-zero/apply')
      .send({
        sessionId,
        action: 'send_reply',
        messageIds: ['fixture-message'],
        replyText: 'Fixture reply',
        archiveAfter: false,
      })
      .expect(201);
    expect(gmail.sendMessage).toHaveBeenCalledTimes(1);
    expect(gmail.sendMessage.mock.calls[0][1].to).toBe(
      'sender@example.invalid',
    );
  });

  it('blocks accidental external transport even if a provider override is missed', async () => {
    expect(() => httpsGet('https://provider.example.invalid')).toThrow(
      'External network disabled',
    );
    expect(() => connect({ host: 'smtp.gmail.com', port: 465 })).toThrow(
      'External network disabled',
    );
    expect(() => connect({ host: '127.0.0.1', port: 11434 })).toThrow(
      'External network disabled',
    );
    await expect(fetch('https://gmail.googleapis.com')).rejects.toThrow(
      'External fetch disabled',
    );
    expect(process.env.OPENAI_API_KEY).toBe('');
    expect(process.env.GOOGLE_CLIENT_SECRET).toBe('');
  });
});
