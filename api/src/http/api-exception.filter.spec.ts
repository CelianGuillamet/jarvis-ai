import {
  Controller,
  Get,
  HttpException,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { ApiExceptionFilter } from './api-exception.filter';

let failure: unknown;
@Controller('failure')
class FailureController {
  @Get()
  fail() {
    throw failure;
  }
}

describe('HTTP error contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FailureController],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [413, 'REQUEST_TOO_LARGE'],
    [415, 'UNSUPPORTED_MEDIA_TYPE'],
    [429, 'RATE_LIMITED'],
    [502, 'UNAVAILABLE'],
    [503, 'UNAVAILABLE'],
    [504, 'UNAVAILABLE'],
  ] as const)('categorizes HTTP %s', async (status, code) => {
    failure = new HttpException('Détail', status);
    const response = await request(app.getHttpServer() as Server)
      .get('/failure')
      .expect(status);
    expect(response.body as unknown).toMatchObject({ code });
  });
  it.each([
    new Error('database password'),
    new HttpException('provider token', 503),
  ])('sanitizes internal failures', async (error) => {
    failure = error;
    const response = await request(app.getHttpServer() as Server).get(
      '/failure',
    );
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(response.body)).not.toMatch(/password|token/);
  });
  it('keeps invalid responses distinct from unavailability', async () => {
    failure = new HttpException(
      { code: 'INVALID_RESPONSE', message: 'private content' },
      502,
    );
    const response = await request(app.getHttpServer() as Server)
      .get('/failure')
      .expect(502);
    expect(response.body as unknown).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(JSON.stringify(response.body)).not.toContain('private content');
  });
});
