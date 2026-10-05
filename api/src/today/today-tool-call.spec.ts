import { todayToolCall } from './today-tool-call';

describe('Deterministic Today operations', () => {
  const id = 'd0c5cb3a-1203-4d1a-94ec-11f4ebfb69b0';
  it('uses resource IDs for task edits and completion', () => {
    expect(
      todayToolCall({ operation: 'task.edit', id, text: 'New text' }),
    ).toEqual({
      type: 'tool',
      name: 'todo.update',
      args: { query: id, text: 'New text' },
    });
    expect(todayToolCall({ operation: 'task.complete', id })).toEqual({
      type: 'tool',
      name: 'todo.done',
      args: { query: id },
    });
    expect(todayToolCall({ operation: 'task.reopen', id })).toEqual({
      type: 'tool',
      name: 'todo.reopen',
      args: { query: id },
    });
  });
  it('preserves explicit title removal during note edits', () => {
    expect(
      todayToolCall({ operation: 'note.edit', id, title: null, text: 'Body' }),
    ).toEqual({
      type: 'tool',
      name: 'note.update',
      args: { query: id, title: null, text: 'Body' },
    });
  });
  it('maps creation without arbitrary tool selection', () => {
    expect(todayToolCall({ operation: 'task.create', text: 'Task' })).toEqual({
      type: 'tool',
      name: 'todo.add',
      args: { text: 'Task' },
    });
    expect(
      todayToolCall({ operation: 'note.create', title: null, text: 'Body' }),
    ).toEqual({ type: 'tool', name: 'note.add', args: { text: 'Body' } });
  });
});
