export function createId(prefix = 'id') {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    const rand = Math.random().toString(16).slice(2);
    return `${prefix}_${Date.now().toString(16)}_${rand}`;
  }
}

