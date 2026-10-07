import { isDeferredCapability } from './beta-capabilities';
import { parseToolCall } from './tool-call';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_META, type ToolName } from './tool-registry';

const EXPECTED_TOOLS: Record<ToolName, true> = {
  'action.history': true,
  'analytics.forecast': true,
  'analytics.trend': true,
  'budget.set': true,
  'budget.status': true,
  'calendar.create': true,
  'calendar.delete': true,
  'calendar.duration': true,
  'calendar.has': true,
  'calendar.list': true,
  'calendar.update': true,
  'conflict.detect': true,
  'contact.delete': true,
  'contact.find': true,
  'contact.list': true,
  'contact.save': true,
  'contact.update': true,
  'daily.briefing': true,
  'delegation.create': true,
  'delegation.escalate': true,
  'delegation.list': true,
  'delegation.resolve': true,
  'dependency.add': true,
  'dependency.list': true,
  'dependency.order': true,
  'expense.add': true,
  'expense.list': true,
  'expense.summary': true,
  'gmail.archive': true,
  'gmail.bulk_mark_read': true,
  'gmail.delete': true,
  'gmail.get': true,
  'gmail.list': true,
  'gmail.mark_read': true,
  'gmail.mark_unread': true,
  'gmail.send': true,
  'gmail.summary': true,
  'gmail.trash': true,
  'gmail.unarchive': true,
  'gmail.untrash': true,
  'goal.create': true,
  'goal.decompose': true,
  'goal.done': true,
  'goal.list': true,
  'habit.archive': true,
  'habit.create': true,
  'habit.list': true,
  'habit.log': true,
  'habit.streak': true,
  'help.create': true,
  'help.find': true,
  'knowledge.find': true,
  'knowledge.list': true,
  'knowledge.save': true,
  'memory.forget': true,
  'memory.list': true,
  'memory.remember': true,
  'mission.close': true,
  'mission.list': true,
  'mission.plan': true,
  'note.add': true,
  'note.delete': true,
  'note.list': true,
  'note.search': true,
  'note.update': true,
  'reminder.create': true,
  'reminder.delete': true,
  'reminder.done': true,
  'reminder.list': true,
  'reminder.snooze': true,
  'resource.allocate': true,
  'resource.capacity': true,
  'resource.optimize': true,
  'schedule.apply': true,
  'schedule.list': true,
  'schedule.next_slot': true,
  'schedule.suggest': true,
  'search.query': true,
  'shopping.add': true,
  'shopping.bought': true,
  'shopping.bought_all': true,
  'shopping.bulk_bought': true,
  'shopping.bulk_delete': true,
  'shopping.clear_all': true,
  'shopping.clear_bought': true,
  'shopping.delete': true,
  'shopping.list': true,
  'shopping.unbought': true,
  'shopping.update': true,
  'time.record': true,
  'time.summary': true,
  'todo.add': true,
  'todo.bulk_delete': true,
  'todo.bulk_done': true,
  'todo.clear_all': true,
  'todo.clear_done': true,
  'todo.delete': true,
  'todo.done': true,
  'todo.done_all': true,
  'todo.list': true,
  'todo.reopen': true,
  'todo.update': true,
  'undo.last_action': true,
  'weather.forecast': true,
  'web.open': true,
  'web.search': true,
  'workflow.list': true,
};

describe('tool definitions', () => {
  it('defines every ToolName exactly once and nothing else', () => {
    expect(Object.keys(TOOL_DEFINITIONS).sort()).toEqual(
      Object.keys(EXPECTED_TOOLS).sort(),
    );
  });

  it('keeps each definition name equal to its key', () => {
    for (const [key, def] of Object.entries(TOOL_DEFINITIONS)) {
      expect(def.name).toBe(key as ToolName);
    }
  });

  it('derives TOOL_META and deferral from the definitions', () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      expect(TOOL_META[def.name]).toEqual({
        risk: def.risk,
        requiresConfirmation: def.requiresConfirmation,
        sideEffect: def.sideEffect,
      });
      expect(isDeferredCapability(def.name)).toBe(def.deferred);
    }
  });

  it('never lets the parser return a different tool than the one named', () => {
    for (const def of Object.values(TOOL_DEFINITIONS)) {
      const parsed = parseToolCall(
        JSON.stringify({ type: 'tool', name: def.name, args: {} }),
      );
      expect(
        parsed === null || (parsed.type === 'tool' && parsed.name === def.name),
      ).toBe(true);
    }
  });

  it('rejects tool names that have no definition', () => {
    expect(
      parseToolCall(
        JSON.stringify({ type: 'tool', name: 'nope.nope', args: {} }),
      ),
    ).toBeNull();
  });
});
