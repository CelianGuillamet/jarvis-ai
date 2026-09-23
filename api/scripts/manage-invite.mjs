import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const [operation, input, ...extra] = process.argv.slice(2);
const email = input?.trim().toLowerCase();
if (!['invite', 'revoke'].includes(operation) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || extra.length) {
  console.error('Usage: npm run account:invite -- <invite|revoke> <email>');
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Check the intended local database first.');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (operation === 'invite') {
      await prisma.betaInvite.upsert({ where: { email }, create: { email }, update: { revokedAt: null, expiresAt: null } });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.betaInvite.updateMany({ where: { email }, data: { revokedAt: new Date() } });
        await tx.session.deleteMany({ where: { user: { email } } });
      });
    }
    console.log(operation === 'invite' ? 'Invitation active. No email was sent.' : 'Invitation revoked and existing sessions removed.');
  } catch {
    console.error('Invitation update failed. Verify local database connectivity and migrations.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
