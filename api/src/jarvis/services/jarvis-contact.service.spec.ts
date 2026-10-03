import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JarvisContactService } from './jarvis-contact.service';

describe('Contact mutation failures', () => {
  function fixture() {
    const contact = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockRejectedValue(new Error('private database details')),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUniqueOrThrow: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const service = new JarvisContactService({
      contact,
    } as unknown as PrismaService);
    return { contact, service };
  }

  it('propagates unavailable storage instead of a successful null save', async () => {
    const { service } = fixture();
    await expect(service.save('owner', { name: 'Test' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('distinguishes absent contacts from failed updates and failed receipt reads', async () => {
    const { contact, service } = fixture();
    expect(await service.update('owner', 'id', {})).toBeNull();
    contact.updateMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.update('owner', 'id', {})).rejects.toThrow(
      ServiceUnavailableException,
    );
    contact.updateMany.mockResolvedValueOnce({ count: 1 });
    contact.findUniqueOrThrow.mockRejectedValueOnce(
      new Error('receipt unavailable'),
    );
    await expect(service.update('owner', 'id', {})).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('reports the actual delete count and propagates database errors', async () => {
    const { contact, service } = fixture();
    expect(await service.delete('owner', 'id')).toBe(false);
    contact.deleteMany.mockResolvedValueOnce({ count: 1 });
    expect(await service.delete('owner', 'id')).toBe(true);
    contact.deleteMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.delete('owner', 'id')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(contact.deleteMany).toHaveBeenLastCalledWith({
      where: { id: 'id', sessionId: 'owner' },
    });
  });
});
