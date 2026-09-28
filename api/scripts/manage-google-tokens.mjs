import 'dotenv/config';
import pg from 'pg';
import { TokenCipher } from '../src/google/token-cipher.ts';
import { sealGoogleTokens } from './google-token-maintenance.mjs';

let client;
try {
  if (process.argv.slice(2).join(' ') !== 'seal --maintenance-confirmed')
    throw new Error('Usage: npm run google:tokens -- seal --maintenance-confirmed');
  const cipher = new TokenCipher(process.env.GOOGLE_TOKEN_KEYS ?? '{}', process.env.GOOGLE_TOKEN_ACTIVE_KEY ?? '');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Local PostgreSQL required.');
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')
    throw new Error('Only the public schema is supported.');
  client = new pg.Client({ connectionString: url.href });
  await client.connect();
  await client.query('SET search_path TO public');
  console.log(JSON.stringify(await sealGoogleTokens(client, cipher)));
} catch {
  console.error('Google token maintenance failed. Check the local target, stopped writers, backup and key ring. No credentials are logged; an active transaction is rolled back.');
  process.exitCode = 1;
} finally {
  await client?.end();
}
