export function readStorageString(key: string, fallback: string) {
  try {
    const v = localStorage.getItem(key);
    return typeof v === 'string' && v.trim() ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageString(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function readStorageNumber(key: string, fallback: number) {
  const raw = readStorageString(key, '');
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

export function writeStorageNumber(key: string, value: number) {
  writeStorageString(key, String(value));
}

