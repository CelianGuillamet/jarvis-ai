import type { Server } from 'node:http';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ResponseContract } from './response-contract';
import { COMMAND_STATES } from '../commands/command-journal.service';
import {
  JarvisChatResponseSchema,
  InboxZeroMessageResponseSchema,
  CommandStateSchema,
} from '../contracts/v1';

let response: unknown;
@Controller('contract-test')
class ContractController {
  @Get('chat')
  @ResponseContract(JarvisChatResponseSchema)
  chat() {
    return response;
  }

  @Get('message')
  @ResponseContract(InboxZeroMessageResponseSchema)
  message() {
    return response;
  }
}

describe('Versioned response boundary', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContractController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it('returns valid replay metadata and the contract version', async () => {
    response = {
      text: 'Résultat incertain',
      meta: { commandId: 'id', commandState: 'unknown' },
    };
    const result = await request(app.getHttpServer() as Server)
      .get('/contract-test/chat')
      .expect(200);
    expect(result.headers['x-jarvis-contract']).toBe('1');
    expect(result.body).toEqual(response);
  });

  it.each([
    { text: 12 },
    { text: 'ok', meta: { commandState: 'invented' } },
    { text: 'ok', choices: [false] },
  ])(
    'rejects an invalid response without exposing its contents',
    async (invalid) => {
      response = { ...invalid, secret: 'private details' };
      const result = await request(app.getHttpServer() as Server)
        .get('/contract-test/chat')
        .expect(502);
      expect(result.body as unknown).toMatchObject({
        code: 'INVALID_RESPONSE',
      });
      expect(JSON.stringify(result.body)).not.toContain('private details');
    },
  );

  it('checks the serialized Date shape used by Gmail', async () => {
    response = {
      item: null,
      reply: { to: 'sender@example.invalid', subject: 'Re: subject' },
      message: {
        id: 'id',
        threadId: 'thread',
        subject: 'subject',
        from: 'from',
        to: 'to',
        date: new Date('2026-09-30T00:00:00Z'),
        snippet: '',
        labels: [],
        unread: false,
        bodyText: '',
      },
    };
    const result = await request(app.getHttpServer() as Server)
      .get('/contract-test/message')
      .expect(200);
    expect(result.body as unknown).toMatchObject({
      message: { date: '2026-09-30T00:00:00.000Z' },
    });
  });

  it('uses exactly the durable journal states', () => {
    expect(new Set(CommandStateSchema.options)).toEqual(
      new Set(COMMAND_STATES),
    );
  });
});
