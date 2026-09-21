import { buildReplySubject, compactText, extractEmailAddress } from './email';

describe('email utils', () => {
  it('buildReplySubject prefixes Re:', () => {
    expect(buildReplySubject('Hello')).toBe('Re: Hello');
    expect(buildReplySubject('Re: Hello')).toBe('Re: Hello');
    expect(buildReplySubject('  re:   Hello  ')).toBe('re: Hello');
  });

  it('extractEmailAddress parses angle brackets', () => {
    expect(extractEmailAddress('John Doe <john@example.com>')).toBe(
      'john@example.com',
    );
    expect(extractEmailAddress('john@example.com')).toBe('john@example.com');
  });

  it('compactText truncates', () => {
    expect(compactText('abc', 10)).toBe('abc');
    expect(compactText('a'.repeat(20), 10).length).toBeLessThanOrEqual(10);
  });
});
