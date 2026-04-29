import { DateTime } from 'luxon';

export class RangeParseError extends Error {}

function parseCount(raw: string) {
  const token = raw.trim().toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);

  const map: Record<string, number> = {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
    onze: 11,
    douze: 12,
  };
  return map[token] ?? NaN;
}

export function resolveRange(
  rangeText: string,
  tz = 'Europe/Paris',
  maxDays = 120,
) {
  const text = rangeText.trim().toLowerCase();
  const textNorm = text.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const now = DateTime.now().setZone(tz);
  const countToken =
    '(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)';

  const clamp = (start: DateTime, end: DateTime) => {
    const days = end.diff(start, 'days').days;
    if (days > maxDays)
      throw new RangeParseError(
        `Période trop large (${Math.round(days)} jours).`,
      );
    return {
      startIso: start.toISO({ suppressMilliseconds: true })!,
      endIso: end.toISO({ suppressMilliseconds: true })!,
    };
  };

  // Helper: si tout est dans le passé, décale d'1 an
  const shiftIfPast = (start: DateTime, end: DateTime) => {
    if (end < now) {
      start = start.plus({ years: 1 });
      end = end.plus({ years: 1 });
    }
    return { start, end };
  };

  // 1) aujourd’hui
  if (/(aujourd)/.test(textNorm))
    return clamp(now.startOf('day'), now.endOf('day'));

  // 2) demain
  if (/(demain)/.test(textNorm)) {
    const d = now.plus({ days: 1 });
    return clamp(d.startOf('day'), d.endOf('day'));
  }

  // 3) cette semaine
  if (/(cette semaine|semaine)/.test(textNorm) && !/prochaine/.test(textNorm)) {
    return clamp(now.startOf('week'), now.endOf('week'));
  }

  // 4) "dans N semaines" / "dans N jours" (N chiffre ou lettre)
  const mWeeks = textNorm.match(
    new RegExp(`\\bdans\\s+${countToken}\\s+semaine(?:s)?\\b`),
  );
  if (mWeeks) {
    const n = parseCount(mWeeks[1]);
    if (!Number.isFinite(n) || n < 1)
      throw new RangeParseError('Nombre de semaines invalide.');
    return clamp(now, now.plus({ weeks: n }));
  }

  const mDays = textNorm.match(
    new RegExp(`\\bdans\\s+${countToken}\\s+jour(?:s)?\\b`),
  );
  if (mDays) {
    const n = parseCount(mDays[1]);
    if (!Number.isFinite(n) || n < 1)
      throw new RangeParseError('Nombre de jours invalide.');
    return clamp(now, now.plus({ days: n }));
  }

  // 4b) "les N prochaines semaines/jours"
  const mNextWeeks =
    textNorm.match(
      new RegExp(
        `\\b(?:les?\\s+)?${countToken}\\s+prochain(?:e)?s?\\s+semaine(?:s)?\\b`,
      ),
    ) ??
    textNorm.match(
      new RegExp(`\\bprochain(?:e)?s?\\s+${countToken}\\s+semaine(?:s)?\\b`),
    );
  if (mNextWeeks) {
    const n = parseCount(mNextWeeks[1]);
    if (!Number.isFinite(n) || n < 1)
      throw new RangeParseError('Nombre de semaines invalide.');
    return clamp(now, now.plus({ weeks: n }));
  }

  const mNextDays =
    textNorm.match(
      new RegExp(
        `\\b(?:les?\\s+)?${countToken}\\s+prochain(?:e)?s?\\s+jour(?:s)?\\b`,
      ),
    ) ??
    textNorm.match(
      new RegExp(`\\bprochain(?:e)?s?\\s+${countToken}\\s+jour(?:s)?\\b`),
    );
  if (mNextDays) {
    const n = parseCount(mNextDays[1]);
    if (!Number.isFinite(n) || n < 1)
      throw new RangeParseError('Nombre de jours invalide.');
    return clamp(now, now.plus({ days: n }));
  }

  // 5) "3 prochains mois" / "dans 3 mois"
  const mNextMonths =
    textNorm.match(
      new RegExp(
        `\\b(?:dans\\s+)?${countToken}\\s+prochain(?:e)?s?\\s+mois\\b`,
      ),
    ) ??
    textNorm.match(
      new RegExp(`\\bprochain(?:e)?s?\\s+${countToken}\\s+mois\\b`),
    ) ??
    textNorm.match(new RegExp(`\\bdans\\s+${countToken}\\s+mois\\b`));
  if (mNextMonths) {
    const n = parseCount(mNextMonths[1]);
    if (!Number.isFinite(n) || n < 1)
      throw new RangeParseError('Nombre de mois invalide.');
    return clamp(now.startOf('day'), now.plus({ months: n }).endOf('day'));
  }

  // 6) "2 semaines" / "7 jours"
  if (/(2\s*semaines|deux\s*semaines|14\s*jours)/.test(textNorm))
    return clamp(now, now.plus({ days: 14 }));
  if (/(7\s*jours|sept\s*jours|une\s*semaine|1\s*semaine)/.test(textNorm))
    return clamp(now, now.plus({ days: 7 }));

  // 7) "du 12 au 18 mars"
  const duAu = textNorm.match(
    /\bdu\s+(\d{1,2})\s+au\s+(\d{1,2})(?:\s+([a-z]+))?/,
  );
  if (duAu) {
    const d1 = Number(duAu[1]);
    const d2 = Number(duAu[2]);
    const monthName = duAu[3];
    const month = monthName ? monthFromFrench(monthName) : now.month;
    if (!month) throw new RangeParseError('Mois non reconnu.');

    let start = DateTime.fromObject(
      { year: now.year, month, day: d1 },
      { zone: tz },
    ).startOf('day');
    let end = DateTime.fromObject(
      { year: now.year, month, day: d2 },
      { zone: tz },
    ).endOf('day');

    ({ start, end } = shiftIfPast(start, end));
    return clamp(start, end);
  }

  // 8) Jour unique: "le 17 mars" / "17 mars 2026"
  const dayMonth = textNorm.match(
    /\b(?:le\s+)?(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/,
  );
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = monthFromFrench(dayMonth[2]);
    const year = dayMonth[3] ? Number(dayMonth[3]) : now.year;
    if (!month) throw new RangeParseError('Mois non reconnu.');

    let start = DateTime.fromObject({ year, month, day }, { zone: tz }).startOf(
      'day',
    );
    if (!start.isValid) throw new RangeParseError('Date invalide.');
    let end = start.endOf('day');

    if (!dayMonth[3]) ({ start, end } = shiftIfPast(start, end));
    return clamp(start, end);
  }

  // 9) Jour unique numérique: "17/03" / "17-03-2026"
  const dayMonthNum = textNorm.match(
    /\b(?:le\s+)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/,
  );
  if (dayMonthNum) {
    const day = Number(dayMonthNum[1]);
    const month = Number(dayMonthNum[2]);
    const yearRaw = dayMonthNum[3];
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + Number(yearRaw)
        : Number(yearRaw)
      : now.year;

    let start = DateTime.fromObject({ year, month, day }, { zone: tz }).startOf(
      'day',
    );
    if (!start.isValid) throw new RangeParseError('Date invalide.');
    let end = start.endOf('day');

    if (!yearRaw) ({ start, end } = shiftIfPast(start, end));
    return clamp(start, end);
  }

  // 10) Multi-mois: "mars et avril" / "avril, mai et juin 2026"
  const yearInText = textNorm.match(/\b(20\d{2})\b/)?.[1];
  const forcedYear = yearInText ? Number(yearInText) : null;

  const monthRegex =
    /\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/g;

  const foundMonths = Array.from(textNorm.matchAll(monthRegex))
    .map((m) => monthFromFrench(m[1]))
    .filter((m): m is number => !!m);

  const uniqueMonths = Array.from(new Set(foundMonths));

  if (uniqueMonths.length >= 2) {
    // ordre chronologique dans l'année
    const startMonth = Math.min(...uniqueMonths);
    const endMonth = Math.max(...uniqueMonths);

    const startYear = forcedYear ?? now.year;
    const endYear =
      forcedYear ?? (endMonth < startMonth ? now.year + 1 : now.year);

    let start = DateTime.fromObject(
      { year: startYear, month: startMonth, day: 1 },
      { zone: tz },
    ).startOf('day');
    let end = DateTime.fromObject(
      { year: endYear, month: endMonth, day: 1 },
      { zone: tz },
    ).endOf('month');

    // si pas d'année explicite et que c'est passé, on décale
    if (!forcedYear) ({ start, end } = shiftIfPast(start, end));

    return clamp(start, end);
  }

  // 11) "avril 2026"
  const monthYear = textNorm.match(
    /\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/,
  );
  if (monthYear) {
    const month = monthFromFrench(monthYear[1]);
    const year = Number(monthYear[2]);
    if (!month) throw new RangeParseError('Mois non reconnu.');

    const start = DateTime.fromObject(
      { year, month, day: 1 },
      { zone: tz },
    ).startOf('day');
    const end = start.endOf('month');
    return clamp(start, end);
  }

  // 12) "avril" (mois seul)
  if (uniqueMonths.length === 1) {
    const month = uniqueMonths[0];
    const year = forcedYear ?? (month < now.month ? now.year + 1 : now.year);

    const start = DateTime.fromObject(
      { year, month, day: 1 },
      { zone: tz },
    ).startOf('day');
    const end = start.endOf('month');
    return clamp(start, end);
  }

  throw new RangeParseError(
    `Impossible de comprendre la période: "${rangeText}"`,
  );
}

function monthFromFrench(name: string): number | null {
  const n = name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const map: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
  };
  return map[n] ?? null;
}
