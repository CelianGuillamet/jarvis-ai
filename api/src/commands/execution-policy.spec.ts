import {
  executeWithPolicy,
  type MutationPolicyContext,
} from './execution-policy';

describe('shared mutation policy', () => {
  const status = (scopes: string[]) => ({
    scopes,
    connected: scopes.length > 0,
    gmailConnected: scopes.length > 0,
    calendarConnected: false,
  });
  const context = (
    overrides: Partial<MutationPolicyContext> = {},
  ): MutationPolicyContext => ({
    ownerId: 'owner-a',
    simulation: false,
    capabilities: ['gmail.archive'],
    loadGoogleStatus: () =>
      Promise.resolve(status(['https://www.googleapis.com/auth/gmail.modify'])),
    ...overrides,
  });

  it('does not enter a mutation closure in simulation, even without Google credentials', async () => {
    const mutate = jest.fn();
    const loadGoogleStatus = jest.fn();
    await expect(
      executeWithPolicy(
        context({ simulation: true, loadGoogleStatus }),
        mutate,
        () => 'simulation',
      ),
    ).resolves.toBe('simulation');
    expect(mutate).not.toHaveBeenCalled();
    expect(loadGoogleStatus).not.toHaveBeenCalled();
  });

  it('fails closed without an owner or a capability, including simulation', async () => {
    const mutate = jest.fn();
    const simulate = jest.fn();
    await expect(
      executeWithPolicy(
        context({ ownerId: '', simulation: true }),
        mutate,
        simulate,
      ),
    ).rejects.toThrow('Propriétaire');
    await expect(
      executeWithPolicy(context({ capabilities: [] }), mutate, simulate),
    ).rejects.toThrow('Capacité');
    expect(mutate).not.toHaveBeenCalled();
    expect(simulate).not.toHaveBeenCalled();
  });

  it('rechecks permissions on every execution and refuses revoked access', async () => {
    const loadGoogleStatus = jest
      .fn()
      .mockResolvedValueOnce(
        status(['https://www.googleapis.com/auth/gmail.modify']),
      )
      .mockResolvedValueOnce(status([]));
    const mutate = jest.fn().mockResolvedValue('done');
    const input = context({ loadGoogleStatus });
    await expect(
      executeWithPolicy(input, mutate, () => 'simulation'),
    ).resolves.toBe('done');
    await expect(
      executeWithPolicy(input, mutate, () => 'simulation'),
    ).rejects.toThrow('GMAIL_NOT_CONNECTED');
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('requires all permissions before a compound send and archive begins', async () => {
    const mutate = jest.fn();
    await expect(
      executeWithPolicy(
        context({
          capabilities: ['gmail.send', 'gmail.archive'],
          loadGoogleStatus: () =>
            Promise.resolve(
              status(['https://www.googleapis.com/auth/gmail.send']),
            ),
        }),
        mutate,
        () => undefined,
      ),
    ).rejects.toThrow('GMAIL_SCOPE_MISSING');
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(['gmail.delete', 'reminder.create'] as const)(
    'contains deferred capability %s in both modes',
    async (name) => {
      const mutate = jest.fn();
      const simulate = jest.fn();
      for (const simulation of [false, true]) {
        await expect(
          executeWithPolicy(
            context({ capabilities: [name], simulation }),
            mutate,
            simulate,
          ),
        ).rejects.toThrow('reportée');
      }
      expect(mutate).not.toHaveBeenCalled();
      expect(simulate).not.toHaveBeenCalled();
    },
  );

  it('keeps local capabilities independent from Google and propagates execution uncertainty', async () => {
    const loadGoogleStatus = jest.fn();
    const failure = new Error('provider outcome unknown');
    await expect(
      executeWithPolicy(
        context({ capabilities: ['todo.add'], loadGoogleStatus }),
        () => Promise.reject(failure),
        () => undefined,
      ),
    ).rejects.toBe(failure);
    expect(loadGoogleStatus).not.toHaveBeenCalled();
  });
});
