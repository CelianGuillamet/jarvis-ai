type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean>;

export function cx(...values: ClassValue[]) {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim();
      if (s) out.push(s);
      continue;
    }
    if (typeof v === 'object') {
      for (const [k, enabled] of Object.entries(v)) {
        if (!enabled) continue;
        const s = k.trim();
        if (s) out.push(s);
      }
    }
  }
  return out.join(' ');
}

