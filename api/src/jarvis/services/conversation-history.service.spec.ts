import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationHistoryService } from './conversation-history.service';

describe('Durable conversation capture', () => {
  function fixture() {
    const create = jest.fn().mockResolvedValue({ id: 'turn' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const conversation = {
      findFirst: jest.fn().mockResolvedValue({ id: 'conversation' }),
    };
    const service = new ConversationHistoryService({
      conversation,
      conversationTurn: { create, updateMany },
    } as unknown as PrismaService);
    return { service, create, updateMany, conversation };
  }

  it('records input before execution and the exact validated response afterwards', async () => {
    const { service, create, updateMany } = fixture();
    const operation = jest.fn().mockResolvedValue({
      text: 'Résultat',
      meta: { commandId: 'command', commandState: 'completed' },
    });
    const result = await service.capture(
      'owner',
      'conversation',
      'chat',
      'Question',
      operation,
    );
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0],
    );
    expect(result.meta).toMatchObject({
      historyTurnId: 'turn',
      historySaved: true,
      commandId: 'command',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'turn',
        ownerId: 'owner',
        conversationId: 'conversation',
        state: 'started',
      },
      data: { state: 'completed', response: result, commandId: 'command' },
    });
  });

  it('does not execute when recording the input fails', async () => {
    const { service, create } = fixture();
    create.mockRejectedValue(new Error('private storage details'));
    const operation = jest.fn();
    await expect(
      service.capture('owner', 'conversation', 'chat', 'Question', operation),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(operation).not.toHaveBeenCalled();
  });

  it('preserves a completed domain result when saving its history fails', async () => {
    const { service, updateMany } = fixture();
    updateMany.mockRejectedValue(new Error('storage offline'));
    const operation = jest.fn().mockResolvedValue({
      text: 'Envoyé',
      meta: { commandState: 'completed' },
    });
    const result = await service.capture(
      'owner',
      'conversation',
      'chat',
      'Envoyer',
      operation,
    );
    expect(result.text).toBe('Envoyé');
    expect(result.meta).toMatchObject({
      commandState: 'completed',
      historySaved: false,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('records request failure without asserting a domain command failed', async () => {
    const { service, updateMany } = fixture();
    const error = new Error('Response unavailable after possible effect');
    await expect(
      service.capture('owner', 'conversation', 'chat', 'Question', () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'turn',
        ownerId: 'owner',
        conversationId: 'conversation',
        state: 'started',
      },
      data: { state: 'failed' },
    });
  });
});
