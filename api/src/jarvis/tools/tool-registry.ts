import type { ToolCall } from './tools';

export type ToolOnly = Extract<ToolCall, { type: 'tool' }>;
export type ToolName = ToolOnly['name'];
export type ToolRiskLevel = 'low' | 'medium' | 'high';

export type ToolMetadata = {
  requiresConfirmation: boolean;
  sideEffect: boolean;
  risk: ToolRiskLevel;
};

export const TOOL_META: Record<ToolName, ToolMetadata> = {
  'todo.add': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'todo.list': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'todo.done': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'todo.reopen': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'todo.done_all': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'todo.update': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'todo.delete': { requiresConfirmation: true, sideEffect: true, risk: 'high' },
  'todo.bulk_done': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'todo.bulk_delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'todo.clear_done': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'todo.clear_all': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },

  'calendar.create': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },
  'calendar.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'calendar.has': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'calendar.duration': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'calendar.delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'calendar.update': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },

  'note.add': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'note.list': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'note.search': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'note.update': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'note.delete': { requiresConfirmation: true, sideEffect: true, risk: 'high' },

  'shopping.add': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'shopping.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'shopping.bought': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'shopping.unbought': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'shopping.bought_all': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'shopping.update': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'shopping.delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'shopping.bulk_bought': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'shopping.bulk_delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'shopping.clear_bought': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },
  'shopping.clear_all': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },

  'weather.forecast': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'web.search': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'web.open': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'gmail.list': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'gmail.get': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'gmail.summary': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'gmail.send': { requiresConfirmation: true, sideEffect: true, risk: 'high' },
  'gmail.mark_read': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'gmail.bulk_mark_read': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },
  'gmail.mark_unread': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'gmail.archive': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'gmail.unarchive': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'gmail.trash': { requiresConfirmation: true, sideEffect: true, risk: 'high' },
  'gmail.untrash': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'gmail.delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'high',
  },

  'undo.last_action': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'medium',
  },
  'action.history': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'workflow.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'daily.briefing': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'mission.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'mission.close': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },
  'mission.plan': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'memory.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'memory.set': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'memory.forget': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },

  'goal.create': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'goal.list': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'goal.decompose': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'goal.done': { requiresConfirmation: false, sideEffect: true, risk: 'low' },

  'conflict.detect': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'dependency.add': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'dependency.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'dependency.order': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'resource.allocate': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'resource.capacity': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'resource.optimize': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'analytics.forecast': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'analytics.trend': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'schedule.suggest': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'schedule.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'schedule.apply': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'schedule.next_slot': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'help.create': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'help.find': { requiresConfirmation: false, sideEffect: false, risk: 'low' },

  'search.query': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'knowledge.save': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'knowledge.find': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'knowledge.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'time.record': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'time.summary': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },

  'delegation.create': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'delegation.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'delegation.escalate': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },
  'delegation.resolve': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },

  'reminder.create': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'reminder.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'reminder.done': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'reminder.snooze': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'reminder.delete': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },

  'habit.create': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'habit.list': { requiresConfirmation: false, sideEffect: false, risk: 'low' },
  'habit.log': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'habit.streak': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'habit.archive': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },

  'contact.save': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'contact.find': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'contact.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'contact.update': {
    requiresConfirmation: false,
    sideEffect: true,
    risk: 'low',
  },
  'contact.delete': {
    requiresConfirmation: true,
    sideEffect: true,
    risk: 'medium',
  },

  'expense.add': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'expense.list': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'expense.summary': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
  'budget.set': { requiresConfirmation: false, sideEffect: true, risk: 'low' },
  'budget.status': {
    requiresConfirmation: false,
    sideEffect: false,
    risk: 'low',
  },
};
