import { parseToolCall } from './tool-call';

const parse = (name: string, args: unknown) =>
  parseToolCall(JSON.stringify({ type: 'tool', name, args }));

describe('tool argument validation', () => {
  it.each([null, [], 2, 'args'])(
    'rejects malformed argument containers: %p',
    (args) => {
      expect(parse('calendar.create', args)).toBeNull();
    },
  );

  it('keeps empty-argument tools typed and rejects unknown names', () => {
    expect(parse('todo.clear_all', {})).toEqual({
      type: 'tool',
      name: 'todo.clear_all',
      args: {},
    });
    expect(parse('unknown.tool', {})).toBeNull();
  });

  it('validates calendar date ranges and reference numbers', () => {
    expect(
      parse('calendar.list', {
        startIso: 'invalid',
        endIso: '2026-09-22T10:00:00Z',
      }),
    ).toBeNull();
    expect(parse('calendar.delete', { ref: '1' })).toBeNull();
    expect(parse('calendar.delete', { ref: 1 })).toEqual({
      type: 'tool',
      name: 'calendar.delete',
      args: { ref: 1 },
    });
  });

  it('distinguishes absent note fields from explicit null', () => {
    expect(parse('note.update', { query: 'fixture' })).toBeNull();
    expect(parse('note.update', { query: 'fixture', title: null })).toEqual({
      type: 'tool',
      name: 'note.update',
      args: { query: 'fixture', title: null },
    });
    expect(parse('note.update', { query: 'fixture', title: {} })).toBeNull();
  });

  it('validates Gmail categories', () => {
    expect(parse('gmail.list', { category: {} })).toBeNull();
    expect(parse('gmail.list', { category: 'promotions' })).toMatchObject({
      name: 'gmail.list',
      args: { category: 'promotions' },
    });
  });
});
