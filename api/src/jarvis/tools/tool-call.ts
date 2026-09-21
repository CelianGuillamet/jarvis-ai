import { DateTime } from 'luxon';

import { GMAIL_CATEGORIES } from '../../gmail/gmail-category';
import type { ToolCall } from './tools';

type ToolOnly = Extract<ToolCall, { type: 'tool' }>;
type ToolName = ToolOnly['name'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === 'string' && allowed.includes(v as T);
}

function parseRefsArray(v: unknown) {
  if (!Array.isArray(v)) return null;
  if (v.length < 1 || v.length > 50) return null;
  const out: number[] = [];
  for (const item of v) {
    if (typeof item !== 'number' || !Number.isInteger(item)) return null;
    if (item < 1 || item > 999) return null;
    out.push(item);
  }
  return out;
}

function parseStringArray(v: unknown, max = 20) {
  if (!Array.isArray(v) || v.length > max) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string' || !item.trim()) return null;
    out.push(item.trim());
  }
  return out;
}

function isValidIsoDateTime(value: string) {
  return DateTime.fromISO(value).isValid;
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return DateTime.fromISO(value).isValid;
}

export function parseToolCall(jsonText: string): ToolCall | null {
  let x: unknown;
  try {
    x = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(x) || typeof x.type !== 'string') return null;

  if (x.type === 'final') {
    if (typeof x.text !== 'string') return null;
    return { type: 'final', text: x.text };
  }

  if (x.type !== 'tool') return null;
  if (typeof x.name !== 'string' || !isRecord(x.args)) return null;

  const name = x.name as ToolName;
  const args = x.args;

  if (name === 'todo.add') {
    if (typeof args.text !== 'string') return null;
    return { type: 'tool', name, args: { text: args.text } };
  }

  if (name === 'todo.list') {
    const show = args.show;
    if (show !== undefined && !isOneOf(show, ['open', 'all'] as const))
      return null;
    return { type: 'tool', name, args: show ? { show } : {} };
  }

  if (name === 'todo.done') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'todo.reopen') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'todo.done_all') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'todo.update') {
    if (typeof args.query !== 'string' || typeof args.text !== 'string')
      return null;
    return {
      type: 'tool',
      name,
      args: { query: args.query, text: args.text },
    };
  }

  if (name === 'todo.delete') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'todo.bulk_done' || name === 'todo.bulk_delete') {
    const refs = parseRefsArray(args.refs);
    if (!refs) return null;
    return { type: 'tool', name, args: { refs } };
  }

  if (name === 'todo.clear_done') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'todo.clear_all') {
    return { type: 'tool', name, args: {} };
  }

  // calendar.list : rangeText libre + limit optionnel
  if (name === 'calendar.list') {
    const hasRangeText = typeof args.rangeText === 'string';
    const hasStartIso = typeof args.startIso === 'string';
    const hasEndIso = typeof args.endIso === 'string';
    if (!hasRangeText && !(hasStartIso && hasEndIso)) return null;
    if ((hasStartIso && !hasEndIso) || (!hasStartIso && hasEndIso)) return null;

    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' || limit < 1 || limit > 100)
    )
      return null;

    const out: Extract<ToolOnly, { name: 'calendar.list' }>['args'] = {};
    if (typeof args.rangeText === 'string') out.rangeText = args.rangeText;
    if (typeof args.startIso === 'string' && typeof args.endIso === 'string') {
      const start = DateTime.fromISO(args.startIso);
      const end = DateTime.fromISO(args.endIso);
      if (!start.isValid || !end.isValid || end <= start) return null;
      out.startIso =
        start.toISO({ suppressMilliseconds: true }) ?? args.startIso;
      out.endIso = end.toISO({ suppressMilliseconds: true }) ?? args.endIso;
    }

    if (typeof limit === 'number') out.limit = limit;
    return { type: 'tool', name, args: out };
  }

  if (name === 'calendar.has') {
    const hasWhen = typeof args.when === 'string';
    const hasStartIso = typeof args.startIso === 'string';
    const hasEndIso = typeof args.endIso === 'string';
    if (!hasWhen && !(hasStartIso && hasEndIso)) return null;
    if ((hasStartIso && !hasEndIso) || (!hasStartIso && hasEndIso)) return null;

    const out: Extract<ToolOnly, { name: 'calendar.has' }>['args'] = {};
    if (typeof args.when === 'string') out.when = args.when;
    if (typeof args.startIso === 'string' && typeof args.endIso === 'string') {
      const start = DateTime.fromISO(args.startIso);
      const end = DateTime.fromISO(args.endIso);
      if (!start.isValid || !end.isValid || end <= start) return null;
      out.startIso =
        start.toISO({ suppressMilliseconds: true }) ?? args.startIso;
      out.endIso = end.toISO({ suppressMilliseconds: true }) ?? args.endIso;
    }
    return { type: 'tool', name, args: out };
  }

  if (name === 'calendar.duration') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasQuery) return null;

    const out: { ref?: number; query?: string } = {};
    if (hasRef && typeof args.ref === 'number') out.ref = args.ref;
    if (hasQuery && typeof args.query === 'string') out.query = args.query;
    return { type: 'tool', name, args: out };
  }

  if (name === 'calendar.create') {
    if (typeof args.title !== 'string') return null;
    const when = typeof args.when === 'string' ? args.when : '';
    const endWhen = typeof args.endWhen === 'string' ? args.endWhen : undefined;
    return {
      type: 'tool',
      name,
      args: endWhen
        ? { title: args.title, when, endWhen }
        : { title: args.title, when },
    };
  }

  if (name === 'calendar.delete') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasQuery) return null;

    const out: { ref?: number; query?: string } = {};
    if (hasRef && typeof args.ref === 'number') out.ref = args.ref;
    if (hasQuery && typeof args.query === 'string') out.query = args.query;
    return { type: 'tool', name, args: out };
  }

  if (name === 'calendar.update') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasQuery) return null;

    const hasTitle = Object.hasOwn(args, 'title');
    const hasWhen = Object.hasOwn(args, 'when');
    const hasEndWhen = Object.hasOwn(args, 'endWhen');
    if (!hasTitle && !hasWhen && !hasEndWhen) return null;

    const out: {
      ref?: number;
      query?: string;
      title?: string;
      when?: string;
      endWhen?: string;
    } = {};
    if (hasRef && typeof args.ref === 'number') out.ref = args.ref;
    if (hasQuery && typeof args.query === 'string') out.query = args.query;

    if (hasTitle) {
      if (typeof args.title !== 'string') return null;
      out.title = args.title;
    }
    if (hasWhen) {
      if (typeof args.when !== 'string') return null;
      out.when = args.when;
    }
    if (hasEndWhen) {
      if (typeof args.endWhen !== 'string') return null;
      out.endWhen = args.endWhen;
    }
    return { type: 'tool', name, args: out };
  }

  if (name === 'note.add') {
    if (typeof args.text !== 'string') return null;
    const title = args.title;
    if (title !== undefined && typeof title !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: title ? { title, text: args.text } : { text: args.text },
    };
  }

  if (name === 'note.search') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'note.list') {
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: typeof limit === 'number' ? { limit } : {},
    };
  }

  if (name === 'note.update') {
    if (typeof args.query !== 'string') return null;
    const hasTitle = Object.hasOwn(args, 'title');
    const hasText = Object.hasOwn(args, 'text');
    if (!hasTitle && !hasText) return null;

    const out: { query: string; title?: string | null; text?: string } = {
      query: args.query,
    };

    if (hasTitle) {
      if (args.title !== null && typeof args.title !== 'string') return null;
      out.title = args.title;
    }
    if (hasText) {
      if (typeof args.text !== 'string') return null;
      out.text = args.text;
    }
    return { type: 'tool', name, args: out };
  }

  if (name === 'note.delete') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'shopping.add') {
    if (typeof args.text !== 'string') return null;
    return { type: 'tool', name, args: { text: args.text } };
  }

  if (name === 'shopping.list') {
    const show = args.show;
    if (show !== undefined && !isOneOf(show, ['open', 'all'] as const))
      return null;
    return { type: 'tool', name, args: show ? { show } : {} };
  }

  if (name === 'shopping.bought') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'shopping.unbought') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'shopping.bought_all') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'shopping.update') {
    if (typeof args.query !== 'string' || typeof args.text !== 'string')
      return null;
    return {
      type: 'tool',
      name,
      args: { query: args.query, text: args.text },
    };
  }

  if (name === 'shopping.delete') {
    if (typeof args.query !== 'string') return null;
    return { type: 'tool', name, args: { query: args.query } };
  }

  if (name === 'shopping.bulk_bought' || name === 'shopping.bulk_delete') {
    const refs = parseRefsArray(args.refs);
    if (!refs) return null;
    return { type: 'tool', name, args: { refs } };
  }

  if (name === 'shopping.clear_bought') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'shopping.clear_all') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'weather.forecast') {
    const location =
      typeof args.location === 'string' ? args.location.trim() : undefined;
    const day = args.day;
    if (day !== undefined && !isOneOf(day, ['today', 'tomorrow'] as const)) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(location ? { location } : {}),
        ...(typeof day === 'string' ? { day } : {}),
      },
    };
  }

  if (name === 'web.search') {
    if (typeof args.query !== 'string') return null;
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 10)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args:
        typeof limit === 'number'
          ? { query: args.query, limit }
          : { query: args.query },
    };
  }

  if (name === 'web.open') {
    if (typeof args.url !== 'string') return null;
    return { type: 'tool', name, args: { url: args.url } };
  }

  if (name === 'gmail.list') {
    const query =
      typeof args.query === 'string' ? args.query.trim() : undefined;
    if (args.unreadOnly !== undefined && typeof args.unreadOnly !== 'boolean') {
      return null;
    }
    const unreadOnly = args.unreadOnly;
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50)
    ) {
      return null;
    }
    if (
      args.category !== undefined &&
      !isOneOf(args.category, GMAIL_CATEGORIES)
    ) {
      return null;
    }
    const category = args.category;

    return {
      type: 'tool',
      name,
      args: {
        ...(query ? { query } : {}),
        ...(unreadOnly === undefined ? {} : { unreadOnly }),
        ...(typeof limit === 'number' ? { limit } : {}),
        ...(category ? { category } : {}),
      },
    };
  }

  if (name === 'gmail.send') {
    if (
      typeof args.to !== 'string' ||
      typeof args.subject !== 'string' ||
      typeof args.text !== 'string'
    ) {
      return null;
    }
    if (args.cc !== undefined && typeof args.cc !== 'string') return null;
    if (args.bcc !== undefined && typeof args.bcc !== 'string') return null;

    const to = args.to.trim();
    const subject = args.subject.trim();
    const text = args.text.trim();
    if (!to || !subject || !text) return null;

    return {
      type: 'tool',
      name,
      args: {
        to,
        subject,
        text,
        ...(typeof args.cc === 'string' && args.cc.trim()
          ? { cc: args.cc.trim() }
          : {}),
        ...(typeof args.bcc === 'string' && args.bcc.trim()
          ? { bcc: args.bcc.trim() }
          : {}),
      },
    };
  }

  if (name === 'gmail.summary') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const query =
      typeof args.query === 'string' ? args.query.trim() : undefined;
    const hasQuery = !!query;

    if (args.unreadOnly !== undefined && typeof args.unreadOnly !== 'boolean') {
      return null;
    }
    const unreadOnly = args.unreadOnly;

    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50)
    ) {
      return null;
    }

    if (
      args.category !== undefined &&
      !isOneOf(args.category, GMAIL_CATEGORIES)
    ) {
      return null;
    }
    const category = args.category;

    const hasMailboxFilters =
      unreadOnly !== undefined || typeof limit === 'number' || !!category;
    if (!hasRef && !hasQuery && !hasMailboxFilters) return null;

    return {
      type: 'tool',
      name,
      args: {
        ...(hasRef && typeof args.ref === 'number' ? { ref: args.ref } : {}),
        ...(hasQuery ? { query } : {}),
        ...(unreadOnly === undefined ? {} : { unreadOnly }),
        ...(typeof limit === 'number' ? { limit } : {}),
        ...(category ? { category } : {}),
      },
    };
  }

  if (name === 'gmail.bulk_mark_read') {
    if (args.unreadOnly !== undefined && typeof args.unreadOnly !== 'boolean') {
      return null;
    }
    const unreadOnly = args.unreadOnly;

    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200)
    ) {
      return null;
    }

    const rawRefs = args.refs;
    let refs: number[] | undefined;
    if (rawRefs !== undefined) {
      if (!Array.isArray(rawRefs)) return null;
      const unique = new Set<number>();
      for (const value of rawRefs) {
        if (typeof value !== 'number' || !Number.isInteger(value)) return null;
        if (value < 1 || value > 200) return null;
        unique.add(value);
      }
      refs = [...unique];
      if (!refs.length) return null;
      refs.sort((a, b) => a - b);
    }

    return {
      type: 'tool',
      name,
      args: {
        ...(refs ? { refs } : {}),
        ...(unreadOnly === undefined ? {} : { unreadOnly }),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (
    name === 'gmail.get' ||
    name === 'gmail.mark_read' ||
    name === 'gmail.mark_unread' ||
    name === 'gmail.archive' ||
    name === 'gmail.unarchive' ||
    name === 'gmail.trash' ||
    name === 'gmail.untrash' ||
    name === 'gmail.delete'
  ) {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasQuery) return null;
    return {
      type: 'tool',
      name,
      args: {
        ...(hasRef && typeof args.ref === 'number' ? { ref: args.ref } : {}),
        ...(hasQuery && typeof args.query === 'string'
          ? { query: args.query }
          : {}),
      },
    };
  }

  if (name === 'undo.last_action') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'action.history') {
    const status = args.status;
    if (status !== undefined && !isOneOf(status, ['pending', 'all'] as const)) {
      return null;
    }
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(status ? { status } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (name === 'workflow.list') {
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (name === 'daily.briefing') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'mission.list') {
    const status = args.status;
    if (status !== undefined && !isOneOf(status, ['active', 'all'] as const)) {
      return null;
    }
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 20)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(status ? { status } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (name === 'mission.close') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasQuery) return null;
    return {
      type: 'tool',
      name,
      args: {
        ...(hasRef && typeof args.ref === 'number' ? { ref: args.ref } : {}),
        ...(hasQuery && typeof args.query === 'string'
          ? { query: args.query.trim() }
          : {}),
      },
    };
  }

  if (name === 'mission.plan') {
    if (typeof args.objective !== 'string') return null;
    const objective = args.objective.trim();
    if (!objective) return null;
    if (args.horizon !== undefined && typeof args.horizon !== 'string')
      return null;
    const horizon =
      typeof args.horizon === 'string' && args.horizon.trim()
        ? args.horizon.trim()
        : undefined;
    return {
      type: 'tool',
      name,
      args: horizon ? { objective, horizon } : { objective },
    };
  }

  if (name === 'memory.list') {
    const layer = args.layer;
    if (
      layer !== undefined &&
      !isOneOf(layer, [
        'identity',
        'preference',
        'project',
        'relationship',
        'workflow',
        'all',
      ] as const)
    ) {
      return null;
    }
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 60)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(layer ? { layer } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (name === 'memory.set') {
    if (
      !isOneOf(args.layer, [
        'identity',
        'preference',
        'project',
        'relationship',
        'workflow',
      ] as const)
    ) {
      return null;
    }
    if (typeof args.key !== 'string' || typeof args.label !== 'string')
      return null;
    if (typeof args.value !== 'string') return null;
    const key = args.key.trim();
    const label = args.label.trim();
    const value = args.value.trim();
    if (!key || !label || !value) return null;

    const confidence = args.confidence;
    if (
      confidence !== undefined &&
      (typeof confidence !== 'number' ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1)
    ) {
      return null;
    }
    const source = args.source;
    if (source !== undefined && typeof source !== 'string') return null;
    const sourceClean =
      typeof source === 'string' && source.trim() ? source.trim() : undefined;

    return {
      type: 'tool',
      name,
      args: {
        layer: args.layer,
        key,
        label,
        value,
        ...(typeof confidence === 'number' ? { confidence } : {}),
        ...(sourceClean ? { source: sourceClean } : {}),
      },
    };
  }

  if (name === 'memory.forget') {
    const hasRef =
      typeof args.ref === 'number' &&
      Number.isInteger(args.ref) &&
      args.ref >= 1 &&
      args.ref <= 200;
    const layer = args.layer;
    const hasLayerKey =
      isOneOf(layer, [
        'identity',
        'preference',
        'project',
        'relationship',
        'workflow',
      ] as const) &&
      typeof args.key === 'string' &&
      args.key.trim().length > 0;
    const hasQuery =
      typeof args.query === 'string' && args.query.trim().length > 0;
    if (!hasRef && !hasLayerKey && !hasQuery) return null;

    return {
      type: 'tool',
      name,
      args: {
        ...(hasRef && typeof args.ref === 'number' ? { ref: args.ref } : {}),
        ...(hasLayerKey && typeof args.key === 'string'
          ? { layer, key: args.key.trim() }
          : {}),
        ...(hasQuery && typeof args.query === 'string'
          ? { query: args.query.trim() }
          : {}),
      },
    };
  }

  if (name === 'goal.create') {
    if (typeof args.title !== 'string') return null;
    const title = args.title.trim();
    if (!title) return null;
    if (args.description !== undefined && typeof args.description !== 'string')
      return null;
    const description =
      typeof args.description === 'string' && args.description.trim()
        ? args.description.trim()
        : undefined;
    const priority = args.priority;
    if (
      priority !== undefined &&
      (typeof priority !== 'number' ||
        !Number.isInteger(priority) ||
        priority < 0 ||
        priority > 10)
    ) {
      return null;
    }
    const targetDate = args.targetDate;
    if (targetDate !== undefined && typeof targetDate !== 'string') return null;
    const targetDateClean =
      typeof targetDate === 'string' && targetDate.trim()
        ? targetDate.trim()
        : undefined;
    const parentGoalId = args.parentGoalId;
    if (parentGoalId !== undefined && typeof parentGoalId !== 'string')
      return null;
    const parentGoalIdClean =
      typeof parentGoalId === 'string' && parentGoalId.trim()
        ? parentGoalId.trim()
        : undefined;

    return {
      type: 'tool',
      name,
      args: {
        title,
        ...(description ? { description } : {}),
        ...(typeof priority === 'number' ? { priority } : {}),
        ...(targetDateClean ? { targetDate: targetDateClean } : {}),
        ...(parentGoalIdClean ? { parentGoalId: parentGoalIdClean } : {}),
      },
    };
  }

  if (name === 'goal.list') {
    const status = args.status;
    if (status !== undefined && !isOneOf(status, ['active', 'all'] as const)) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: status ? { status } : {},
    };
  }

  if (name === 'goal.decompose') {
    if (typeof args.goalId !== 'string' || !args.goalId.trim()) return null;
    if (!Array.isArray(args.subGoals) || args.subGoals.length < 1) return null;
    if (args.subGoals.length > 12) return null;
    const subGoals: Array<{ title: string; priority?: number }> = [];
    for (const item of args.subGoals) {
      if (!isRecord(item) || typeof item.title !== 'string') return null;
      const title = item.title.trim();
      if (!title) return null;
      const priority = item.priority;
      if (
        priority !== undefined &&
        (typeof priority !== 'number' ||
          !Number.isInteger(priority) ||
          priority < 0 ||
          priority > 10)
      ) {
        return null;
      }
      subGoals.push({
        title,
        ...(typeof priority === 'number' ? { priority } : {}),
      });
    }
    return {
      type: 'tool',
      name,
      args: { goalId: args.goalId.trim(), subGoals },
    };
  }

  if (name === 'goal.done') {
    if (typeof args.goalId !== 'string' || !args.goalId.trim()) return null;
    return { type: 'tool', name, args: { goalId: args.goalId.trim() } };
  }

  if (name === 'conflict.detect') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'dependency.add') {
    if (typeof args.sourceTaskId !== 'string' || !args.sourceTaskId.trim())
      return null;
    if (typeof args.targetTaskId !== 'string' || !args.targetTaskId.trim())
      return null;
    const dependencyType = args.dependencyType;
    if (dependencyType !== undefined && typeof dependencyType !== 'string')
      return null;
    const estimatedDays = args.estimatedDays;
    if (
      estimatedDays !== undefined &&
      (typeof estimatedDays !== 'number' ||
        !Number.isInteger(estimatedDays) ||
        estimatedDays < 0 ||
        estimatedDays > 365)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        sourceTaskId: args.sourceTaskId.trim(),
        targetTaskId: args.targetTaskId.trim(),
        ...(typeof dependencyType === 'string' && dependencyType.trim()
          ? { dependencyType: dependencyType.trim() }
          : {}),
        ...(typeof estimatedDays === 'number' ? { estimatedDays } : {}),
      },
    };
  }

  if (name === 'dependency.list') {
    if (typeof args.taskId !== 'string' || !args.taskId.trim()) return null;
    return { type: 'tool', name, args: { taskId: args.taskId.trim() } };
  }

  if (name === 'dependency.order') {
    if (!Array.isArray(args.taskIds) || args.taskIds.length < 1) return null;
    if (args.taskIds.length > 50) return null;
    const taskIds: string[] = [];
    for (const id of args.taskIds) {
      if (typeof id !== 'string' || !id.trim()) return null;
      taskIds.push(id.trim());
    }
    return { type: 'tool', name, args: { taskIds } };
  }

  if (name === 'resource.allocate') {
    if (typeof args.resourceType !== 'string' || !args.resourceType.trim())
      return null;
    if (typeof args.resourceName !== 'string' || !args.resourceName.trim())
      return null;
    const allocatedHours = args.allocatedHours;
    if (
      typeof allocatedHours !== 'number' ||
      !Number.isFinite(allocatedHours) ||
      allocatedHours <= 0 ||
      allocatedHours > 1_000
    ) {
      return null;
    }
    const allocationDate = args.allocationDate;
    if (allocationDate !== undefined && typeof allocationDate !== 'string')
      return null;
    const allocationDateClean =
      typeof allocationDate === 'string' && allocationDate.trim()
        ? allocationDate.trim()
        : undefined;
    const expiryDate = args.expiryDate;
    if (expiryDate !== undefined && typeof expiryDate !== 'string') return null;
    const expiryDateClean =
      typeof expiryDate === 'string' && expiryDate.trim()
        ? expiryDate.trim()
        : undefined;
    return {
      type: 'tool',
      name,
      args: {
        resourceType: args.resourceType.trim(),
        resourceName: args.resourceName.trim(),
        allocatedHours,
        ...(allocationDateClean ? { allocationDate: allocationDateClean } : {}),
        ...(expiryDateClean ? { expiryDate: expiryDateClean } : {}),
      },
    };
  }

  if (name === 'resource.capacity') {
    const resourceType = args.resourceType;
    if (resourceType !== undefined && typeof resourceType !== 'string')
      return null;
    const resourceTypeClean =
      typeof resourceType === 'string' && resourceType.trim()
        ? resourceType.trim()
        : undefined;
    return {
      type: 'tool',
      name,
      args: {
        ...(resourceTypeClean ? { resourceType: resourceTypeClean } : {}),
      },
    };
  }

  if (name === 'resource.optimize') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'analytics.forecast') {
    if (typeof args.metricType !== 'string' || !args.metricType.trim())
      return null;
    if (!Array.isArray(args.historicalData) || !Array.isArray(args.forecast))
      return null;
    const historicalData = args.historicalData.filter(
      (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n),
    );
    const forecast = args.forecast.filter(
      (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n),
    );
    if (!historicalData.length || !forecast.length) return null;
    const accuracy = args.accuracy;
    if (
      accuracy !== undefined &&
      (typeof accuracy !== 'number' ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 1)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        metricType: args.metricType.trim(),
        historicalData,
        forecast,
        ...(typeof accuracy === 'number' ? { accuracy } : {}),
      },
    };
  }

  if (name === 'analytics.trend') {
    if (typeof args.metricType !== 'string' || !args.metricType.trim())
      return null;
    return {
      type: 'tool',
      name,
      args: { metricType: args.metricType.trim() },
    };
  }

  if (name === 'schedule.suggest') {
    if (typeof args.suggestedTime !== 'string' || !args.suggestedTime.trim())
      return null;
    if (typeof args.rationale !== 'string' || !args.rationale.trim())
      return null;
    const taskId = args.taskId;
    if (taskId !== undefined && typeof taskId !== 'string') return null;
    const priority = args.priority;
    if (
      priority !== undefined &&
      (typeof priority !== 'number' ||
        !Number.isInteger(priority) ||
        priority < 0 ||
        priority > 10)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        suggestedTime: args.suggestedTime.trim(),
        rationale: args.rationale.trim(),
        ...(typeof taskId === 'string' && taskId.trim()
          ? { taskId: taskId.trim() }
          : {}),
        ...(typeof priority === 'number' ? { priority } : {}),
      },
    };
  }

  if (name === 'schedule.list') {
    const applied = args.applied;
    if (applied !== undefined && typeof applied !== 'boolean') return null;
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof applied === 'boolean' ? { applied } : {}),
      },
    };
  }

  if (name === 'schedule.apply') {
    if (typeof args.suggestionId !== 'string' || !args.suggestionId.trim())
      return null;
    return {
      type: 'tool',
      name,
      args: { suggestionId: args.suggestionId.trim() },
    };
  }

  if (name === 'schedule.next_slot') {
    const afterDate = args.afterDate;
    if (afterDate !== undefined && typeof afterDate !== 'string') return null;
    const afterDateClean =
      typeof afterDate === 'string' && afterDate.trim()
        ? afterDate.trim()
        : undefined;
    const durationMinutes = args.durationMinutes;
    if (
      durationMinutes !== undefined &&
      (typeof durationMinutes !== 'number' ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 5 ||
        durationMinutes > 24 * 60)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(afterDateClean ? { afterDate: afterDateClean } : {}),
        ...(typeof durationMinutes === 'number' ? { durationMinutes } : {}),
      },
    };
  }

  if (name === 'help.create') {
    if (typeof args.context !== 'string' || !args.context.trim()) return null;
    if (typeof args.contentType !== 'string' || !args.contentType.trim())
      return null;
    if (typeof args.content !== 'string' || !args.content.trim()) return null;
    const relevanceScore = args.relevanceScore;
    if (
      relevanceScore !== undefined &&
      (typeof relevanceScore !== 'number' ||
        !Number.isFinite(relevanceScore) ||
        relevanceScore < 0 ||
        relevanceScore > 1)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        context: args.context.trim(),
        contentType: args.contentType.trim(),
        content: args.content.trim(),
        ...(typeof relevanceScore === 'number' ? { relevanceScore } : {}),
      },
    };
  }

  if (name === 'help.find') {
    if (typeof args.context !== 'string' || !args.context.trim()) return null;
    return {
      type: 'tool',
      name,
      args: { context: args.context.trim() },
    };
  }

  if (name === 'reminder.create') {
    if (typeof args.text !== 'string' || !args.text.trim()) return null;
    if (
      typeof args.triggerAt !== 'string' ||
      !isValidIsoDateTime(args.triggerAt)
    )
      return null;
    const recurring = args.recurring;
    if (recurring !== undefined && typeof recurring !== 'boolean') return null;
    const rrule = args.rrule;
    if (rrule !== undefined && typeof rrule !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        text: args.text.trim(),
        triggerAt: args.triggerAt,
        ...(typeof recurring === 'boolean' ? { recurring } : {}),
        ...(typeof rrule === 'string' && rrule.trim()
          ? { rrule: rrule.trim() }
          : {}),
      },
    };
  }

  if (name === 'reminder.list') {
    const done = args.done;
    if (done !== undefined && typeof done !== 'boolean') return null;
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof done === 'boolean' ? { done } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (
    name === 'reminder.done' ||
    name === 'reminder.delete' ||
    name === 'habit.archive'
  ) {
    if (
      typeof args.ref !== 'number' ||
      !Number.isInteger(args.ref) ||
      args.ref < 1 ||
      args.ref > 200
    ) {
      return null;
    }
    return { type: 'tool', name, args: { ref: args.ref } };
  }

  if (name === 'reminder.snooze') {
    if (
      typeof args.ref !== 'number' ||
      !Number.isInteger(args.ref) ||
      args.ref < 1 ||
      args.ref > 200
    ) {
      return null;
    }
    if (typeof args.until !== 'string' || !isValidIsoDateTime(args.until))
      return null;
    return {
      type: 'tool',
      name,
      args: { ref: args.ref, until: args.until },
    };
  }

  if (name === 'habit.create') {
    if (typeof args.name !== 'string' || !args.name.trim()) return null;
    const emoji = args.emoji;
    if (emoji !== undefined && typeof emoji !== 'string') return null;
    const frequency = args.frequency;
    if (frequency !== undefined && typeof frequency !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        name: args.name.trim(),
        ...(typeof emoji === 'string' && emoji.trim()
          ? { emoji: emoji.trim() }
          : {}),
        ...(typeof frequency === 'string' && frequency.trim()
          ? { frequency: frequency.trim() }
          : {}),
      },
    };
  }

  if (name === 'habit.list') {
    const includeArchived = args.includeArchived;
    if (includeArchived !== undefined && typeof includeArchived !== 'boolean') {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof includeArchived === 'boolean' ? { includeArchived } : {}),
      },
    };
  }

  if (name === 'habit.log') {
    if (
      typeof args.ref !== 'number' ||
      !Number.isInteger(args.ref) ||
      args.ref < 1 ||
      args.ref > 200
    ) {
      return null;
    }
    const date = args.date;
    if (
      date !== undefined &&
      (typeof date !== 'string' || !isValidDateOnly(date))
    )
      return null;
    const note = args.note;
    if (note !== undefined && typeof note !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        ref: args.ref,
        ...(typeof date === 'string' ? { date } : {}),
        ...(typeof note === 'string' && note.trim()
          ? { note: note.trim() }
          : {}),
      },
    };
  }

  if (name === 'habit.streak') {
    return { type: 'tool', name, args: {} };
  }

  if (name === 'contact.save') {
    if (typeof args.name !== 'string' || !args.name.trim()) return null;
    const tags = args.tags;
    if (tags !== undefined && parseStringArray(tags) === null) return null;
    const fields = ['email', 'phone', 'company', 'role', 'notes'] as const;
    for (const field of fields) {
      if (args[field] !== undefined && typeof args[field] !== 'string') {
        return null;
      }
    }
    return {
      type: 'tool',
      name,
      args: {
        name: args.name.trim(),
        ...(typeof args.email === 'string' && args.email.trim()
          ? { email: args.email.trim() }
          : {}),
        ...(typeof args.phone === 'string' && args.phone.trim()
          ? { phone: args.phone.trim() }
          : {}),
        ...(typeof args.company === 'string' && args.company.trim()
          ? { company: args.company.trim() }
          : {}),
        ...(typeof args.role === 'string' && args.role.trim()
          ? { role: args.role.trim() }
          : {}),
        ...(typeof args.notes === 'string' && args.notes.trim()
          ? { notes: args.notes.trim() }
          : {}),
        ...(tags !== undefined ? { tags: parseStringArray(tags) ?? [] } : {}),
      },
    };
  }

  if (name === 'contact.find' || name === 'contact.delete') {
    if (typeof args.query !== 'string' || !args.query.trim()) return null;
    return { type: 'tool', name, args: { query: args.query.trim() } };
  }

  if (name === 'contact.list') {
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: { ...(typeof limit === 'number' ? { limit } : {}) },
    };
  }

  if (name === 'contact.update') {
    if (typeof args.query !== 'string' || !args.query.trim()) return null;
    if (!isRecord(args.patch)) return null;

    const patch: Record<string, unknown> = {};
    const stringFields = ['name', 'email', 'phone', 'company', 'role', 'notes'];
    for (const field of stringFields) {
      const value = args.patch[field];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) return null;
      patch[field] = value.trim();
    }

    if (args.patch.tags !== undefined) {
      const tags = parseStringArray(args.patch.tags);
      if (!tags) return null;
      patch.tags = tags;
    }

    if (!Object.keys(patch).length) return null;
    return {
      type: 'tool',
      name,
      args: { query: args.query.trim(), patch },
    };
  }

  if (name === 'expense.add') {
    if (
      typeof args.amount !== 'number' ||
      !Number.isFinite(args.amount) ||
      args.amount <= 0
    ) {
      return null;
    }
    if (typeof args.category !== 'string' || !args.category.trim()) return null;
    if (typeof args.description !== 'string' || !args.description.trim())
      return null;
    const date = args.date;
    if (
      date !== undefined &&
      (typeof date !== 'string' || !isValidDateOnly(date))
    )
      return null;
    const currency = args.currency;
    if (currency !== undefined && typeof currency !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        amount: args.amount,
        category: args.category.trim(),
        description: args.description.trim(),
        ...(typeof date === 'string' ? { date } : {}),
        ...(typeof currency === 'string' && currency.trim()
          ? { currency: currency.trim().toUpperCase() }
          : {}),
      },
    };
  }

  if (name === 'expense.list') {
    const category = args.category;
    if (category !== undefined && typeof category !== 'string') return null;
    const from = args.from;
    if (
      from !== undefined &&
      (typeof from !== 'string' || !isValidDateOnly(from))
    )
      return null;
    const to = args.to;
    if (to !== undefined && (typeof to !== 'string' || !isValidDateOnly(to)))
      return null;
    if (typeof from === 'string' && typeof to === 'string' && from > to)
      return null;
    const limit = args.limit;
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200)
    ) {
      return null;
    }
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof category === 'string' && category.trim()
          ? { category: category.trim().toLowerCase() }
          : {}),
        ...(typeof from === 'string' ? { from } : {}),
        ...(typeof to === 'string' ? { to } : {}),
        ...(typeof limit === 'number' ? { limit } : {}),
      },
    };
  }

  if (name === 'expense.summary' || name === 'budget.status') {
    const period = args.period;
    if (period !== undefined && typeof period !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        ...(typeof period === 'string' && period.trim()
          ? { period: period.trim().toLowerCase() }
          : {}),
      },
    };
  }

  if (name === 'budget.set') {
    if (typeof args.category !== 'string' || !args.category.trim()) return null;
    if (
      typeof args.limit !== 'number' ||
      !Number.isFinite(args.limit) ||
      args.limit <= 0
    ) {
      return null;
    }
    const period = args.period;
    if (period !== undefined && typeof period !== 'string') return null;
    const currency = args.currency;
    if (currency !== undefined && typeof currency !== 'string') return null;
    return {
      type: 'tool',
      name,
      args: {
        category: args.category.trim().toLowerCase(),
        limit: args.limit,
        ...(typeof period === 'string' && period.trim()
          ? { period: period.trim().toLowerCase() }
          : {}),
        ...(typeof currency === 'string' && currency.trim()
          ? { currency: currency.trim().toUpperCase() }
          : {}),
      },
    };
  }

  return null;
}

export function normalizeToolOnlyCall(input: {
  name: string;
  args: unknown;
}): ToolOnly | null {
  const parsed = parseToolCall(
    JSON.stringify({ type: 'tool', name: input.name, args: input.args }),
  );
  if (!parsed || parsed.type !== 'tool') return null;
  return parsed;
}
