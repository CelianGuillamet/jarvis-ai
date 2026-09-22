import { createAuth } from '../../src/auth/create-auth';
import { readAuthConfig } from '../../src/auth/auth-config';
import { createHmac } from 'node:crypto';
import { configureAuth } from '../../src/auth/configure-auth';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
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
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 123, unexpected: true })
      .expect(400);
  });

  it('persists and confirms a calendar action using only the injected fake', async () => {
    const sessionId = 'fixture-calendar';
    await seedGoogle(sessionId);
    await request(baseUrl)
      .post('/jarvis/chat')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ text: 'Ajoute un rendez-vous demain à 18h', sessionId })
      .expect(201);
    const pending = await prisma.pendingAction.findUniqueOrThrow({
      where: { sessionId },
    });
    expect(calendar.createEvent).not.toHaveBeenCalled();
    await request(baseUrl)
      .post('/jarvis/confirm')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
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
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
      .send({ sessionId })
      .expect(201);
    expect(await prisma.inboxZeroItem.count({ where: { sessionId } })).toBe(1);
    await request(baseUrl)
      .post('/inbox-zero/apply')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:5173')
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
  it('mounts the ESM auth handler before Nest body parsing', async () => {
    await request(baseUrl).get('/api/auth/ok').expect(200, { ok: true });
    await request(baseUrl)
      .post('/api/auth/sign-in/social')
      .set('Origin', 'http://localhost:5173')
      .send({ provider: 'unconfigured' })
      .expect(404);
  });

  it('rejects anonymous and conversation-ID-only access to every private endpoint', async () => {
    for (const path of [
      '/jarvis/status',
      '/inbox-zero/session',
      '/inbox-zero/message',
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
      '/jarvis/chat',
      '/jarvis/confirm',
      '/inbox-zero/scan',
      '/inbox-zero/step',
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
