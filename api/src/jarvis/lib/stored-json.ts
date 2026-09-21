/** Legacy tag columns tolerate malformed values by returning an empty list. */
export function parseStoredTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'string')
      ? value
      : [];
  } catch {
    return [];
  }
}

/** Invalid forecast data must fail instead of producing misleading arithmetic. */
export function parseStoredNumbers(raw: string): number[] {
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is number =>
        typeof item === 'number' && Number.isFinite(item),
    )
  ) {
    throw new Error('Invalid stored numeric series');
  }
  return value;
}
