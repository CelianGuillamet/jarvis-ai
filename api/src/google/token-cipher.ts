import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Local key ring. Keys live outside the database; IDs permit staged rotation. */
export class TokenCipher {
  private readonly keys: Map<string, Buffer>;
  private readonly activeKeyId: string;

  constructor(serializedKeys: string, activeKeyId: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serializedKeys);
    } catch {
      throw new Error('Invalid Google token encryption configuration.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid Google token encryption configuration.');
    this.keys = new Map();
    for (const [id, value] of Object.entries(parsed)) {
      if (
        !/^[a-zA-Z0-9_-]{1,40}$/.test(id) ||
        typeof value !== 'string' ||
        !/^[A-Za-z0-9+/]{43}=$/.test(value)
      )
        throw new Error('Invalid Google token encryption configuration.');
      const key = Buffer.from(value, 'base64');
      if (key.length !== 32 || key.toString('base64') !== value)
        throw new Error('Invalid Google token encryption configuration.');
      this.keys.set(id, key);
    }
    if (!this.keys.has(activeKeyId))
      throw new Error('Missing active Google token encryption key.');
    this.activeKeyId = activeKeyId;
  }

  encrypt(plaintext: string, context: string): string {
    if (!plaintext || !context)
      throw new Error('Invalid Google token encryption input.');
    const nonce = randomBytes(12);
    const key = this.keys.get(this.activeKeyId)!;
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      this.activeKeyId,
      nonce.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string, context: string): string {
    try {
      const parts = envelope.split('.');
      if (parts.length !== 5 || parts[0] !== 'v1' || !context)
        throw new Error();
      const [, keyId, nonceText, tagText, ciphertextText] = parts;
      const key = this.keys.get(keyId);
      if (!key) throw new Error();
      const decode = (text: string) => {
        if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error();
        const bytes = Buffer.from(text, 'base64url');
        if (bytes.toString('base64url') !== text) throw new Error();
        return bytes;
      };
      const nonce = decode(nonceText);
      const tag = decode(tagText);
      if (nonce.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(decode(ciphertextText)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Never include ciphertext, token values, key material or provider errors.
      throw new Error('Google credential cannot be decrypted.');
    }
  }
}
