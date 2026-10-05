import { BadRequestException } from '@nestjs/common';
import { RequestContract } from './request-contract';
import {
  ChatRequestSchema,
  InboxZeroApplyRequestSchema,
  MessageQuerySchema,
} from '../contracts/v1';

describe('Shared request validation', () => {
  it.each([
    { text: '   ' },
    { text: 'x'.repeat(8001) },
    { text: 'ok', unexpected: true },
    { text: 'ok', sessionId: null },
  ])('rejects invalid chat inputs without leaking content', (input) => {
    const pipe = new RequestContract(ChatRequestSchema);
    try {
      pipe.transform(input);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION',
        message: 'La requête est invalide.',
      });
    }
  });
  it('requires request identity and content only for a send', () => {
    const pipe = new RequestContract(InboxZeroApplyRequestSchema);
    expect(pipe.transform({ action: 'archive', messageIds: ['id'] })).toEqual({
      action: 'archive',
      messageIds: ['id'],
    });
    expect(() =>
      pipe.transform({
        action: 'send_reply',
        messageIds: ['id'],
        replyText: 'Bonjour',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      pipe.transform({
        action: 'send_reply',
        messageIds: ['id'],
        requestId: 'attempt',
      }),
    ).toThrow(BadRequestException);
    expect(
      pipe.transform({
        action: 'send_reply',
        messageIds: ['id'],
        replyText: 'Bonjour',
        requestId: 'attempt',
        reviewedReply: { to: 'sender@example.invalid', subject: 'Re: subject' },
      }),
    ).toMatchObject({ requestId: 'attempt' });
  });
  it('rejects invalid optional fields even for a different action', () => {
    expect(() =>
      new RequestContract(InboxZeroApplyRequestSchema).transform({
        action: 'archive',
        messageIds: ['id'],
        replyText: 12,
      }),
    ).toThrow(BadRequestException);
  });
  it('rejects array query identifiers and oversized batches', () => {
    expect(() =>
      new RequestContract(MessageQuerySchema).transform({
        messageId: ['id', 'other'],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      new RequestContract(InboxZeroApplyRequestSchema).transform({
        action: 'archive',
        messageIds: Array(21).fill('id'),
      }),
    ).toThrow(BadRequestException);
  });
});
