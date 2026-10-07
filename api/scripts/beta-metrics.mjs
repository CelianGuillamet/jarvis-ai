import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { collectBetaMetrics } from '../src/beta/beta-metrics.ts';

const [flag, value, ...extra] = process.argv.slice(2);
const days = flag === undefined ? 14 : flag === '--days' ? Number(value) : NaN;
if (!Number.isInteger(days) || days < 1 || days > 365 || extra.length) {
  console.error('Usage: npm run beta:metrics -- [--days <1-365>]');
  process.exitCode = 1;
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Check the intended local database first.');
  process.exitCode = 1;
} else {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    console.log(JSON.stringify(await collectBetaMetrics(prisma, { from, to }), null, 2));
  } catch {
    console.error('Metrics collection failed. Verify local database connectivity and migrations.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
