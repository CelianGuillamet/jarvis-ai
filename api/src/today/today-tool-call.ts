import type { TodayMutation } from '../contracts/v1';
import type { ToolOnly } from '../jarvis/tools/tool-registry';

/** Explicit operations reuse the local command handlers without model routing. */
export function todayToolCall(input: TodayMutation): ToolOnly {
  switch (input.operation) {
    case 'task.create':
      return { type: 'tool', name: 'todo.add', args: { text: input.text } };
    case 'task.edit':
      return {
        type: 'tool',
        name: 'todo.update',
        args: { query: input.id, text: input.text },
      };
    case 'task.complete':
      return { type: 'tool', name: 'todo.done', args: { query: input.id } };
    case 'task.reopen':
      return { type: 'tool', name: 'todo.reopen', args: { query: input.id } };
    case 'note.create':
      return {
        type: 'tool',
        name: 'note.add',
        args: {
          text: input.text,
          ...(input.title !== null ? { title: input.title } : {}),
        },
      };
    case 'note.edit':
      return {
        type: 'tool',
        name: 'note.update',
        args: { query: input.id, title: input.title, text: input.text },
      };
  }
}
