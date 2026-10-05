import { ConfigService } from '@nestjs/config';
import { ErasureCredentialCipher } from './erasure-credential-cipher';

function cipher(secret = 'a'.repeat(48)) {
  return new ErasureCredentialCipher(
    new ConfigService({ AUTH_SECRET: secret }),
  );
}

describe('ErasureCredentialCipher', () => {
  it('encrypts credentials with fresh nonces and restores them for the same job', () => {
    const protection = cipher();
    const tokens = ['private-refresh-token', 'private-access-token'];
    const first = protection.seal('job-a', tokens);
    const second = protection.seal('job-a', tokens);
    expect(first).not.toEqual(second);
    expect(first).not.toContain(tokens[0]);
    expect(protection.open('job-a', first)).toEqual(tokens);
  });

  it('rejects moving credentials to a different job', () => {
    const protection = cipher();
    const envelope = protection.seal('job-a', ['secret']);
    expect(() => protection.open('job-b', envelope)).toThrow();
  });

  it('rejects a changed ciphertext and a different installation secret', () => {
    const protection = cipher();
    const envelope = protection.seal('job-a', ['secret']);
    const parts = envelope.split('.');
    parts[4] = `${parts[4][0] === 'A' ? 'B' : 'A'}${parts[4].slice(1)}`;
    expect(() => protection.open('job-a', parts.join('.'))).toThrow();
    expect(() => cipher('b'.repeat(48)).open('job-a', envelope)).toThrow();
  });

  it('fails closed when the installation secret is missing or too short', () => {
    expect(() => cipher('').seal('job-a', ['secret'])).toThrow();
    expect(() => cipher('short').seal('job-a', ['secret'])).toThrow();
  });
});
