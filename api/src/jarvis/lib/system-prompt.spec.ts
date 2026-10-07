import { buildJarvisBaseSystemPrompt } from './system-prompt';

describe('system prompt capabilities', () => {
  const prompt = buildJarvisBaseSystemPrompt();

  it.each([
    'habit.',
    'expense.',
    'budget.',
    'delegation.',
    'analytics.',
    'resource.',
    'reminder.',
    'gmail.delete',
  ])('does not advertise deferred tools (%s)', (needle) => {
    expect(prompt).not.toContain(needle);
  });

  it('still advertises the retained tools', () => {
    for (const name of [
      'todo.add',
      'calendar.create',
      'gmail.send',
      'memory.remember',
    ])
      expect(prompt).toContain(name);
  });

  it('makes no reminder or finance delivery promise', () => {
    expect(prompt).not.toMatch(/rappel|finance|budget/i);
  });
});
