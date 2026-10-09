import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AccountErasureStatusSchema,
  PrivacyDisclosureSchema,
} from '../../src/contracts/v1';
import { AccountSnapshotService } from '../../src/privacy/account-snapshot.service';
import { ConversationService } from '../../src/auth/conversation.service';
import { ConfigService } from '@nestjs/config';
import { GoogleCredentialService } from '../../src/google/google-credential.service';
import { OAuthStateService } from '../../src/google/oauth-state.service';
import { createAuth } from '../../src/auth/create-auth';
import { readAuthConfig } from '../../src/auth/auth-config';
import { createHmac, randomUUID } from 'node:crypto';
import { configureAuth } from '../../src/auth/configure-auth';
import { configureHttpSafety } from '../../src/http/configure-http-safety';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PUBLIC_ENDPOINT } from '../../src/auth/public-endpoint';
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
import {
  AccountDataExportPageSchema,
  AccountProfileExportSchema,
  JarvisChatResponseSchema,
  JarvisStatusSnapshotSchema,
} from '../../src/contracts/v1';

const scopes =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

describe('API against disposable migrated PostgreSQL', () => {
  let ledgerDirectory: string;
  const previousLedgerDirectory = process.env.PRIVACY_LEDGER_DIR;
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let baseUrl: string;
  let sessionCookie: string;
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
    ledgerDirectory = await mkdtemp(join(tmpdir(), 'jarvis-http-ledger-'));
    process.env.PRIVACY_LEDGER_DIR = ledgerDirectory;
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
    const nestApp = module.createNestApplication<NestExpressApplication>();
    configureHttpSafety(nestApp);
    await configureAuth(nestApp);
    app = nestApp;
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
    await prisma.betaInvite.create({
      data: { email: 'integration@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: 'integration-user',
        name: 'Fixture',
        email: 'integration@example.invalid',
        emailVerified: true,
      },
    });
    const token = 'integration-session-fixture-token';
    await prisma.session.create({
      data: {
        id: 'integration-session',
        token,
        userId: 'integration-user',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    sessionCookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
  });

  afterAll(async () => {
    await app?.close();
    if (previousLedgerDirectory === undefined)
      delete process.env.PRIVACY_LEDGER_DIR;
    else process.env.PRIVACY_LEDGER_DIR = previousLedgerDirectory;
    await rm(ledgerDirectory, { recursive: true, force: true });
    jest.spyOn(OllamaProvider.prototype, 'chat').mockRestore();
    jest.spyOn(OpenAIProvider.prototype, 'chat').mockRestore();
  });

  it('creates an identity-scoped deletion request and allows only its capability to track it after signout', async () => {
    const ownerId = `http-erasure-${randomUUID()}`;
    const email = `${ownerId}@example.invalid`;
    const token = randomUUID();
    await prisma.betaInvite.create({ data: { email } });
    await prisma.user.create({
      data: { id: ownerId, email, name: 'Erasure HTTP', emailVerified: true },
    });
    await prisma.session.create({
      data: {
        id: randomUUID(),
        token,
        userId: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const receipt =
      randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    const disclosure = await request(baseUrl)
      .get('/account/privacy')
      .set('Cookie', cookie)
      .expect(200);
    expect(PrivacyDisclosureSchema.safeParse(disclosure.body).success).toBe(
      true,
    );
    expect(disclosure.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(disclosure.body)).not.toContain(
      process.env.AUTH_SECRET!,
    );

    await request(baseUrl)
      .post('/account/deletion')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({ confirmEmail: email, receipt, ownerId: 'integration-user' })
      .expect(400);
    await request(baseUrl)
      .post('/account/deletion')
      .set('Origin', 'https://untrusted.invalid')
      .set('Cookie', cookie)
      .send({ confirmEmail: email, receipt })
      .expect(403);
    await request(baseUrl)
      .post('/account/deletion')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({
        confirmEmail: email,
        receipt,
        expectedAccountId: 'integration-user',
      })
      .expect(409);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .disabled,
    ).toBe(false);
    const accepted = await request(baseUrl)
      .post('/account/deletion')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({ confirmEmail: email, receipt })
      .expect(202);
    expect(AccountErasureStatusSchema.safeParse(accepted.body).success).toBe(
      true,
    );
    expect(accepted.headers['cache-control']).toBe('no-store');
    expect(await prisma.session.count({ where: { userId: ownerId } })).toBe(0);
    await request(baseUrl).get('/account/me').set('Cookie', cookie).expect(401);
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: 'integration-user' },
        })
      ).disabled,
    ).toBe(false);
    await request(baseUrl).get('/account/deletion/status').expect(404);
    await request(baseUrl)
      .get('/account/deletion/status')
      .set('x-erasure-receipt', 'b'.repeat(64))
      .expect(404);
    const status = await request(baseUrl)
      .get('/account/deletion/status')
      .set('x-erasure-receipt', receipt)
      .expect(200);
    expect(AccountErasureStatusSchema.safeParse(status.body).success).toBe(
      true,
    );
    expect(status.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(status.body)).not.toContain(ownerId);
    expect(JSON.stringify(status.body)).not.toContain(email);
    expect(JSON.stringify(status.body)).not.toContain(receipt);
  });

  it('bounds DTOs and throttles verified accounts across conversation changes', async () => {
    await prisma.betaInvite.create({
      data: { email: 'limits@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: 'limits-user',
        name: 'Limits',
        email: 'limits@example.invalid',
        emailVerified: true,
      },
    });
    const token = 'limits-session-token';
    await prisma.session.create({
      data: {
        id: 'limits-session',
        token,
        userId: 'limits-user',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    await request(baseUrl)
      .get('/jarvis/status')
      .query({ sessionId: 'x'.repeat(129) })
      .set('Cookie', cookie)
      .expect(400);
    await request(baseUrl)
      .get('/inbox-zero/message')
      .query({ messageId: ['one', 'two'] })
      .set('Cookie', cookie)
      .expect(400);
    await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        action: 'archive',
        messageIds: Array.from({ length: 21 }, (_, i) => String(i)),
      })
      .expect(400);
    for (let i = 0; i < 19; i++) {
      await request(baseUrl)
        .post('/jarvis/chat')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ text: 'x'.repeat(8001), sessionId: `conversation-${i}` })
        .expect(400);
    }
    const limited = await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'bonjour', sessionId: 'new-conversation' })
      .expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // Reads have their own larger account allowance after the mutation quota.
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', cookie)
      .expect(200);
  });

  async function seedGoogle(clientKey: string) {
    const sessionId = await app
      .get(ConversationService)
      .resolve('integration-user', clientKey);
    await app
      .get(GoogleCredentialService)
      .save('integration-user', 'fixture-google-subject', sessionId, {
        refresh_token: 'fixture-not-a-real-token',
        scope: scopes,
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
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'Ajoute une tâche de test', sessionId: 'fixture-todo' })
      .expect(201);
    expect(
      await prisma.todo.count({ where: { text: 'Integration fixture task' } }),
    ).toBe(1);
    expect(
      await prisma.jarvisLog.count({
        where: {
          sessionId: await app
            .get(ConversationService)
            .resolve('integration-user', 'fixture-todo'),
          toolName: 'todo.add',
        },
      }),
    ).toBe(1);
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 123, unexpected: true })
      .expect(400);
  });

  it('persists and confirms a calendar action using only the injected fake', async () => {
    const sessionId = await app
      .get(ConversationService)
      .resolve('integration-user', 'fixture-calendar');
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'Ajoute un rendez-vous demain à 18h', sessionId })
      .expect(201);
    const pending = await prisma.command.findFirstOrThrow({
      where: { conversationId: sessionId, state: 'waiting' },
    });
    expect(calendar.createEvent).not.toHaveBeenCalled();
    await Promise.all(
      Array.from({ length: 2 }, () =>
        request(baseUrl)
          .post('/jarvis/confirm')
          .set('Cookie', sessionCookie)
          .set('Origin', 'http://localhost:5173')
          .send({ actionId: pending.id, sessionId })
          .expect(201),
      ),
    );
    const saved = await prisma.command.findUniqueOrThrow({
      where: { id: pending.id },
    });
    const replay = await request(baseUrl)
      .post('/jarvis/confirm')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ actionId: pending.id, sessionId })
      .expect(201);
    const replayResponse = JarvisChatResponseSchema.parse(replay.body);
    const originalResponse = JarvisChatResponseSchema.parse(saved.response);
    expect(replayResponse.meta?.historyTurnId).toEqual(expect.any(String));
    expect(replayResponse).toEqual({
      ...originalResponse,
      meta: {
        ...originalResponse.meta,
        historyTurnId: replayResponse.meta?.historyTurnId,
        historySaved: true,
      },
    });
    const textReplay = await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'oui', sessionId })
      .expect(201);
    const textReplayResponse = JarvisChatResponseSchema.parse(textReplay.body);
    expect(textReplayResponse.meta?.historyTurnId).toEqual(expect.any(String));
    expect(textReplayResponse).toEqual({
      ...originalResponse,
      meta: {
        ...originalResponse.meta,
        historyTurnId: textReplayResponse.meta?.historyTurnId,
        historySaved: true,
      },
    });
    expect(textReplayResponse.meta?.historyTurnId).not.toBe(
      replayResponse.meta?.historyTurnId,
    );
    expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    expect(calendar.createEvent.mock.calls[0][0]).toBe(sessionId);
    expect(await prisma.pendingAction.count({ where: { sessionId } })).toBe(0);
    expect(
      await prisma.jarvisActionEvent.count({ where: { sessionId } }),
    ).toBeGreaterThan(0);
  });

  it('resumes an HTTP reply after label failure without sending twice', async () => {
    const ownerId = 'reply-http-user';
    await prisma.betaInvite.create({
      data: { email: `${ownerId}@example.invalid` },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        name: 'Reply',
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    const token = 'reply-http-token';
    await prisma.session.create({
      data: {
        id: token,
        token,
        userId: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const sessionId = await app
      .get(ConversationService)
      .resolve(ownerId, 'fixture-inbox');
    await app
      .get(GoogleCredentialService)
      .save(ownerId, 'reply-subject', sessionId, {
        refresh_token: 'fixture-token',
        scope: scopes,
      });
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    const draftPayload = {
      sessionId,
      messageId: 'fixture-message',
      text: 'Saved reply',
      version: 0,
    };
    await request(baseUrl)
      .post('/inbox-zero/reply-draft')
      .set('Cookie', cookie)
      .set('Origin', 'https://foreign.invalid')
      .send(draftPayload)
      .expect(403);
    const saved = await request(baseUrl)
      .post('/inbox-zero/reply-draft')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(draftPayload)
      .expect(201);
    expect((saved.body as { draft: { version: number } }).draft.version).toBe(
      1,
    );
    const loaded = await request(baseUrl)
      .get('/inbox-zero/reply-draft')
      .set('Cookie', cookie)
      .query({ sessionId, messageId: 'fixture-message' })
      .expect(200);
    expect((loaded.body as { draft: { text: string } }).draft.text).toBe(
      'Saved reply',
    );
    await request(baseUrl)
      .post('/inbox-zero/reply-draft')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ ...draftPayload, text: 'Stale overwrite' })
      .expect(409);
    const payload = {
      sessionId,
      action: 'send_reply',
      requestId: 'fixture-reply',
      messageIds: ['fixture-message'],
      replyText: 'Fixture reply',
      reviewedReply: {
        to: 'sender@example.invalid',
        subject: 'Re: Test question',
      },
      archiveAfter: false,
    };
    const before = gmail.sendMessage.mock.calls.length;
    const missingReview = { ...payload, reviewedReply: undefined };
    await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(missingReview)
      .expect(400);
    const changedReview = await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        ...payload,
        requestId: 'wrong-review',
        reviewedReply: {
          ...payload.reviewedReply,
          to: 'other@example.invalid',
        },
      })
      .expect(201);
    expect(
      (changedReview.body as { results: { ok: boolean }[] }).results[0].ok,
    ).toBe(false);
    expect(gmail.sendMessage.mock.calls.length).toBe(before);
    gmail.modifyLabels.mockRejectedValueOnce(
      new Error('Injected label failure'),
    );
    const first = await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send(payload)
      .expect(201);
    expect((first.body as { results: unknown[] }).results[0]).toMatchObject({
      ok: false,
      steps: { send: 'completed', labels: 'pending', local: 'pending' },
      providerReference: { messageId: 'fixture-sent-message' },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const resumed = await request(baseUrl)
        .post('/inbox-zero/apply')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send(payload)
        .expect(201);
      expect((resumed.body as { results: unknown[] }).results[0]).toMatchObject(
        {
          ok: true,
          steps: { send: 'completed', labels: 'completed', local: 'completed' },
        },
      );
    }
    expect(gmail.sendMessage.mock.calls.length).toBe(before + 1);
    expect(gmail.sendMessage.mock.calls[before][1].to).toBe(
      'sender@example.invalid',
    );
    const restored = await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        sessionId,
        action: 'restore_inbox',
        messageIds: ['fixture-message'],
      })
      .expect(201);
    expect(
      (restored.body as { results: { outcome: string }[] }).results[0].outcome,
    ).toBe('completed');
    expect(gmail.modifyLabels).toHaveBeenLastCalledWith(
      sessionId,
      'fixture-message',
      ['INBOX'],
      [],
    );
    expect(
      (
        await prisma.inboxZeroItem.findFirstOrThrow({
          where: { sessionId, messageId: 'fixture-message' },
        })
      ).status,
    ).toBe('pending');
    const labelsBefore = gmail.modifyLabels.mock.calls.length;
    gmail.sendMessage.mockRejectedValueOnce(new Error('Send timeout'));
    for (let attempt = 0; attempt < 2; attempt++) {
      const uncertain = await request(baseUrl)
        .post('/inbox-zero/apply')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ ...payload, requestId: 'uncertain-reply' })
        .expect(201);
      expect(
        (uncertain.body as { results: unknown[] }).results[0],
      ).toMatchObject({ ok: false, steps: { send: 'unknown' } });
    }
    expect(gmail.sendMessage.mock.calls.length).toBe(before + 2);
    expect(gmail.modifyLabels.mock.calls.length).toBe(labelsBefore);
  });

  it('journals equivalent chat and Inbox archives with the same durable outcome', async () => {
    const conversations = app.get(ConversationService);
    const chatId = await conversations.resolve(
      'integration-user',
      'archive-chat',
    );
    const inboxId = await conversations.resolve(
      'integration-user',
      'archive-inbox',
    );
    await seedGoogle(chatId);
    const before = gmail.modifyLabels.mock.calls.length;
    for (const text of ['Liste mes emails', 'Archive email #1']) {
      await request(baseUrl)
        .post('/jarvis/chat')
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://localhost:5173')
        .send({ sessionId: chatId, text })
        .expect(201);
    }
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId: inboxId })
      .expect(201);
    await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        sessionId: inboxId,
        action: 'archive',
        messageIds: ['fixture-message'],
      })
      .expect(201);
    expect(gmail.modifyLabels.mock.calls.slice(before)).toEqual([
      [chatId, 'fixture-message', [], ['INBOX']],
      [inboxId, 'fixture-message', [], ['INBOX']],
    ]);
    for (const [conversationId, source] of [
      [chatId, 'chat'],
      [inboxId, 'inbox'],
    ]) {
      const command = await prisma.command.findFirstOrThrow({
        where: { conversationId, toolName: 'gmail.archive' },
      });
      expect(command).toMatchObject({
        source,
        state: 'completed',
        outcomeCode: 'COMPLETED',
      });
      expect(command.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'fixture-message' }),
        ]),
      );
    }
  });

  it('requires a fresh Inbox scan after a Google account change or a legacy unbound scan', async () => {
    const ownerId = 'origin-inbox-user';
    await prisma.betaInvite.create({
      data: { email: `${ownerId}@example.invalid` },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        name: 'Origin',
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    const token = 'origin-inbox-session-token';
    await prisma.session.create({
      data: {
        id: token,
        token,
        userId: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const sessionId = await app
      .get(ConversationService)
      .resolve(ownerId, 'origin-inbox');
    await app
      .get(GoogleCredentialService)
      .save(ownerId, 'origin-subject', sessionId, {
        refresh_token: 'fixture-token',
        scope: scopes,
      });
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    const account = await prisma.integrationAccount.findFirstOrThrow({
      where: { ownerId, provider: 'google' },
    });
    const modifications = gmail.modifyLabels.mock.calls.length;
    try {
      await prisma.integrationAccount.update({
        where: { id: account.id },
        data: { providerSubject: 'replacement-subject' },
      });
      const changed = await request(baseUrl)
        .post('/inbox-zero/apply')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ sessionId, action: 'archive', messageIds: ['fixture-message'] })
        .expect(201);
      expect(
        (changed.body as { results: { ok: boolean }[] }).results[0].ok,
      ).toBe(false);
    } finally {
      await prisma.integrationAccount.update({
        where: { id: account.id },
        data: { providerSubject: account.providerSubject },
      });
    }
    await prisma.inboxZeroItem.updateMany({
      where: { sessionId },
      data: { googleAccountId: null, googleAccountSubject: null },
    });
    const legacy = await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId, action: 'archive', messageIds: ['fixture-message'] })
      .expect(201);
    expect((legacy.body as { results: { ok: boolean }[] }).results[0].ok).toBe(
      false,
    );
    expect(gmail.modifyLabels.mock.calls.length).toBe(modifications);
    expect(
      await prisma.command.count({ where: { conversationId: sessionId } }),
    ).toBe(0);
  });

  it('simulates Inbox mutations without touching providers or marking messages processed', async () => {
    const sessionId = await app
      .get(ConversationService)
      .resolve('integration-user', 'simulation-inbox');
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    const before = await prisma.inboxZeroItem.findMany({
      where: { sessionId },
    });
    const sends = gmail.sendMessage.mock.calls.length;
    const modifications = gmail.modifyLabels.mock.calls.length;
    const config = app.get(ConfigService);
    const previous = config.get<string>('SIMULATION');
    config.set('SIMULATION', 'true');
    try {
      const response = await request(baseUrl)
        .post('/inbox-zero/apply')
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://localhost:5173')
        .send({
          sessionId,
          action: 'send_reply',
          requestId: 'simulation-reply',
          messageIds: ['fixture-message'],
          replyText: 'Simulation seulement',
          reviewedReply: {
            to: 'sender@example.invalid',
            subject: 'Re: Test question',
          },
        })
        .expect(201);
      expect((response.body as { results: unknown[] }).results).toEqual([
        {
          messageId: 'fixture-message',
          ok: true,
          simulated: true,
          outcome: 'simulated',
        },
      ]);
      expect(
        await prisma.inboxZeroItem.findMany({ where: { sessionId } }),
      ).toEqual(before);
      expect(gmail.sendMessage.mock.calls.length).toBe(sends);
      expect(
        await prisma.inboxReplyOperation.count({
          where: { conversationId: sessionId },
        }),
      ).toBe(0);
      expect(gmail.modifyLabels.mock.calls.length).toBe(modifications);
      const audit = await prisma.inboxZeroAction.findFirstOrThrow({
        where: { sessionId },
      });
      expect(audit.status).toBe('simulated');
    } finally {
      config.set('SIMULATION', previous);
    }
  });

  it('rejects revoked permissions and deferred Inbox operations before any provider mutation', async () => {
    const sessionId = await app
      .get(ConversationService)
      .resolve('integration-user', 'revoked-inbox');
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/inbox-zero/scan')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    await prisma.googleOAuthToken.updateMany({
      where: { integrationAccount: { ownerId: 'integration-user' } },
      data: { scope: 'https://www.googleapis.com/auth/gmail.readonly' },
    });
    const modifications = gmail.modifyLabels.mock.calls.length;
    const deletes = gmail.deleteMessage.mock.calls.length;
    for (const action of ['archive', 'delete']) {
      const response = await request(baseUrl)
        .post('/inbox-zero/apply')
        .set('Cookie', sessionCookie)
        .set('Origin', 'http://localhost:5173')
        .send({ sessionId, action, messageIds: ['fixture-message'] })
        .expect(201);
      expect(
        (response.body as { results: Array<{ ok: boolean }> }).results[0].ok,
      ).toBe(false);
    }
    expect(gmail.modifyLabels.mock.calls.length).toBe(modifications);
    expect(gmail.deleteMessage.mock.calls.length).toBe(deletes);
    expect(
      (await prisma.inboxZeroItem.findFirstOrThrow({ where: { sessionId } }))
        .status,
    ).toBe('pending');
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
  it('mounts the ESM auth handler after bounded body parsing', async () => {
    await request(baseUrl).get('/api/auth/ok').expect(200, { ok: true });
    await request(baseUrl)
      .post('/api/auth/sign-in/social')
      .set('Origin', 'http://localhost:5173')
      .send({ provider: 'unconfigured' })
      .expect(404);
  });

  it('keeps the private endpoint inventory aligned with the security matrix', () => {
    const routes: string[] = [];
    const reflector = app.get(Reflector);
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        const prefix = reflector.get<string>(PATH_METADATA, controller) ?? '';
        const prototype = controller.prototype as object;
        for (const descriptor of Object.values(
          Object.getOwnPropertyDescriptors(prototype),
        )) {
          const handler: unknown = descriptor.value;
          if (typeof handler !== 'function') continue;
          const method = reflector.get<RequestMethod | undefined>(
            METHOD_METADATA,
            handler,
          );
          if (
            method === undefined ||
            reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT, [
              handler,
              controller,
            ])
          )
            continue;
          const path = reflector.get<string>(PATH_METADATA, handler) ?? '';
          routes.push(
            `${RequestMethod[method]} /${[prefix, path].filter((part) => part && part !== '/').join('/')}`,
          );
        }
      }
    }
    expect(routes.sort()).toEqual(
      [
        'GET /account/privacy',
        'GET /account/me',
        'GET /account/export/snapshot',
        'GET /account/export/profile',
        'GET /account/export/data',
        'GET /account/preferences',
        'GET /account/memory',
        'POST /account/memory',
        'POST /account/memory/:id',
        'POST /account/memory/:id/forget',
        'GET /home',
        'GET /home/discover',
        'POST /home/connect',
        'POST /home/disconnect',
        'POST /home/entities',
        'GET /auth/google',
        'GET /auth/google/callback',
        'GET /auth/google/status',
        'GET /inbox-zero/message',
        'GET /inbox-zero/reply-draft',
        'POST /inbox-zero/reply-draft',
        'GET /inbox-zero/session',
        'GET /jarvis/history',
        'GET /jarvis/activity',
        'GET /jarvis/status',
        'GET /today',
        'POST /account/deletion',
        'POST /account/preferences',
        'POST /auth/google/disconnect',
        'POST /inbox-zero/apply',
        'POST /inbox-zero/draft-reply',
        'POST /inbox-zero/scan',
        'POST /inbox-zero/step',
        'POST /jarvis/chat',
        'POST /jarvis/confirm',
        'POST /jarvis/status/refresh',
        'POST /today/mutations',
      ].sort(),
    );
  });

  it('executes direct task and note controls without model routing and replays creation', async () => {
    const sessionId = 'today-http';
    const ownerId = 'today-http-owner';
    await prisma.user.create({
      data: {
        id: ownerId,
        name: 'Today HTTP',
        email: 'today-http@example.invalid',
        emailVerified: true,
      },
    });
    await prisma.betaInvite.create({
      data: { email: 'today-http@example.invalid' },
    });
    const token = 'today-http-session-token';
    await prisma.session.create({
      data: {
        id: 'today-http-session',
        token,
        userId: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const todayCookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;

    const modelCalls = model.mock.calls.length;
    const text = `Today ${randomUUID()}`;
    const create = {
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.create', text },
    };
    const post = (body: object) =>
      request(baseUrl)
        .post('/today/mutations')
        .set('Cookie', todayCookie)
        .set('Origin', 'http://localhost:5173')
        .send(body);
    const first = await post(create).expect(201);
    const replay = await post(create).expect(201);
    expect(replay.body).toEqual(first.body);
    const task = await prisma.todo.findFirstOrThrow({
      where: { ownerId, text },
    });
    expect(await prisma.todo.count({ where: { ownerId, text } })).toBe(1);
    const duplicate = await prisma.todo.create({ data: { ownerId, text } });
    const foreign = await prisma.todo.create({
      data: { ownerId: 'integration-user', text },
    });
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.complete', id: foreign.id },
    }).expect(404);
    expect(
      (await prisma.todo.findUniqueOrThrow({ where: { id: foreign.id } })).done,
    ).toBe(false);
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.edit', id: task.id, text: `${text} edited` },
    }).expect(201);
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.complete', id: task.id },
    }).expect(201);
    expect(
      (await prisma.todo.findUniqueOrThrow({ where: { id: task.id } })).done,
    ).toBe(true);
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.reopen', id: task.id },
    }).expect(201);
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'note.create', title: 'Title', text },
    }).expect(201);
    expect(
      await prisma.todo.findUniqueOrThrow({ where: { id: duplicate.id } }),
    ).toMatchObject({ text, done: false });
    const note = await prisma.note.findFirstOrThrow({
      where: { ownerId, text },
    });
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: {
        operation: 'note.edit',
        id: note.id,
        title: null,
        text: 'Changed body',
      },
    }).expect(201);
    expect(
      await prisma.note.findUniqueOrThrow({ where: { id: note.id } }),
    ).toMatchObject({ title: null, text: 'Changed body' });
    await post({
      sessionId,
      requestId: randomUUID(),
      mutation: { operation: 'task.complete', id: randomUUID() },
    }).expect(404);
    await request(baseUrl)
      .post('/today/mutations')
      .set('Cookie', todayCookie)
      .send(create)
      .expect(403);
    await post({ ...create, ownerId: 'other' }).expect(400);
    await request(baseUrl)
      .get('/today')
      .set('Cookie', todayCookie)
      .query({ sessionId })
      .expect(200);
    expect(model.mock.calls.length).toBe(modelCalls);
    expect(
      await prisma.commandCompensation.count({
        where: {
          command: {
            ownerId,
            source: 'direct',
            conversation: { clientKey: sessionId },
          },
        },
      }),
    ).toBe(6);
  });

  it('separates passive status from an explicit authenticated provider refresh without invoking a model', async () => {
    const sessionId = 'status-cache-http';
    const mailCalls = gmail.listMessages.mock.calls.length;
    const calendarCalls = calendar.listEventsInterval.mock.calls.length;
    const model = jest.spyOn(OllamaProvider.prototype, 'chat');
    const modelCalls = model.mock.calls.length;
    const passive = await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .query({ sessionId })
      .expect(200);
    const first = JarvisStatusSnapshotSchema.parse(passive.body);
    expect(first.availability.gmail).toBe('not_refreshed');
    expect(first.freshness.gmail.fetchedAt).toBeNull();
    expect(gmail.listMessages.mock.calls.length).toBe(mailCalls);
    expect(calendar.listEventsInterval.mock.calls.length).toBe(calendarCalls);
    const refreshed = await request(baseUrl)
      .post('/jarvis/status/refresh')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    const next = JarvisStatusSnapshotSchema.parse(refreshed.body);
    expect(next.availability.gmail).toBe('available');
    expect(next.freshness.gmail.fetchedAt).not.toBeNull();
    expect(gmail.listMessages.mock.calls.length).toBe(mailCalls + 1);
    expect(calendar.listEventsInterval.mock.calls.length).toBe(
      calendarCalls + 1,
    );
    const cached = await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .query({ sessionId })
      .expect(200);
    expect(JarvisStatusSnapshotSchema.parse(cached.body).freshness).toEqual(
      next.freshness,
    );
    expect(gmail.listMessages.mock.calls.length).toBe(mailCalls + 1);
    expect(calendar.listEventsInterval.mock.calls.length).toBe(
      calendarCalls + 1,
    );
    expect(model.mock.calls.length).toBe(modelCalls);
    await request(baseUrl)
      .post('/jarvis/status/refresh')
      .set('Cookie', sessionCookie)
      .send({ sessionId })
      .expect(403);
  });

  it('rejects anonymous and conversation-ID-only access to every private endpoint', async () => {
    for (const path of [
      '/account/privacy',
      '/account/me',
      '/account/export/snapshot',
      '/account/export/profile',
      '/account/export/data?collection=notes',
      '/account/preferences',
      '/account/memory',
      '/home',
      '/home/discover',
      '/today',
      '/jarvis/history',
      '/jarvis/activity',
      '/jarvis/status',
      '/inbox-zero/session',
      '/inbox-zero/message',
      '/inbox-zero/reply-draft',
      '/auth/google',
      '/auth/google/status',
      '/auth/google/callback',
    ]) {
      await request(baseUrl)
        .get(path)
        .query({ sessionId: 'integration-session', userId: 'integration-user' })
        .set('X-User-Id', 'integration-user')
        .expect(401);
    }
    for (const path of [
      '/account/deletion',
      '/account/preferences',
      '/account/memory',
      '/account/memory/any-id',
      '/account/memory/any-id/forget',
      '/home/connect',
      '/home/disconnect',
      '/home/entities',
      '/auth/google/disconnect',
      '/jarvis/chat',
      '/jarvis/confirm',
      '/today/mutations',
      '/jarvis/status/refresh',
      '/inbox-zero/scan',
      '/inbox-zero/step',
      '/inbox-zero/reply-draft',
      '/inbox-zero/apply',
      '/inbox-zero/draft-reply',
    ]) {
      await request(baseUrl)
        .post(path)
        .set('Origin', 'http://localhost:5173')
        .send({ sessionId: 'integration-session' })
        .expect(401);
    }
  });

  it('exports only signed-owner data with bounded pagination and conversation ownership', async () => {
    const ownerId = 'export-user';
    await prisma.betaInvite.create({
      data: { email: 'export@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        name: 'Export',
        email: 'export@example.invalid',
        emailVerified: true,
      },
    });
    const token = 'export-session-secret-not-exportable';
    await prisma.session.create({
      data: {
        id: 'export-auth-session',
        userId: ownerId,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const noteIds = Array.from({ length: 51 }, () => randomUUID()).sort();
    await prisma.note.createMany({
      data: noteIds.map((id) => ({ id, ownerId, text: 'Owned note' })),
    });
    const foreignNote = await prisma.note.create({
      data: { ownerId: 'integration-user', text: 'Foreign private note' },
    });
    const profileResponse = await request(baseUrl)
      .get('/account/export/profile')
      .set('Cookie', cookie)
      .expect(200);
    const profile = AccountProfileExportSchema.parse(profileResponse.body);
    expect(profile.profile.id).toBe(ownerId);
    expect(JSON.stringify(profile)).not.toContain(token);
    const firstResponse = await request(baseUrl)
      .get('/account/export/data')
      .query({ collection: 'notes' })
      .set('Cookie', cookie)
      .expect(200);
    const first = AccountDataExportPageSchema.parse(firstResponse.body);
    expect(first.items.map((item: { id: string }) => item.id)).toEqual(
      noteIds.slice(0, 50),
    );
    expect(first.nextCursor).toBe(noteIds[49]);
    const lastResponse = await request(baseUrl)
      .get('/account/export/data')
      .query({ collection: 'notes', after: first.nextCursor })
      .set('Cookie', cookie)
      .expect(200);
    const last = AccountDataExportPageSchema.parse(lastResponse.body);
    expect(last.items.map((item: { id: string }) => item.id)).toEqual(
      noteIds.slice(50),
    );
    expect(last.nextCursor).toBeNull();
    expect(
      [...first.items, ...last.items].some(
        (item) => item.id === foreignNote.id,
      ),
    ).toBe(false);
    for (const query of [
      { collection: 'notes', ownerId: 'integration-user' },
      { collection: 'notes', after: 'not-a-uuid' },
      { collection: 'tokens' },
    ]) {
      await request(baseUrl)
        .get('/account/export/data')
        .query(query)
        .set('Cookie', cookie)
        .expect(400);
    }
    const conversation = await prisma.conversation.create({
      data: { ownerId, clientKey: 'export-conversation' },
    });
    const foreignConversation = await prisma.conversation.create({
      data: {
        ownerId: 'integration-user',
        clientKey: 'foreign-export-conversation',
      },
    });
    const memory = await prisma.jarvisMemoryFact.create({
      data: {
        sessionId: conversation.id,
        layer: 'preference',
        key: 'export',
        label: 'Préférence',
        value: 'Owned memory',
      },
    });
    await prisma.jarvisMemoryFact.create({
      data: {
        sessionId: foreignConversation.id,
        layer: 'preference',
        key: 'export',
        label: 'Secret',
        value: 'Foreign memory',
      },
    });
    const memoryResponse = await request(baseUrl)
      .get('/account/export/data')
      .query({ collection: 'memory' })
      .set('Cookie', cookie)
      .expect(200);
    const memoryPage = AccountDataExportPageSchema.parse(memoryResponse.body);
    expect(memoryPage.collection).toBe('memory');
    expect(memoryPage.items.map((item: { id: string }) => item.id)).toEqual([
      memory.id,
    ]);
    expect(JSON.stringify(memoryPage)).not.toContain('Foreign memory');
    const download = await request(baseUrl)
      .get('/account/export/snapshot')
      .set('Cookie', cookie)
      .expect(200);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['content-type']).toContain('application/x-ndjson');
    const records = download.text
      .trim()
      .split('\n')
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            collection?: string;
            data?: Record<string, unknown>;
            records?: number;
          },
      );
    expect(records[0]).toMatchObject({
      type: 'header',
      accountId: ownerId,
      formatVersion: 1,
    });
    expect(records.at(-1)).toEqual({
      type: 'complete',
      records: records.length - 2,
    });
    expect(
      records
        .filter((record) => record.collection === 'Note')
        .map((record) => record.data?.id)
        .sort(),
    ).toEqual(noteIds);
    expect(download.text).not.toContain(token);
    expect(download.text).not.toContain('Foreign memory');
    expect(download.text).not.toContain('Foreign private note');
    expect(
      records.some((record) =>
        [
          'GoogleOAuthToken',
          'GoogleOAuthState',
          'Verification',
          'LegacyOwnershipBatch',
        ].includes(record.collection ?? ''),
      ),
    ).toBe(false);

    const snapshotRecords: Array<{
      collection?: string;
      data?: Record<string, unknown>;
    }> = [];
    await app.get(AccountSnapshotService).stream(
      ownerId,
      async (value) => {
        const record = value as {
          type: string;
          collection?: string;
          data?: Record<string, unknown>;
        };
        if (record.type === 'header') {
          // A different connection commits after MVCC begins, before Note is scanned.
          await prisma.note.update({
            where: { id: noteIds[0] },
            data: { text: 'Changed during export' },
          });
          await prisma.note.create({
            data: { ownerId, text: 'Inserted during export' },
          });
        }
        snapshotRecords.push(record);
      },
      new AbortController().signal,
    );
    const snapshotNotes = snapshotRecords.filter(
      (record) => record.collection === 'Note',
    );
    expect(snapshotNotes).toHaveLength(51);
    expect(
      snapshotNotes.find((record) => record.data?.id === noteIds[0])?.data
        ?.text,
    ).toBe('Owned note');
    expect(
      snapshotNotes.some(
        (record) => record.data?.text === 'Inserted during export',
      ),
    ).toBe(false);
  });

  it('persists only authenticated account preferences and rejects identity overrides', async () => {
    await prisma.betaInvite.create({
      data: { email: 'preferences@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: 'preferences-user',
        name: 'Preferences',
        email: 'preferences@example.invalid',
        emailVerified: true,
      },
    });
    const token = 'preferences-session-token';
    await prisma.session.create({
      data: {
        id: 'preferences-session',
        token,
        userId: 'preferences-user',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const preferencesCookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const preferences = {
      displayTimezone: 'America/Montreal',
      theme: 'light',
      onboardingCompleted: true,
    };
    await request(baseUrl)
      .post('/account/preferences')
      .set('Cookie', preferencesCookie)
      .set('Origin', 'https://evil.invalid')
      .send(preferences)
      .expect(403);
    await request(baseUrl)
      .post('/account/preferences')
      .set('Cookie', preferencesCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ ...preferences, ownerId: 'other-owner' })
      .expect(400);
    await request(baseUrl)
      .post('/account/preferences')
      .set('Cookie', preferencesCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ ...preferences, displayTimezone: 'Invalid/Zone' })
      .expect(400);
    await request(baseUrl)
      .post('/account/preferences')
      .set('Cookie', preferencesCookie)
      .set('Origin', 'http://localhost:5173')
      .send(preferences)
      .expect(201, preferences);
    await request(baseUrl)
      .get('/account/preferences')
      .set('Cookie', preferencesCookie)
      .query({ userId: 'other-owner' })
      .expect(200, preferences);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: 'preferences-user' },
        select: {
          displayTimezone: true,
          theme: true,
          onboardingCompleted: true,
        },
      }),
    ).toEqual(preferences);
  });

  it('manages personal facts only for the authenticated account', async () => {
    async function signedIn(id: string) {
      await prisma.betaInvite.create({
        data: { email: `${id}@example.invalid` },
      });
      await prisma.user.create({
        data: {
          id,
          name: id,
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
      const token = `${id}-token`;
      await prisma.session.create({
        data: {
          id: `${id}-session`,
          token,
          userId: id,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const signature = createHmac('sha256', process.env.AUTH_SECRET!)
        .update(token)
        .digest('base64');
      return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    }
    const alice = await signedIn('memory-http-alice');
    const bob = await signedIn('memory-http-bob');
    const origin = 'http://localhost:5173';
    await request(baseUrl)
      .post('/account/memory')
      .set('Cookie', alice)
      .set('Origin', 'https://evil.invalid')
      .send({ text: 'Refusé' })
      .expect(403);
    await request(baseUrl)
      .post('/account/memory')
      .set('Cookie', alice)
      .set('Origin', origin)
      .send({ text: 'Avec propriétaire', ownerId: 'memory-http-bob' })
      .expect(400);
    await request(baseUrl)
      .post('/account/memory')
      .set('Cookie', alice)
      .set('Origin', origin)
      .send({ text: 'Ligne\nmultiple' })
      .expect(400);
    const created = await request(baseUrl)
      .post('/account/memory')
      .set('Cookie', alice)
      .set('Origin', origin)
      .send({ text: 'Je travaille le mardi à distance' })
      .expect(201);
    const fact = created.body as { id: string; origin: string };
    expect(fact.origin).toBe('settings');
    await request(baseUrl)
      .get('/account/memory')
      .set('Cookie', bob)
      .expect(200, { facts: [] });
    await request(baseUrl)
      .post(`/account/memory/${fact.id}`)
      .set('Cookie', bob)
      .set('Origin', origin)
      .send({ text: 'Modifié par Bob' })
      .expect(404);
    await request(baseUrl)
      .post(`/account/memory/${fact.id}/forget`)
      .set('Cookie', bob)
      .set('Origin', origin)
      .expect(404);
    await request(baseUrl)
      .post(`/account/memory/${fact.id}`)
      .set('Cookie', alice)
      .set('Origin', origin)
      .send({ text: 'Je travaille le mardi et le jeudi à distance' })
      .expect(201);
    const listed = await request(baseUrl)
      .get('/account/memory')
      .set('Cookie', alice)
      .expect(200);
    expect((listed.body as { facts: Array<{ text: string }> }).facts).toEqual([
      expect.objectContaining({
        text: 'Je travaille le mardi et le jeudi à distance',
      }),
    ]);
    await request(baseUrl)
      .post(`/account/memory/${fact.id}/forget`)
      .set('Cookie', alice)
      .set('Origin', origin)
      .expect(201, { facts: [] });
  });

  it('rejects cross-origin and originless mutations even with a valid cookie', async () => {
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .send({})
      .expect(403);
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .set('Origin', 'https://evil.invalid')
      .send({})
      .expect(403);
    await request(baseUrl)
      .post('/api/auth/sign-out')
      .set('Cookie', sessionCookie)
      .set('Origin', 'https://evil.invalid')
      .send({})
      .expect(403);
  });

  it('rejects tampered, expired and revoked sessions', async () => {
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie + 'tampered')
      .expect(401);
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: 'integration-session' },
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(0) },
    });
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .expect(401);
    // The library may remove an expired session when it is read.
    await prisma.session.upsert({
      where: { id: session.id },
      create: session,
      update: { expiresAt: session.expiresAt },
    });
    await prisma.betaInvite.update({
      where: { email: 'integration@example.invalid' },
      data: { revokedAt: new Date() },
    });
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .expect(401);
    await prisma.betaInvite.update({
      where: { email: 'integration@example.invalid' },
      data: { revokedAt: null },
    });
    await prisma.user.update({
      where: { id: 'integration-user' },
      data: { disabled: true },
    });
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .expect(401);
    await prisma.user.update({
      where: { id: 'integration-user' },
      data: { disabled: false },
    });
    await prisma.session.delete({ where: { id: session.id } });
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .expect(401);
    await prisma.session.create({ data: session });
  });

  it('accepts only invited verified Google callbacks using local token and JWKS fixtures', async () => {
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: 'fixture-google-key',
      alg: 'RS256',
      use: 'sig',
    };
    const config = {
      ...readAuthConfig(process.env),
      google: {
        clientId: 'fixture-client',
        clientSecret: 'fixture-client-secret',
      },
    };
    const auth = await createAuth(prisma, config);
    const fetchMock = jest.mocked(globalThis.fetch);
    const previousFetch = fetchMock.getMockImplementation();
    try {
      for (const [email, verified, invited] of [
        ['uninvited@example.invalid', true, false],
        ['unverified@example.invalid', false, true],
        ['admitted@example.invalid', true, true],
      ] as const) {
        if (invited) await prisma.betaInvite.create({ data: { email } });
        const start = await auth.handler(
          new Request('http://localhost:3000/api/auth/sign-in/social', {
            method: 'POST',
            headers: {
              origin: 'http://localhost:5173',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              provider: 'google',
              callbackURL: 'http://localhost:5173/',
            }),
          }),
        );
        expect(start.status).toBe(200);
        const payload = (await start.json()) as { url: string };
        const authorization = new URL(payload.url);
        const token = await new SignJWT({
          email,
          email_verified: verified,
          name: 'Callback fixture',
          nonce: authorization.searchParams.get('nonce') ?? undefined,
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'fixture-google-key' })
          .setSubject(email)
          .setIssuer('https://accounts.google.com')
          .setAudience('fixture-client')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey);
        fetchMock.mockImplementation((input) => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          if (url === 'https://oauth2.googleapis.com/token')
            return Promise.resolve(
              Response.json({
                access_token: 'fixture-access-token',
                token_type: 'Bearer',
                expires_in: 3600,
                id_token: token,
              }),
            );
          if (url === 'https://www.googleapis.com/oauth2/v3/certs')
            return Promise.resolve(Response.json({ keys: [jwk] }));
          return Promise.reject(
            new Error('External fetch disabled: unexpected fixture endpoint'),
          );
        });
        const cookie = start.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ');
        const callbackURL = new URL(
          'http://localhost:3000/api/auth/callback/google',
        );
        callbackURL.searchParams.set('code', 'fixture-code');
        callbackURL.searchParams.set(
          'state',
          authorization.searchParams.get('state')!,
        );
        const callback = await auth.handler(
          new Request(callbackURL, { headers: { cookie } }),
        );
        expect(callback.status).toBe(302);
        const user = await prisma.user.findUnique({ where: { email } });
        if (verified && invited) {
          expect(callback.headers.get('location')).toBe(
            'http://localhost:5173/',
          );
          expect(user).not.toBeNull();
          expect(
            await prisma.session.count({ where: { userId: user!.id } }),
          ).toBe(1);
          const cookies = callback.headers.getSetCookie().join('; ');
          expect(cookies).toContain('HttpOnly');
          expect(cookies).toContain('SameSite=Lax');
          const account = await prisma.account.findFirstOrThrow({
            where: { userId: user!.id },
          });
          expect([
            account.accessToken,
            account.refreshToken,
            account.idToken,
          ]).toEqual([null, null, null]);
        } else {
          expect(callback.headers.get('location')).toContain('error=');
          expect(user).toBeNull();
        }
      }
    } finally {
      if (previousFetch) fetchMock.mockImplementation(previousFetch);
    }
  });

  it('rejects a callback with missing OAuth state without creating an account', async () => {
    const before = await prisma.user.count();
    const response = await request(baseUrl)
      .get('/api/auth/callback/google')
      .query({ code: 'fake-code' });
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('error=');
    expect(await prisma.user.count()).toBe(before);
  });

  it('refuses another owner’s conversation across HTTP surfaces and keeps shared browser aliases separate', async () => {
    await prisma.betaInvite.create({
      data: { email: 'second@example.invalid' },
    });
    await prisma.user.create({
      data: {
        id: 'second-user',
        name: 'Second',
        email: 'second@example.invalid',
        emailVerified: true,
      },
    });
    const token = 'second-user-session-token';
    await prisma.session.create({
      data: {
        id: 'second-session',
        token,
        userId: 'second-user',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const signature = createHmac('sha256', process.env.AUTH_SECRET!)
      .update(token)
      .digest('base64');
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const resolver = app.get(ConversationService);
    const first = await resolver.resolve(
      'integration-user',
      'same-browser-alias',
    );
    const second = await resolver.resolve('second-user', 'same-browser-alias');
    expect(first).not.toBe(second);
    await prisma.todo.create({
      data: { ownerId: 'second-user', text: 'second-user-private-task' },
    });
    const status = await request(baseUrl)
      .get('/jarvis/status')
      .query({ sessionId: second })
      .set('Cookie', cookie)
      .expect(200);
    expect(
      (status.body as { metrics: { openTodos: number } }).metrics.openTodos,
    ).toBe(1);
    const activity = await request(baseUrl)
      .get('/jarvis/activity')
      .query({ sessionId: second, limit: 1 })
      .set('Cookie', cookie)
      .expect(200);
    expect(activity.body).toMatchObject({
      conversationId: second,
      commands: [],
      nextCursor: null,
    });
    await request(baseUrl)
      .get('/jarvis/activity')
      .query({ sessionId: second, cursor: 'missing-command', limit: 1 })
      .set('Cookie', cookie)
      .expect(404);
    for (const path of [
      '/today',
      '/jarvis/history',
      '/jarvis/activity',
      '/jarvis/status',
      '/inbox-zero/session',
      '/inbox-zero/message',
      '/inbox-zero/reply-draft',
      '/auth/google',
      '/auth/google/status',
    ]) {
      await request(baseUrl)
        .get(path)
        .query(
          path === '/inbox-zero/message' || path === '/inbox-zero/reply-draft'
            ? { sessionId: first, messageId: 'fixture-message' }
            : { sessionId: first },
        )
        .set('Cookie', cookie)
        .expect(404);
    }
    await request(baseUrl)
      .post('/today/mutations')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({
        sessionId: first,
        requestId: randomUUID(),
        mutation: { operation: 'task.create', text: 'Foreign' },
      })
      .expect(404);
    await request(baseUrl)
      .post('/jarvis/status/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId: first })
      .expect(404);
    await request(baseUrl)
      .post('/jarvis/confirm')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId: first, actionId: 'known-foreign-action' })
      .expect(404);
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId: first, text: 'liste mes tâches' })
      .expect(404);
    for (const [path, body] of [
      ['/inbox-zero/scan', { query: 'in:inbox' }],
      ['/inbox-zero/step', { step: 'urgent' }],
      [
        '/inbox-zero/apply',
        { action: 'archive', messageIds: ['fixture-message'] },
      ],
      ['/inbox-zero/draft-reply', { messageId: 'fixture-message' }],
      [
        '/inbox-zero/reply-draft',
        { messageId: 'fixture-message', text: 'Draft', version: 0 },
      ],
    ] as const) {
      await request(baseUrl)
        .post(path)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .send({ ...body, sessionId: first })
        .expect(404);
    }
    const pending = await prisma.pendingAction.create({
      data: {
        sessionId: first,
        name: 'todo.delete',
        argsJson: JSON.stringify({ query: 'private-task' }),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await request(baseUrl)
      .post('/jarvis/confirm')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId: second, actionId: pending.id })
      .expect(404);
    expect(
      await prisma.pendingAction.findUnique({ where: { id: pending.id } }),
    ).not.toBeNull();
    const pendingState = await app.get(OAuthStateService).create({
      ownerId: 'integration-user',
      authSessionId: 'integration-session',
      conversationId: first,
    });
    await request(baseUrl)
      .get('/auth/google/callback')
      .query({ code: 'foreign-code', state: pendingState.state })
      .set('Cookie', cookie)
      .expect(400);
    expect(
      await app
        .get(OAuthStateService)
        .consume(pendingState.state, 'integration-user', 'integration-session'),
    ).not.toBeNull();
    const me = await request(baseUrl)
      .get('/account/me')
      .query({ userId: 'integration-user' })
      .set('X-User-Id', 'integration-user')
      .set('Cookie', cookie)
      .expect(200);
    expect(me.body).toEqual({
      id: 'second-user',
      name: 'Second',
      email: 'second@example.invalid',
    });
    await seedGoogle(first);
    const firstAccount = await prisma.integrationAccount.findFirstOrThrow({
      where: { ownerId: 'integration-user' },
    });
    await request(baseUrl)
      .post('/auth/google/disconnect')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({ ownerId: 'integration-user' })
      .expect(201);
    expect(
      await prisma.integrationAccount.findUnique({
        where: { id: firstAccount.id },
      }),
    ).not.toBeNull();
    await request(baseUrl)
      .get('/inbox-zero/session')
      .query({ sessionId: 'same-browser-alias' })
      .set('Cookie', cookie)
      .expect(200);
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: second } }))
        .ownerId,
    ).toBe('second-user');
    await request(baseUrl)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200);
    await request(baseUrl).get('/account/me').set('Cookie', cookie).expect(401);
    await request(baseUrl)
      .get('/account/me')
      .set('Cookie', sessionCookie)
      .expect(200);
  });

  it('disconnects only the authenticated Google account behind the origin guard', async () => {
    await seedGoogle('disconnect-fixture');
    await request(baseUrl)
      .post('/auth/google/disconnect')
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(401);
    await request(baseUrl)
      .post('/auth/google/disconnect')
      .set('Cookie', sessionCookie)
      .set('Origin', 'https://untrusted.invalid')
      .send({})
      .expect(403);
    const response = await request(baseUrl)
      .post('/auth/google/disconnect')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ ownerId: 'second-user' })
      .expect(201);
    expect(response.body).toEqual({
      connected: false,
      revocationPending: true,
    });
    expect(
      await prisma.integrationAccount.findFirst({
        where: { ownerId: 'integration-user' },
      }),
    ).toBeNull();
    expect(
      await prisma.session.findUnique({ where: { id: 'integration-session' } }),
    ).not.toBeNull();
    await request(baseUrl)
      .post('/auth/google/disconnect')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(201, { connected: false, revocationPending: false });
  });

  it('logs out through the auth library and clears subsequent access', async () => {
    const response = await request(baseUrl)
      .post('/api/auth/sign-out')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('Max-Age=0')]),
    );
    await request(baseUrl)
      .get('/jarvis/status')
      .set('Cookie', sessionCookie)
      .expect(401);
    expect(
      await prisma.session.findUnique({ where: { id: 'integration-session' } }),
    ).toBeNull();
  });
});
