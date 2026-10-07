// Isolated browser verification provider. Never connects to a real account or service.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as contracts from '../../src/core/contracts/v1.ts';

const conversationId = randomUUID();
const now = () => new Date().toISOString();
let preferences = { displayTimezone: 'Europe/Paris', theme: 'dark', onboardingCompleted: false };
const tasks = Array.from({ length: 51 }, (_, index) => ({ id: randomUUID(), text: `Tâche de vérification ${index + 1}`, done: false, doneAt: null, createdAt: now() }));
const notes = [];
const facts = [];
const requests = [];
const turns = [];
let pendingAction = null;
let nextEvent = null;
let replyDraft = null;
const inboxItem = contracts.InboxZeroItemViewSchema.parse({ id: 'fixture-item', messageId: 'fixture-message', threadId: 'fixture-thread', subject: 'Question de vérification', from: 'sender@example.test', to: 'fixture@example.test', date: now(), snippet: 'Pouvez-vous confirmer la démonstration ?', labels: ['INBOX', 'UNREAD'], gmailCategory: null, unread: true, category: 'urgent', priority: 1, reason: 'Message fictif', suggested: null, status: 'pending', lastActionAt: null });
function inbox() {
  return contracts.InboxZeroScanResponseSchema.parse({ session: { sessionId: conversationId, status: 'active', step: 'urgent', query: 'in:inbox', startedAt: now(), scannedAt: now(), counts: Object.fromEntries(['urgent', 'quick_wins', 'schedule', 'ignore', 'newsletters'].map(category => [category, { pending: category === 'urgent' && inboxItem.status === 'pending' ? 1 : 0, processed: category === 'urgent' && inboxItem.status === 'processed' ? 1 : 0 }])) }, items: [inboxItem], recentActions: [] });
}
const results = new Map();
let unavailable = false;
let revoked = false;
function status() {
  const availability = revoked ? 'permission_required' : 'available';
  return contracts.JarvisStatusSnapshotSchema.parse({
    sessionId: conversationId, now: now(), timezone: 'Europe/Paris', simulation: true,
    providers: { llm: 'local-fixture', web: 'disabled' }, profile: { speechMode: 'text', verbosity: 'concise' }, pendingAction,
    availability: { gmail: availability, calendar: availability },
    freshness: { gmail: { fetchedAt: now(), expiresAt: new Date(Date.now() + 60000).toISOString() }, calendar: { fetchedAt: now(), expiresAt: new Date(Date.now() + 60000).toISOString() } },
    integrations: { googleConnected: !revoked, calendarConnected: !revoked, gmailConnected: !revoked, scopes: [], lastGoogleSyncAt: now() },
    metrics: { openTodos: tasks.filter(task => !task.done).length, openShopping: 0, notesTotal: notes.length, unreadEmails: 0, eventsToday: 0, upcomingReminders: 0, habitsTotal: 0, habitsLoggedToday: 0 },
    focus: { nextEvent, activeMission: null, topUnreadEmail: null },
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
  // These actions really update the disposable fixture, unlike a production dry run.
  const result = contracts.TodayCommandResponseSchema.parse({ commandId: randomUUID(), state: 'completed', simulation: false, text: 'Action locale de vérification enregistrée.', });
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
    if (url.pathname === '/account/privacy') return reply(contracts.PrivacyDisclosureSchema.parse({ model: { provider: 'ollama', endpointHost: '127.0.0.1', transport: 'loopback' }, google: { signInConfigured: true, toolsConfigured: true, requestedScopes: ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/gmail.modify'] }, weatherHosts: [], webRetrieval: 'disabled', processingEnabled: true, retention: { diagnosticDays: 14, conversationDays: 90, receiptDays: 7, maximumBackupDays: 30, userData: 'until-deleted', commandJournal: 'until-account-deletion' }, backups: 'operator-managed' }));
    if (url.pathname === '/account/memory' && request.method === 'GET') return reply({ facts });
    if (url.pathname === '/account/memory' && request.method === 'POST') { const { text } = contracts.PersonalFactInputSchema.parse(input); const fact = { id: randomUUID(), text, origin: 'settings', createdAt: now(), updatedAt: now() }; facts.unshift(fact); return reply(contracts.PersonalFactSchema.parse(fact)); }
    const factPath = url.pathname.match(/^\/account\/memory\/([^/]+)(\/forget)?$/);
    if (factPath && request.method === 'POST') {
      const index = facts.findIndex(fact => fact.id === factPath[1]);
      if (index < 0) { response.statusCode = 404; return reply({ error: 'Fait introuvable.' }); }
      if (factPath[2]) { facts.splice(index, 1); return reply({ facts }); }
      facts[index] = { ...facts[index], text: contracts.PersonalFactInputSchema.parse(input).text, updatedAt: now() };
      return reply(facts[index]);
    }
    if (url.pathname === '/account/preferences') { if (request.method === 'POST') preferences = contracts.AccountPreferencesSchema.parse(input); return reply(preferences); }
    if (url.pathname === '/jarvis/status' || url.pathname === '/jarvis/status/refresh') return reply(status());
    if (url.pathname === '/today') {
      const query = contracts.TodayQuerySchema.parse(Object.fromEntries(url.searchParams));
      return reply(contracts.TodayPageResponseSchema.parse({ conversationId, fetchedAt: now(), tasks: tasks.slice(query.taskOffset, query.taskOffset + 50), notes: notes.slice(query.noteOffset, query.noteOffset + 50), tasksHasMore: tasks.length > query.taskOffset + 50, notesHasMore: notes.length > query.noteOffset + 50 }));
    }
    if (url.pathname === '/inbox-zero/session' || url.pathname === '/inbox-zero/scan') return reply(inbox());
    if (url.pathname === '/inbox-zero/message') return reply(contracts.InboxZeroMessageResponseSchema.parse({ item: inboxItem, message: { ...inboxItem, id: inboxItem.messageId, bodyText: 'Pouvez-vous confirmer la démonstration ?', }, reply: { to: 'sender@example.test', subject: 'Re: Question de vérification' } }));
    if (url.pathname === '/inbox-zero/reply-draft') {
      if (request.method === 'POST') {
        const draft = contracts.InboxReplyDraftSaveRequestSchema.parse(input);
        replyDraft = { messageId: draft.messageId, text: draft.text, version: (replyDraft?.version || 0) + 1, updatedAt: now() };
      }
      return reply(contracts.InboxReplyDraftResponseSchema.parse({ draft: replyDraft }));
    }
    if (url.pathname === '/inbox-zero/apply') {
      const action = contracts.InboxZeroApplyRequestSchema.parse(input);
      if (action.messageIds.some(id => id !== inboxItem.messageId)) throw new Error('Unknown fixture message');
      inboxItem.status = 'processed'; inboxItem.lastActionAt = now();
      return reply(contracts.InboxZeroApplyResponseSchema.parse({ ...inbox(), results: action.messageIds.map(messageId => ({ messageId, ok: true, outcome: 'completed' })) }));
    }
    if (url.pathname === '/jarvis/chat') {
      const chat = contracts.ChatRequestSchema.parse(input);
      if (chat.text === 'Créer un rendez-vous de vérification') pendingAction = contracts.PendingActionViewSchema.parse({ id: randomUUID(), name: 'calendar.create', args: {}, summary: 'Créer le rendez-vous fictif', preview: 'Démonstration locale uniquement', risk: 'medium', sideEffect: true, planner: 'fixture', confidence: 'certain' });
      const result = contracts.JarvisChatResponseSchema.parse({ ...(pendingAction ? { pending_action: pendingAction } : {}), text: pendingAction ? 'Veuillez confirmer le rendez-vous fictif.' : 'Réponse du fournisseur local de vérification.', meta: { simulation: true, sessionId: conversationId, historySaved: true } });
      turns.push({ id: randomUUID(), kind: 'chat', inputText: chat.text, state: 'completed', response: result, command: null, createdAt: now(), updatedAt: now() });
      return reply(result);
    }
    if (url.pathname === '/jarvis/confirm') {
      const confirmation = contracts.ConfirmRequestSchema.parse(input);
      if (!pendingAction || confirmation.actionId !== pendingAction.id) throw new Error('Unknown fixture confirmation');
      nextEvent = { title: 'Rendez-vous fictif confirmé', when: new Date(Date.now() + 3600000).toISOString(), end: null };
      pendingAction = null;
      return reply(contracts.JarvisChatResponseSchema.parse({ text: 'Rendez-vous fictif enregistré.', meta: { simulation: false, sessionId: conversationId } }));
    }
    if (url.pathname === '/today/mutations' && request.method === 'POST') return reply(mutate(input));
    if (url.pathname === '/jarvis/history') return reply(contracts.ConversationHistoryResponseSchema.parse({ conversationId, fetchedAt: now(), nextCursor: null, pendingCommand: null, turns }));
    if (url.pathname === '/jarvis/activity') return reply(contracts.ActivityResponseSchema.parse({ conversationId, fetchedAt: now(), nextCursor: null, commands: [] }));
    response.statusCode = 404; reply({ error: 'Unsupported verification route' });
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error.message })); }
});
server.listen(4319, '127.0.0.1', () => process.stdout.write('Local verification provider: http://127.0.0.1:4319\n'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
