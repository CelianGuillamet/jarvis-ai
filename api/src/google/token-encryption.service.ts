import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenCipher } from './token-cipher';

@Injectable()
export class TokenEncryptionService {
  constructor(private readonly config: ConfigService) {}

  private cipher() {
    return new TokenCipher(
      this.config.get<string>('GOOGLE_TOKEN_KEYS') ?? '{}',
      this.config.get<string>('GOOGLE_TOKEN_ACTIVE_KEY') ?? '',
    );
  }

  assertConfigured() {
    this.cipher();
  }

  encrypt(value: string, context: string) {
    return this.cipher().encrypt(value, context);
  }

  decrypt(value: string, context: string) {
    return this.cipher().decrypt(value, context);
  }
}
