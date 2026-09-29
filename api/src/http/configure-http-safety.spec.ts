import { Controller, Get, Post, Body, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { configureHttpSafety } from './configure-http-safety';
import { RequestQuotaService } from './request-quota.service';
import { REQUEST_LIMITS, REQUEST_QUOTAS } from './request-limits';

@Controller()
class FixtureController {
  @Get() read() {
    return { ok: true };
  }
  @Get('api/auth/session') session() {
    return { ok: true };
  }
  @Post() write(@Body() body: unknown) {
    return body;
  }
}
@Module({ controllers: [FixtureController], providers: [RequestQuotaService] })
class FixtureModule {}

describe('HTTP safety boundary', () => {
  let app: NestExpressApplication<Server>;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [FixtureModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication<Server>>();
    configureHttpSafety(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('accepts bounded JSON, rejects malformed and oversized bodies without echoing input', async () => {
    await request(app.getHttpServer())
      .post('/')
      .send({ message: 'bonjour' })
      .expect(201, { message: 'bonjour' });
    const invalid = await request(app.getHttpServer())
      .post('/')
      .type('json')
      .send('{"private-secret":')
      .expect(400);
    expect(invalid.text).not.toContain('private-secret');
    await request(app.getHttpServer())
      .post('/')
      .send({ text: 'x'.repeat(REQUEST_LIMITS.bodyBytes) })
      .expect(413);
    await request(app.getHttpServer())
      .post('/')
      .type('text')
      .send('bonjour')
      .expect(415);
  });
  it('rejects oversized chunked bodies and query URLs', async () => {
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outgoing = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      outgoing.on('error', reject);
      outgoing.write('{"text":"');
      outgoing.write('x'.repeat(REQUEST_LIMITS.bodyBytes));
      outgoing.end('"}');
    });
    expect(status).toBe(413);
    await request(app.getHttpServer())
      .get('/?q=' + 'x'.repeat(REQUEST_LIMITS.urlBytes))
      .expect(414);
  });
  it('sets production headers without advertising the framework', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await request(app.getHttpServer()).get('/').expect(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(response.headers['strict-transport-security']).toBe(
        'max-age=31536000',
      );
      expect(response.headers['x-powered-by']).toBeUndefined();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('throttles authentication without trusting spoofed forwarded addresses', async () => {
    for (let i = 0; i < REQUEST_QUOTAS.authAddress; i++) {
      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .expect(200);
    }
    const response = await request(app.getHttpServer())
      .get('/API/AUTH/session')
      .expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });
});
