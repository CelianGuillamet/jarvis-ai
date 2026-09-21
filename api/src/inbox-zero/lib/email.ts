function normalizeSubject(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function buildReplySubject(originalSubject: string) {
  const subject = normalizeSubject(originalSubject || '');
  if (!subject) return 'Re:';
  if (/^\s*re\s*:/i.test(subject)) return subject;
  return `Re: ${subject}`;
}

export function extractEmailAddress(raw: string) {
  const value = (raw || '').trim();
  if (!value) return '';
  const angle = value.match(/<([^>]+)>/);
  const candidate = (angle?.[1] || value).trim();
  const mail = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (mail?.[0] || '').trim();
}

export function compactText(value: string, maxChars: number) {
  const clean = (value || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
