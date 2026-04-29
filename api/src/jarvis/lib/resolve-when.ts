import { DateTime } from 'luxon';

const WEEKDAYS: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 7,
};

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function monthFromFrench(name: string): number | null {
  const n = normalizeText(name);
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

function parseTimeToken(
  token: string,
): { hour: number; minute: number } | null {
  const t = normalizeText(token);
  if (!t) return null;
  if (t === 'midi') return { hour: 12, minute: 0 };
  if (t === 'minuit') return { hour: 0, minute: 0 };

  const m = t.match(/^(\d{1,2})(?:h|:)?(\d{1,2})?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseTime(text: string) {
  const norm = normalizeText(text);
  if (/\bmidi\b/.test(norm)) return { hour: 12, minute: 0 };
  if (/\bminuit\b/.test(norm)) return { hour: 0, minute: 0 };

  const m = norm.match(/\b(\d{1,2})(?:h|:)(\d{1,2})?\b/);
  if (m) {
    const hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
  }

  return { hour: 9, minute: 0 };
}

type ResolveWhenWindowOptions = {
  baseDate?: Date | string | DateTime;
  defaultHour?: number;
  defaultMinute?: number;
};

export type ResolvedWhenWindow = {
  startIso: string;
  endIso?: string;
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
};

function toBaseDay(baseDate: ResolveWhenWindowOptions['baseDate'], tz: string) {
  if (!baseDate) return DateTime.now().setZone(tz).startOf('day');
  if (baseDate instanceof DateTime) return baseDate.setZone(tz).startOf('day');
  if (baseDate instanceof Date)
    return DateTime.fromJSDate(baseDate).setZone(tz).startOf('day');
  const parsed = DateTime.fromISO(baseDate, { zone: tz });
  if (parsed.isValid) return parsed.startOf('day');
  return DateTime.now().setZone(tz).startOf('day');
}

function resolveDateFromText(
  textNorm: string,
  tz: string,
  baseDay: DateTime,
): { day: DateTime; hasExplicitDate: boolean } {
  const now = DateTime.now().setZone(tz).startOf('day');
  const baseIsToday = baseDay.hasSame(now, 'day');
  let day = baseDay;
  let hasExplicitDate = false;

  const mNum = textNorm.match(
    /\b(?:le\s+)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/,
  );
  if (mNum) {
    const dateDay = Number(mNum[1]);
    const month = Number(mNum[2]);
    const yearRaw = mNum[3];
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + Number(yearRaw)
        : Number(yearRaw)
      : now.year;
    const dt = DateTime.fromObject(
      { year, month, day: dateDay },
      { zone: tz },
    ).startOf('day');
    if (dt.isValid) {
      day = !yearRaw && dt < now ? dt.plus({ years: 1 }) : dt;
      hasExplicitDate = true;
      return { day, hasExplicitDate };
    }
  }

  const mNamed = textNorm.match(
    /\b(?:le\s+)?(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/,
  );
  if (mNamed) {
    const dateDay = Number(mNamed[1]);
    const month = monthFromFrench(mNamed[2]);
    const year = mNamed[3] ? Number(mNamed[3]) : now.year;
    if (month) {
      const dt = DateTime.fromObject(
        { year, month, day: dateDay },
        { zone: tz },
      ).startOf('day');
      if (dt.isValid) {
        day = !mNamed[3] && dt < now ? dt.plus({ years: 1 }) : dt;
        hasExplicitDate = true;
        return { day, hasExplicitDate };
      }
    }
  }

  const mDayOnly = textNorm.match(
    /\b(?:le|au|a|du|de)\s+(\d{1,2})(?!\s*(?:h|:))\b/,
  );
  if (mDayOnly) {
    const dateDay = Number(mDayOnly[1]);
    let dt = DateTime.fromObject(
      { year: baseDay.year, month: baseDay.month, day: dateDay },
      { zone: tz },
    ).startOf('day');
    if (!dt.isValid) {
      const nextMonth = baseDay.plus({ months: 1 });
      dt = DateTime.fromObject(
        { year: nextMonth.year, month: nextMonth.month, day: dateDay },
        { zone: tz },
      ).startOf('day');
    }
    if (dt.isValid) {
      if (baseIsToday && dt < now) dt = dt.plus({ months: 1 });
      day = dt;
      hasExplicitDate = true;
      return { day, hasExplicitDate };
    }
  }

  if (/\bapres[- ]demain\b/.test(textNorm)) {
    day = now.plus({ days: 2 });
    hasExplicitDate = true;
    return { day, hasExplicitDate };
  }
  if (/\bdemain\b/.test(textNorm)) {
    day = now.plus({ days: 1 });
    hasExplicitDate = true;
    return { day, hasExplicitDate };
  }
  if (/\baujourd/.test(textNorm)) {
    day = now;
    hasExplicitDate = true;
    return { day, hasExplicitDate };
  }

  const weeks = textNorm.match(/\bdans\s+(\d+)\s+semaine/);
  const weekOffset = weeks ? Number(weeks[1]) : 0;

  const dayMatch = textNorm.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/,
  );
  if (dayMatch) {
    const target = WEEKDAYS[dayMatch[1]];
    const ref = now.plus({ weeks: weekOffset });
    const monday = ref.minus({ days: ref.weekday - 1 }).startOf('day');
    let dt = monday.plus({ days: target - 1 });
    if (!weeks && dt < now) dt = dt.plus({ weeks: 1 });
    day = dt;
    hasExplicitDate = true;
    return { day, hasExplicitDate };
  }

  if (weekOffset > 0) {
    day = day.plus({ weeks: weekOffset });
    hasExplicitDate = true;
  }

  return { day, hasExplicitDate };
}

export function resolveWhenWindow(
  inputText: string,
  tz = 'Europe/Paris',
  options: ResolveWhenWindowOptions = {},
): ResolvedWhenWindow {
  const raw = inputText.trim();
  const directIso = DateTime.fromISO(raw, { zone: tz });
  if (directIso.isValid) {
    return {
      startIso: directIso.toISO({ suppressMilliseconds: true })!,
      hasExplicitDate: true,
      hasExplicitTime: true,
    };
  }

  const textNorm = normalizeText(raw);
  const baseDay = toBaseDay(options.baseDate, tz);
  const { day, hasExplicitDate } = resolveDateFromText(textNorm, tz, baseDay);

  const defaultHour =
    options.defaultHour !== undefined ? options.defaultHour : 9;
  const defaultMinute =
    options.defaultMinute !== undefined ? options.defaultMinute : 0;
  let startHour = defaultHour;
  let startMinute = defaultMinute;
  let endHour: number | undefined;
  let endMinute: number | undefined;
  let hasExplicitTime = false;

  const rangeMatch = textNorm.match(
    /\bde\s+((?:\d{1,2}(?:h|:)\d{0,2}|midi|minuit))\s*(?:a|-|jusqu(?:e| )a)\s+((?:\d{1,2}(?:h|:)\d{0,2}|midi|minuit))\b/,
  );
  if (rangeMatch) {
    const startToken = parseTimeToken(rangeMatch[1]);
    const endToken = parseTimeToken(rangeMatch[2]);
    if (startToken && endToken) {
      startHour = startToken.hour;
      startMinute = startToken.minute;
      endHour = endToken.hour;
      endMinute = endToken.minute;
      hasExplicitTime = true;
    }
  }

  if (!hasExplicitTime) {
    const singleMatch = textNorm.match(
      /\b(\d{1,2}(?:h|:)\d{0,2}|midi|minuit)\b/,
    );
    if (singleMatch) {
      const t = parseTimeToken(singleMatch[1]);
      if (t) {
        startHour = t.hour;
        startMinute = t.minute;
        hasExplicitTime = true;
      }
    }
  }

  const start = day.set({
    hour: startHour,
    minute: startMinute,
    second: 0,
    millisecond: 0,
  });

  let endIso: string | undefined;
  if (endHour !== undefined && endMinute !== undefined) {
    let end = day.set({
      hour: endHour,
      minute: endMinute,
      second: 0,
      millisecond: 0,
    });
    if (end <= start) end = end.plus({ days: 1 });
    endIso = end.toISO({ suppressMilliseconds: true })!;
  }

  return {
    startIso: start.toISO({ suppressMilliseconds: true })!,
    endIso,
    hasExplicitDate,
    hasExplicitTime,
  };
}

export function resolveWhen(inputText: string, tz = 'Europe/Paris') {
  const text = inputText.trim().toLowerCase();
  let dt = DateTime.now().setZone(tz).startOf('day');

  // "dans N semaines"
  const weeks = text.match(/\bdans\s+(\d+)\s+semaine/);
  if (weeks) {
    dt = dt.plus({ weeks: Number(weeks[1]) });
  }

  // jour de semaine (si présent)
  const dayMatch = text.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/,
  );
  if (dayMatch) {
    const target = WEEKDAYS[dayMatch[1]];
    // mardi de la semaine de dt (après avoir appliqué +N semaines)
    const monday = dt.minus({ days: dt.weekday - 1 });
    dt = monday.plus({ days: target - 1 });
    // si pas de "dans N semaines", on prend le prochain
    if (!weeks && dt <= DateTime.now().setZone(tz)) dt = dt.plus({ weeks: 1 });
  } else {
    // "demain" / "après-demain" si pas de jour explicite
    if (/\baprès[- ]demain\b/.test(text)) dt = dt.plus({ days: 2 });
    else if (/\bdemain\b/.test(text)) dt = dt.plus({ days: 1 });
  }

  const { hour, minute } = parseTime(text);
  dt = dt.set({ hour, minute });

  return dt.toISO({ suppressMilliseconds: true });
}
