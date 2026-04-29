import { DateTime, Settings } from 'luxon';
import { resolveWhenWindow } from './resolve-when';

describe('resolveWhenWindow', () => {
  const originalNow = Settings.now;
  const fixedNowMs = Date.UTC(2026, 2, 5, 9, 30, 0); // 2026-03-05 10:30 Europe/Paris

  beforeEach(() => {
    Settings.now = () => fixedNowMs;
  });

  afterEach(() => {
    Settings.now = originalNow;
  });

  it('parses explicit date with time range', () => {
    const out = resolveWhenWindow(
      "modifie le premier pour qu'il soit a la date du 10 mars de 16h30 a 17h",
      'Europe/Paris',
      {
        baseDate: DateTime.fromISO('2026-03-05T16:30:00+01:00'),
      },
    );

    expect(out.startIso.startsWith('2026-03-10T16:30:00')).toBe(true);
    expect(out.endIso?.startsWith('2026-03-10T17:00:00')).toBe(true);
  });

  it('uses base date when only time range is provided', () => {
    const out = resolveWhenWindow('de 16h30 a 17h', 'Europe/Paris', {
      baseDate: DateTime.fromISO('2026-03-17T00:00:00+01:00'),
    });

    expect(out.startIso.startsWith('2026-03-17T16:30:00')).toBe(true);
    expect(out.endIso?.startsWith('2026-03-17T17:00:00')).toBe(true);
  });

  it('parses numeric date and single time', () => {
    const out = resolveWhenWindow('17/03 a 16h30', 'Europe/Paris');

    expect(out.startIso.startsWith('2026-03-17T16:30:00')).toBe(true);
    expect(out.endIso).toBeUndefined();
  });

  it('parses day-only date using base month/year context', () => {
    const out = resolveWhenWindow('le 20', 'Europe/Paris', {
      baseDate: DateTime.fromISO('2026-03-17T17:30:00+01:00'),
      defaultHour: 17,
      defaultMinute: 30,
    });

    expect(out.startIso.startsWith('2026-03-20T17:30:00')).toBe(true);
  });

  it('parses day-only destination with explicit time', () => {
    const out = resolveWhenWindow('au 20 a 17h', 'Europe/Paris', {
      baseDate: DateTime.fromISO('2026-03-17T16:30:00+01:00'),
      defaultHour: 16,
      defaultMinute: 30,
    });

    expect(out.startIso.startsWith('2026-03-20T17:00:00')).toBe(true);
  });
});
