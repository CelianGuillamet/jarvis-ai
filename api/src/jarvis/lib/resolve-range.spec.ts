import { DateTime, Settings } from 'luxon';
import { resolveRange } from './resolve-range';

describe('resolveRange', () => {
  const originalNow = Settings.now;
  const fixedNowMs = Date.UTC(2026, 2, 5, 9, 30, 0); // 2026-03-05 10:30 Europe/Paris

  beforeEach(() => {
    Settings.now = () => fixedNowMs;
  });

  afterEach(() => {
    Settings.now = originalNow;
  });

  it('supports month lists with explicit year', () => {
    const { startIso, endIso } = resolveRange(
      'avril, mai et juin 2026',
      'Europe/Paris',
    );

    expect(startIso.startsWith('2026-04-01T00:00:00')).toBe(true);
    expect(endIso.startsWith('2026-06-30T23:59:59')).toBe(true);
  });

  it('supports "3 prochains mois"', () => {
    const { startIso, endIso } = resolveRange(
      'les 3 prochains mois',
      'Europe/Paris',
    );

    expect(startIso.startsWith('2026-03-05T00:00:00')).toBe(true);
    expect(endIso.startsWith('2026-06-05T23:59:59')).toBe(true);
  });

  it('supports single day with month name inside a sentence', () => {
    const { startIso, endIso } = resolveRange(
      "est ce que j'ai un rendez-vous le 17 mars ?",
      'Europe/Paris',
    );

    expect(startIso.startsWith('2026-03-17T00:00:00')).toBe(true);
    expect(endIso.startsWith('2026-03-17T23:59:59')).toBe(true);
  });

  it('supports single day numeric format', () => {
    const { startIso, endIso } = resolveRange('le 17/03', 'Europe/Paris');

    expect(startIso.startsWith('2026-03-17T00:00:00')).toBe(true);
    expect(endIso.startsWith('2026-03-17T23:59:59')).toBe(true);
  });

  it('supports "les deux prochaines semaines"', () => {
    const { startIso, endIso } = resolveRange(
      "tu peux me dire ce que j'ai de prevu pour les deux prochaines semaines ?",
      'Europe/Paris',
    );

    expect(startIso.startsWith('2026-03-05T10:30:00')).toBe(true);
    expect(endIso.startsWith('2026-03-19T10:30:00')).toBe(true);
  });
});
