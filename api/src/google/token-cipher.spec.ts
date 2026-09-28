import { TokenCipher } from './token-cipher';

const oldKey = Buffer.alloc(32, 17).toString('base64');
const newKey = Buffer.alloc(32, 29).toString('base64');
const context = 'google:credential-id:refresh';

describe('TokenCipher', () => {
  it('encrypts with randomized authenticated envelopes bound to a record and field', () => {
    const cipher = new TokenCipher(JSON.stringify({ old: oldKey }), 'old');
    const a = cipher.encrypt('private-refresh-token', context);
    const b = cipher.encrypt('private-refresh-token', context);
    expect(a).not.toBe(b);
    expect(a).not.toContain('private-refresh-token');
    expect(cipher.decrypt(a, context)).toBe('private-refresh-token');
    expect(() => cipher.decrypt(a, 'google:another-id:refresh')).toThrow(
      'Google credential cannot be decrypted.',
    );
    expect(() => cipher.decrypt(a, 'google:credential-id:access')).toThrow();
    const parts = a.split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'), context)).toThrow();
  });

  it('reads previous keys during rotation and writes only with the active key', () => {
    const original = new TokenCipher(JSON.stringify({ old: oldKey }), 'old');
    const saved = original.encrypt('token', context);
    const rotated = new TokenCipher(
      JSON.stringify({ old: oldKey, current: newKey }),
      'current',
    );
    expect(rotated.decrypt(saved, context)).toBe('token');
    const replaced = rotated.encrypt(rotated.decrypt(saved, context), context);
    expect(replaced.startsWith('v1.current.')).toBe(true);
    const retired = new TokenCipher(
      JSON.stringify({ current: newKey }),
      'current',
    );
    expect(retired.decrypt(replaced, context)).toBe('token');
    expect(() => retired.decrypt(saved, context)).toThrow();
  });

  it.each(['{}', '[]', 'null', '{', '{"key":"short"}'])(
    'rejects unusable key configuration without leaking it: %s',
    (keys) => {
      expect(() => new TokenCipher(keys, 'key')).toThrow();
    },
  );

  it.each(['plaintext-secret', 'v2.key.a.b.c', 'v1.old.a.b.c.extra'])(
    'rejects plaintext and malformed envelopes',
    (envelope) => {
      const cipher = new TokenCipher(JSON.stringify({ old: oldKey }), 'old');
      expect(() => cipher.decrypt(envelope, context)).toThrow(
        'Google credential cannot be decrypted.',
      );
    },
  );
});
