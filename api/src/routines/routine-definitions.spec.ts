import '../jarvis/tools/tools';
import {
  ROUTINES,
  validateRoutine,
  type RoutineDefinition,
} from './routine-definitions';

const routine = (steps: RoutineDefinition['steps']): RoutineDefinition => ({
  key: 'x',
  title: 't',
  description: 'd',
  steps,
});

describe('routine definitions', () => {
  it('accepts the built-in routines as canonical read-only calls', () => {
    for (const definition of ROUTINES)
      expect(validateRoutine(definition).length).toBe(definition.steps.length);
  });

  it.each([
    ['todo.add', { text: 'x' }],
    ['gmail.send', { to: 'a@b.c', subject: 's', body: 'b' }],
    ['calendar.create', { title: 't', when: 'demain' }],
    ['not.a.tool', {}],
    ['todo.list', { show: 'everything' }],
  ])('rejects %s', (tool, args) => {
    expect(() =>
      validateRoutine(routine([{ id: 's', label: 'l', tool, args }])),
    ).toThrow();
  });

  it('rejects empty, oversized and duplicate-id routines', () => {
    const step = (id: string) => ({
      id,
      label: 'l',
      tool: 'todo.list',
      args: {},
    });
    expect(() => validateRoutine(routine([]))).toThrow();
    expect(() =>
      validateRoutine(
        routine(Array.from({ length: 9 }, (_, i) => step(`s${i}`))),
      ),
    ).toThrow();
    expect(() => validateRoutine(routine([step('a'), step('a')]))).toThrow();
  });
});
