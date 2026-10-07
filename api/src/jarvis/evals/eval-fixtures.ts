import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type EvalStatus = 'pass' | 'known_gap';

export type EvalCase = {
  id: string;
  status: EvalStatus;
  gap?: string;
  [key: string]: unknown;
};

export type EvalFixtureFile = {
  file: string;
  version: number;
  name: string;
  origin: string;
  redacted: boolean;
  tz?: string;
  cases: EvalCase[];
};

const FIXTURE_DIR = join(__dirname, 'fixtures');
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'evil.example'];

export function loadEvalFixtures(): EvalFixtureFile[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => /\.v\d+\.json$/.test(file))
    .sort()
    .map((file) => {
      const parsed = JSON.parse(
        readFileSync(join(FIXTURE_DIR, file), 'utf8'),
      ) as Omit<EvalFixtureFile, 'file'>;
      return { file, ...parsed };
    });
}

export function fixtureProblems(fixture: EvalFixtureFile): string[] {
  const problems: string[] = [];
  if (fixture.version !== 1) problems.push('unsupported version');
  if (fixture.origin !== 'synthetic') problems.push('origin must be synthetic');
  if (fixture.redacted !== true) problems.push('fixture must be redacted');
  const ids = new Set<string>();
  for (const item of fixture.cases) {
    if (ids.has(item.id)) problems.push(`duplicate id ${item.id}`);
    ids.add(item.id);
    if (item.status !== 'pass' && item.status !== 'known_gap')
      problems.push(`${item.id}: invalid status`);
    if (item.status === 'known_gap' && !item.gap)
      problems.push(`${item.id}: known_gap needs a gap description`);
  }
  const text = JSON.stringify(fixture);
  for (const match of text.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) {
    if (!ALLOWED_EMAIL_DOMAINS.includes(match[1]))
      problems.push(`non-synthetic email domain ${match[1]}`);
  }
  if (/\b\d{10,}\b/.test(text)) problems.push('long digit run (possible PII)');
  return problems;
}
