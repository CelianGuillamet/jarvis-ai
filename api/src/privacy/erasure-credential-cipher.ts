import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hkdfSync } from 'node:crypto';
import { TokenCipher } from '../google/token-cipher';

/** Reuse the reviewed AEAD implementation with a separate per-job context. */
@Injectable()
export class ErasureCredentialCipher {
  constructor(private readonly config: ConfigService) {}

  private cipher() {
    const secret = this.config.get<string>('AUTH_SECRET') ?? '';
    if (secret.length < 32)
      throw new Error('Erasure credential protection unavailable.');
    const key = Buffer.from(
      hkdfSync(
        'sha256',
        secret,
        'jarvis-erasure-v1',
        'revocation-credentials',
        32,
      ),
    );
    return new TokenCipher(
      JSON.stringify({ erasure: key.toString('base64') }),
      'erasure',
    );
  }
  seal(jobId: string, tokens: string[]) {
    return this.cipher().encrypt(
      JSON.stringify(tokens),
      `erasure:${jobId}:revocation`,
    );
  }
  open(jobId: string, envelope: string): string[] {
    const value: unknown = JSON.parse(
      this.cipher().decrypt(envelope, `erasure:${jobId}:revocation`),
    );
    if (
      !Array.isArray(value) ||
      value.some((token: unknown) => typeof token !== 'string' || !token)
    ) {
      throw new Error('Erasure credential protection unavailable.');
    }
    return value as string[];
  }
}
