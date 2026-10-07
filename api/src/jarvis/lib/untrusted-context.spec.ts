import { isUntrustedOutputTool } from './untrusted-context';

describe('isUntrustedOutputTool', () => {
  it.each([
    'gmail.list',
    'gmail.get',
    'gmail.summary',
    'calendar.list',
    'daily.briefing',
    'mission.plan',
  ] as const)('treats %s output as third-party content', (name) => {
    expect(isUntrustedOutputTool(name)).toBe(true);
  });

  it.each([
    'todo.add',
    'todo.list',
    'note.add',
    'memory.list',
    'weather.forecast',
  ] as const)('treats %s output as first-party', (name) => {
    expect(isUntrustedOutputTool(name)).toBe(false);
  });
});
