// Isolated browser verification provider. Never connects to a real account or service.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as contracts from '../../src/core/contracts/v1.ts';

const conversationId = randomUUID();
const now = () => new Date().toISOString();
let preferences = { displayTimezone: 'Europe/Paris', theme: 'dark', onboardingCompleted: false };
const tasks = Array.from({ length: 51 }, (_, index) => ({ id: randomUUID(), text: `Tâche de vérification ${index + 1}`, done: false, doneAt: null, createdAt: now() }));
const notes = [];
const requests = [];
const results = new Map();
let unavailable = false;
let revoked = false;
function status() {
  const availability = revoked ? 'permission_required' : 'available';
  return contracts.JarvisStatusSnapshotSchema.parse({
    sessionId: conversationId, now: now(), timezone: 'Europe/Paris', simulation: true,
    providers: { llm: 'local-fixture', web: 'disabled' }, profile: { speechMode: 'text', verbosity: 'concise' }, pendingAction: null,
    availability: { gmail: availability, calendar: availability },
    freshness: { gmail: { fetchedAt: now(), expiresAt: null }, calendar: { fetchedAt: now(), expiresAt: null } },
    integrations: { googleConnected: !revoked, calendarConnected: !revoked, gmailConnected: !revoked, scopes: [], lastGoogleSyncAt: now() },
    metrics: { openTodos: tasks.filter(task => !task.done).length, openShopping: 0, notesTotal: notes.length, unreadEmails: 0, eventsToday: 0, upcomingReminders: 0, habitsTotal: 0, habitsLoggedToday: 0 },
    focus: { nextEvent: null, activeMission: null, topUnreadEmail: null },
    worldModel: { factsByLayer: { identity: [], preference: [], project: [], relationship: [], workflow: [] }, sessionSummary: null },
    missions: [], actionAudit: [], workflowMemory: [], workflowSuggestions: [], upcomingReminders: [], habits: [], quickActions: [], proactiveSuggestions: [], recentActivity: [], memoryTurns: [],
  });
}
function mutate(input) {
  const { requestId, mutation } = contracts.TodayMutationRequestSchema.parse(input);
  if (results.has(requestId)) return results.get(requestId);
  const task = tasks.find(item => item.id === mutation.id);
  const note = notes.find(item => item.id === mutation.id);
  switch (mutation.operation) {
    case 'task.create': tasks.unshift({ id: randomUUID(), text: mutation.text, done: false, doneAt: null, createdAt: now() }); break;
    case 'task.edit': if (!task) throw new Error('Unknown fixture task'); task.text = mutation.text; break;
    case 'task.complete': if (!task) throw new Error('Unknown fixture task'); task.done = true; task.doneAt = now(); break;
    case 'task.reopen': if (!task) throw new Error('Unknown fixture task'); task.done = false; task.doneAt = null; break;
    case 'note.create': notes.unshift({ id: randomUUID(), title: mutation.title, text: mutation.text, createdAt: now() }); break;
    case 'note.edit': if (!note) throw new Error('Unknown fixture note'); note.title = mutation.title; note.text = mutation.text; break;
    default: throw new Error('Unsupported fixture mutation');
  }
  const result = contracts.TodayCommandResponseSchema.parse({ commandId: randomUUID(), state: 'completed', simulation: true, text: 'Action locale de vérification enregistrée.', });
  results.set(requestId, result);
  return result;
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  try {
    let body = '';
    for await (const chunk of request) { body += chunk; if (body.length > 65536) throw new Error('Fixture request too large'); }
    const input = body ? JSON.parse(body) : {};
    const reply = value => response.end(JSON.stringify(value));
    if (url.pathname === '/__verification') {
      if (request.method === 'POST') { unavailable = input.unavailable === true; revoked = input.revoked === true; }
      return reply({ unavailable, revoked, requests });
    }
    requests.push({ path: url.pathname, method: request.method, at: now() });
    if (unavailable) { response.statusCode = 503; return reply({ error: 'Local verification outage' }); }
    if (url.pathname === '/account/me') return reply(contracts.AccountProfileSchema.parse({ id: 'browser-fixture-owner', name: 'Compte local de vérification', email: 'fixture@example.test' }));
    if (url.pathname === '/account/preferences') { if (request.method === 'POST') preferences = contracts.AccountPreferencesSchema.parse(input); return reply(preferences); }
    if (url.pathname === '/jarvis/status' || url.pathname === '/jarvis/status/refresh') return reply(status());
    if (url.pathname === '/today') {
      const query = contracts.TodayQuerySchema.parse(Object.fromEntries(url.searchParams));
      return reply(contracts.TodayPageResponseSchema.parse({ conversationId, fetchedAt: now(), tasks: tasks.slice(query.taskOffset, query.taskOffset + 50), notes: notes.slice(query.noteOffset, query.noteOffset + 50), tasksHasMore: tasks.length > query.taskOffset + 50, notesHasMore: notes.length > query.noteOffset + 50 }));
    }
    if (url.pathname === '/today/mutations' && request.method === 'POST') return reply(mutate(input));
    if (url.pathname === '/jarvis/history') return reply(contracts.ConversationHistoryResponseSchema.parse({ conversationId, fetchedAt: now(), nextCursor: null, pendingCommand: null, turns: [] }));
    if (url.pathname === '/jarvis/activity') return reply(contracts.ActivityResponseSchema.parse({ conversationId, fetchedAt: now(), nextCursor: null, commands: [] }));
    response.statusCode = 404; reply({ error: 'Unsupported verification route' });
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error.message })); }
});
server.listen(4319, '127.0.0.1', () => process.stdout.write('Local verification provider: http://127.0.0.1:4319\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
