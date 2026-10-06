import {
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AccountErasureController } from './account-erasure.controller';
import { AccountErasureStore } from './account-erasure.store';
import { RequestQuotaService } from '../http/request-quota.service';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { RequestContract } from '../http/request-contract';
import { AccountErasureRequestSchema } from '../contracts/v1';

function fixture() {
  const store = {
    request: jest.fn().mockResolvedValue({ state: 'queued' }),
    status: jest.fn().mockResolvedValue({ state: 'local_deleted' }),
  };
  const quotas = { consume: jest.fn().mockReturnValue(null) };
  const controller = new AccountErasureController(
    store as unknown as AccountErasureStore,
    quotas as unknown as RequestQuotaService,
  );
  const response = { setHeader: jest.fn() };
  const request = (receipt?: string) =>
    ({
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue(receipt),
    }) as unknown as Request;
  return { store, quotas, controller, response, request };
}

describe('Account erasure HTTP boundary', () => {
  it('takes ownership exclusively from the signed identity and rejects extra input fields', async () => {
    const f = fixture();
    const input = {
      receipt: 'a'.repeat(64),
      confirmEmail: 'owner@example.test',
    };
    await f.controller.request(
      { identity: { userId: 'signed-owner' } } as AuthenticatedRequest,
      input,
    );
    expect(f.store.request).toHaveBeenCalledWith('signed-owner', input);
    expect(() =>
      new RequestContract(AccountErasureRequestSchema).transform({
        ...input,
        ownerId: 'foreign-owner',
      }),
    ).toThrow();
  });

  it('authenticates post-signout status with a header capability and quotas by IP', async () => {
    const f = fixture();
    const receipt = 'a'.repeat(64);
    expect(
      await f.controller.status(
        f.request(receipt),
        f.response as unknown as Response,
      ),
    ).toEqual({
      state: 'local_deleted',
    });
    expect(f.store.status).toHaveBeenCalledWith(receipt);
    expect(f.quotas.consume).toHaveBeenCalledWith(
      'erasure-status:127.0.0.1',
      20,
    );
    expect(JSON.stringify(f.quotas.consume.mock.calls)).not.toContain(receipt);
  });

  it.each([undefined, 'wrong', 'A'.repeat(64)])(
    'rejects malformed or missing capabilities before database access',
    async (receipt) => {
      const f = fixture();
      await expect(
        f.controller.status(
          f.request(receipt),
          f.response as unknown as Response,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(f.store.status).not.toHaveBeenCalled();
    },
  );

  it('enforces the quota before capability lookup', async () => {
    const f = fixture();
    f.quotas.consume.mockReturnValue(30);
    await expect(
      f.controller.status(
        f.request('a'.repeat(64)),
        f.response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(f.response.setHeader).toHaveBeenCalledWith('Retry-After', 30);
    expect(f.store.status).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected database errors without returning SQL or secrets', async () => {
    const f = fixture();
    f.store.status.mockRejectedValue(new Error('private SQL credentials'));
    await expect(
      f.controller.status(
        f.request('a'.repeat(64)),
        f.response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await f.controller.status(
        f.request('a'.repeat(64)),
        f.response as unknown as Response,
      );
    } catch (error) {
      expect(String(error)).not.toContain('private SQL credentials');
    }
  });
});
