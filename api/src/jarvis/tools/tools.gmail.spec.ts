import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import type {
  GmailMessageDetail,
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import { getGmailCategoryFromLabels } from '../../gmail/gmail-category';
import type { WebProvider } from '../providers/web.provider';
import { runTool, type ToolContext } from './tools';

function makeGmailMock(seed: GmailMessageDetail[]): GmailProvider {
  const store = new Map(seed.map((row) => [row.id, { ...row }]));

  const toItem = (row: GmailMessageDetail): GmailMessageItem => ({
    id: row.id,
    threadId: row.threadId,
    subject: row.subject,
    from: row.from,
    to: row.to,
    date: row.date,
    snippet: row.snippet,
    labels: row.labels,
    category: row.category ?? getGmailCategoryFromLabels(row.labels),
    unread: row.unread,
  });

  return {
    listMessages(_sessionId, options) {
      const qRaw = (options?.q || '').toLowerCase();
      const wantsUnread = /\bis:unread\b/.test(qRaw);
      const wantsInbox = /\bin:inbox\b/.test(qRaw);
      const categoryMatch = qRaw.match(
        /\bcategory:(primary|promotions|social|updates|forums)\b/,
      );
      const wantsCategory = categoryMatch?.[1] as
        | 'primary'
        | 'promotions'
        | 'social'
        | 'updates'
        | 'forums'
        | undefined;

      const search = qRaw
        .replace(/\bis:unread\b/g, '')
        .replace(/\bin:inbox\b/g, '')
        .replace(/\bcategory:(primary|promotions|social|updates|forums)\b/g, '')
        .trim();

      const all = [...store.values()];
      const inboxFiltered = wantsInbox
        ? all.filter((row) => row.labels.includes('INBOX'))
        : all;
      const categoryFiltered = wantsCategory
        ? inboxFiltered.filter(
            (row) =>
              (row.category ?? getGmailCategoryFromLabels(row.labels)) ===
              wantsCategory,
          )
        : inboxFiltered;
      const unreadFiltered = wantsUnread
        ? categoryFiltered.filter((row) => row.unread)
        : categoryFiltered;
      const searched = search
        ? unreadFiltered.filter((row) =>
            `${row.subject} ${row.from} ${row.snippet}`
              .toLowerCase()
              .includes(search),
          )
        : unreadFiltered;

      const sorted = searched.sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );
      return Promise.resolve(
        sorted.slice(0, options?.maxResults ?? 10).map(toItem),
      );
    },
    getMessage(_sessionId, messageId) {
      const found = store.get(messageId);
      if (!found) return Promise.reject(new Error('NOT_FOUND'));
      return Promise.resolve({ ...found });
    },
    modifyLabels(_sessionId, messageId, addLabelIds, removeLabelIds) {
      const found = store.get(messageId);
      if (!found) return Promise.reject(new Error('NOT_FOUND'));
      const labels = new Set(found.labels);
      for (const label of addLabelIds || []) labels.add(label);
      for (const label of removeLabelIds || []) labels.delete(label);
      found.labels = [...labels];
      found.unread = found.labels.includes('UNREAD');

      return Promise.resolve();
    },
    trashMessage(_sessionId, messageId) {
      const found = store.get(messageId);
      if (!found) return Promise.reject(new Error('NOT_FOUND'));
      found.labels = [...new Set([...found.labels, 'TRASH'])].filter(
        (label) => label !== 'INBOX',
      );

      return Promise.resolve();
    },
    untrashMessage(_sessionId, messageId) {
      const found = store.get(messageId);
      if (!found) return Promise.reject(new Error('NOT_FOUND'));
      found.labels = [...new Set([...found.labels, 'INBOX'])].filter(
        (label) => label !== 'TRASH',
      );

      return Promise.resolve();
    },
    deleteMessage(_sessionId, messageId) {
      store.delete(messageId);

      return Promise.resolve();
    },
    async sendMessage() {},
  };
}

describe('runTool gmail tools', () => {
  function makeCtx(gmail: GmailProvider): ToolContext {
    const web: WebProvider = {
      name: 'mock',
      search() {
        return Promise.resolve([]);
      },
      open(url: string) {
        return Promise.resolve({ url, content: '' });
      },
    };
    return {
      prisma: {} as unknown as ToolContext['prisma'],
      memory: {} as unknown as ToolContext['memory'],
      simulation: false,
      tz: 'Europe/Paris',
      sessionId: 'gmail-tools-spec',
      calendar: {} as CalendarProvider,
      web,
      weather: {} as unknown as ToolContext['weather'],
      gmail,
    };
  }

  it('lists unread emails', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Facture mars',
        from: 'billing@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T18:00:00+01:00'),
        snippet: 'Votre facture est prête.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText: 'Bonjour,\nVotre facture de mars est prête.',
      },
    ]);

    const out = await runTool(makeCtx(gmail), {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: true, limit: 10 },
    });

    expect(out).toContain('Emails non lus');
    expect(out).toContain('Facture mars');
    expect(out).toContain('[Boite principale]');
  });

  it('maps the Gmail primary tab to CATEGORY_PERSONAL', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Message client',
        from: 'client@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T18:00:00+01:00'),
        snippet: 'Peux-tu me rappeler ?',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText: 'Peux-tu me rappeler aujourd hui ?',
      },
      {
        id: 'm2',
        threadId: 't2',
        subject: 'Promo printemps',
        from: 'news@shop.example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T17:00:00+01:00'),
        snippet: 'Jusqu a -40% cette semaine.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
        unread: true,
        bodyText: 'Profitez de nos offres.',
      },
    ]);

    const out = await runTool(makeCtx(gmail), {
      type: 'tool',
      name: 'gmail.list',
      args: { category: 'primary', unreadOnly: true, limit: 10 },
    });

    expect(out).toContain('Boite principale');
    expect(out).toContain('Message client');
    expect(out).not.toContain('Promo printemps');
  });

  it('shows category breakdown when listing a mixed inbox', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Message client',
        from: 'client@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T18:00:00+01:00'),
        snippet: 'Peux-tu me rappeler ?',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText: 'Peux-tu me rappeler aujourd hui ?',
      },
      {
        id: 'm2',
        threadId: 't2',
        subject: 'Promo printemps',
        from: 'news@shop.example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T17:00:00+01:00'),
        snippet: 'Jusqu a -40% cette semaine.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
        unread: true,
        bodyText: 'Profitez de nos offres.',
      },
    ]);

    const out = await runTool(makeCtx(gmail), {
      type: 'tool',
      name: 'gmail.list',
      args: { limit: 10 },
    });

    expect(out).toContain(
      'Repartition onglets: Boite principale 1 | Promotions 1',
    );
    expect(out).toContain('[Boite principale]');
    expect(out).toContain('[Promotions]');
  });

  it('opens and summarizes an email by ref', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Plan du week-end',
        from: 'alice@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T17:00:00+01:00'),
        snippet: 'On se retrouve samedi matin...',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText:
          'Salut,\nOn se retrouve samedi matin à 10h devant la gare.\nDis-moi si ça te va.',
      },
    ]);
    const ctx = makeCtx(gmail);

    await runTool(ctx, {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: false, limit: 10 },
    });

    const out = await runTool(ctx, {
      type: 'tool',
      name: 'gmail.summary',
      args: { ref: 1 },
    });

    expect(out).toContain('Résumé email');
    expect(out).toContain('Plan du week-end');
    expect(out).toContain('Categorie: Boite principale');
    expect(out).toContain('Résumé:');
  });

  it('summarizes unread emails in the primary inbox tab', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Message client',
        from: 'client@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T18:00:00+01:00'),
        snippet: 'Peux-tu me rappeler ?',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText: 'Peux-tu me rappeler aujourd hui ?',
      },
      {
        id: 'm2',
        threadId: 't2',
        subject: 'Promo printemps',
        from: 'news@shop.example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T17:00:00+01:00'),
        snippet: 'Jusqu a -40% cette semaine.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
        unread: true,
        bodyText: 'Profitez de nos offres.',
      },
    ]);

    const out = await runTool(makeCtx(gmail), {
      type: 'tool',
      name: 'gmail.summary',
      args: { category: 'primary', unreadOnly: true, limit: 10 },
    });

    expect(out).toContain('Résumé emails non lus — Boite principale');
    expect(out).toContain('Message client');
    expect(out).not.toContain('Promo printemps');
  });

  it('marks an email as read by ref', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Alerte sécurité',
        from: 'security@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T16:00:00+01:00'),
        snippet: 'Nouvelle connexion détectée.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES'],
        unread: true,
        bodyText: 'Nouvelle connexion détectée sur votre compte.',
      },
    ]);
    const ctx = makeCtx(gmail);

    await runTool(ctx, {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: true, limit: 10 },
    });

    const markOut = await runTool(ctx, {
      type: 'tool',
      name: 'gmail.mark_read',
      args: { ref: 1 },
    });
    expect(markOut).toContain('marqué comme lu');

    const listOut = await runTool(ctx, {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: true, limit: 10 },
    });
    expect(listOut).toContain('Aucun email non lu');
  });

  it('marks the last listed emails as read in bulk', async () => {
    const gmail = makeGmailMock([
      {
        id: 'm1',
        threadId: 't1',
        subject: 'Message client',
        from: 'client@example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T18:00:00+01:00'),
        snippet: 'Peux-tu me rappeler ?',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
        unread: true,
        bodyText: 'Peux-tu me rappeler aujourd hui ?',
      },
      {
        id: 'm2',
        threadId: 't2',
        subject: 'Promo printemps',
        from: 'news@shop.example.com',
        to: 'me@example.com',
        date: new Date('2026-03-05T17:00:00+01:00'),
        snippet: 'Jusqu a -40% cette semaine.',
        labels: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
        unread: true,
        bodyText: 'Profitez de nos offres.',
      },
    ]);
    const ctx = makeCtx(gmail);

    await runTool(ctx, {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: true, limit: 10 },
    });

    const out = await runTool(ctx, {
      type: 'tool',
      name: 'gmail.bulk_mark_read',
      args: { unreadOnly: true },
    });
    expect(out).toContain('emails marqués comme lus');

    const listOut = await runTool(ctx, {
      type: 'tool',
      name: 'gmail.list',
      args: { unreadOnly: true, limit: 10 },
    });
    expect(listOut).toContain('Aucun email non lu');
  });

  it('sends an email', async () => {
    const base = makeGmailMock([]);
    let sent: {
      to: string;
      subject: string;
      text: string;
      cc?: string;
      bcc?: string;
    } | null = null;
    const gmail: GmailProvider = {
      ...base,
      sendMessage(_sessionId, payload) {
        sent = payload;

        return Promise.resolve();
      },
    };

    const out = await runTool(makeCtx(gmail), {
      type: 'tool',
      name: 'gmail.send',
      args: {
        to: 'test@example.com',
        subject: 'Test Jarvis',
        text: 'Je teste l envoi de mail.',
      },
    });

    expect(out).toContain('Email envoyé');
    expect(sent).toMatchObject({
      to: 'test@example.com',
      subject: 'Test Jarvis',
    });
  });
});
