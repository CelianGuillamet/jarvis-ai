import {
  compactText,
  formatPreviewLines,
  formatMailCategoryTag,
  formatMailDate,
  getMailCategory,
  summarizeMailCategoryBreakdown,
  stripQuotedReplyLines,
  summarizeMail,
} from '../support/tool-text';
import {
  getLastGmailList,
  setLastGmailList,
  setLastGmailFocus,
  patchGmailInCache,
  removeGmailFromCache,
} from '../support/tool-caches';
import type { GmailListItem } from '../support/tool-caches';
import { createPreviewHelpers } from '../support/tool-preview';
import { CommandRejectedError } from '../../../commands/command-rejected.error';
import {
  type GmailCategory,
  GMAIL_CATEGORIES,
  GMAIL_CATEGORY_LABELS_FR,
  getGmailCategoryFromLabels,
  getGmailCategoryLabel,
} from '../../../gmail/gmail-category';
import { resolveGmailBatch } from '../support/tool-resolvers';
import { defineTool } from '../define-tool';

export const gmailTools = [
  defineTool({
    name: 'gmail.list',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'gmail.read',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const requestedQuery = (call.args.query ?? '').trim();
      const limit = Math.min(Math.max(call.args.limit ?? 10, 1), 30);
      const unreadOnly = !!call.args.unreadOnly;
      const category = call.args.category;

      const queryParts: string[] = [];
      if (unreadOnly) queryParts.push('is:unread');
      if (category) queryParts.push(`category:${category}`);
      const restrictToInbox =
        !requestedQuery || (!!category && !/\bin:\w+/i.test(requestedQuery));
      if (restrictToInbox) queryParts.push('in:inbox');
      if (requestedQuery) queryParts.push(requestedQuery);
      const q = queryParts.join(' ').trim();

      const messages = await ctx.gmail.listMessages(sessionId, {
        q: q || undefined,
        maxResults: limit,
      });

      setLastGmailList(sessionId, messages);
      if (messages.length === 1) setLastGmailFocus(sessionId, messages[0]);

      if (!messages.length) {
        if (category)
          return `Aucun email dans ${GMAIL_CATEGORY_LABELS_FR[category]}.`;
        if (unreadOnly) return 'Aucun email non lu.';
        return requestedQuery
          ? `Aucun email trouvé pour "${requestedQuery}".`
          : 'Aucun email trouvé.';
      }

      const categoryLabel = category
        ? GMAIL_CATEGORY_LABELS_FR[category]
        : null;
      const title =
        categoryLabel && unreadOnly
          ? `Emails non lus — ${categoryLabel} (${messages.length}):`
          : categoryLabel
            ? `${categoryLabel} (${messages.length}):`
            : unreadOnly
              ? `Emails non lus (${messages.length}):`
              : `Emails (${messages.length}):`;
      const categoryBreakdown =
        !category && !requestedQuery
          ? summarizeMailCategoryBreakdown(messages)
          : null;

      return [
        title,
        categoryBreakdown,
        ...messages.map((item, idx) => {
          const state = item.unread ? 'NON LU' : 'LU';
          const preview = compactText(item.snippet || '', 120);
          return `#${idx + 1} - [${state}] ${formatMailCategoryTag(item)} ${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})${preview ? `\nExtrait: ${preview}` : ''}`;
        }),
      ].join('\n');
    },
  }),
  defineTool({
    name: 'gmail.get',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'gmail.read',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) return error;
      if (!target) return 'Aucun email ciblé.';

      const detail = await ctx.gmail.getMessage(sessionId, target.id);
      setLastGmailFocus(sessionId, detail);
      patchGmailInCache(sessionId, detail.id, {
        unread: detail.unread,
        labels: detail.labels,
        category: getMailCategory(detail),
      });

      const body = compactText(
        stripQuotedReplyLines(detail.bodyText || detail.snippet || ''),
        4000,
      );

      return [
        `Email:`,
        `Sujet: ${detail.subject}`,
        `De: ${detail.from}`,
        detail.to ? `A: ${detail.to}` : null,
        `Date: ${formatMailDate(detail.date, tz)}`,
        `Categorie: ${getGmailCategoryLabel(getMailCategory(detail))}`,
        detail.unread ? `Etat: non lu` : `Etat: lu`,
        detail.snippet ? `Extrait: ${compactText(detail.snippet, 320)}` : null,
        `Contenu:`,
        body || '(vide)',
      ]
        .filter((line): line is string => !!line)
        .join('\n');
    },
  }),
  defineTool({
    name: 'gmail.summary',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: false,
    requires: 'gmail.read',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, tz, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const mailboxSummaryRequested =
        typeof call.args.ref !== 'number' &&
        (call.args.category !== undefined ||
          call.args.unreadOnly !== undefined ||
          call.args.limit !== undefined);

      if (mailboxSummaryRequested) {
        const requestedQuery = (call.args.query ?? '').trim();
        const unreadOnly = call.args.unreadOnly ?? true;
        const limit = Math.min(Math.max(call.args.limit ?? 10, 1), 30);
        const category = call.args.category;

        const queryParts: string[] = [];
        if (unreadOnly) queryParts.push('is:unread');
        if (category) queryParts.push(`category:${category}`);
        const restrictToInbox =
          !requestedQuery || (!!category && !/\bin:\w+/i.test(requestedQuery));
        if (restrictToInbox) queryParts.push('in:inbox');
        if (requestedQuery) queryParts.push(requestedQuery);
        const q = queryParts.join(' ').trim();

        const messages = await ctx.gmail.listMessages(sessionId, {
          q: q || undefined,
          maxResults: limit,
        });

        setLastGmailList(sessionId, messages);
        if (messages.length === 1) setLastGmailFocus(sessionId, messages[0]);

        if (!messages.length) {
          const categoryLabel = category
            ? GMAIL_CATEGORY_LABELS_FR[category]
            : null;
          if (categoryLabel && unreadOnly) {
            if (!requestedQuery && category) {
              const otherTabs = await Promise.all(
                GMAIL_CATEGORIES.filter((tab) => tab !== category).map(
                  async (tab) => {
                    const probe = await ctx.gmail.listMessages(sessionId, {
                      q: `is:unread in:inbox category:${tab}`,
                      maxResults: 1,
                    });
                    return probe.length ? tab : null;
                  },
                ),
              );
              const availableTabs = otherTabs.filter(
                (tab): tab is GmailCategory => !!tab,
              );
              if (availableTabs.length) {
                const tabs = availableTabs
                  .map((tab) => GMAIL_CATEGORY_LABELS_FR[tab])
                  .join(' | ');
                return [
                  `Aucun email non lu dans ${categoryLabel}.`,
                  `J’en vois dans: ${tabs}.`,
                  `Dis par ex: "résume mes mails non lus dans promotions".`,
                ].join('\n');
              }
            }

            return `Aucun email non lu dans ${categoryLabel}.`;
          }
          if (categoryLabel) return `Aucun email dans ${categoryLabel}.`;
          if (unreadOnly) return 'Aucun email non lu.';
          return requestedQuery
            ? `Aucun email trouvé pour "${requestedQuery}".`
            : 'Aucun email trouvé.';
        }

        const categoryLabel = category
          ? GMAIL_CATEGORY_LABELS_FR[category]
          : null;
        const title =
          categoryLabel && unreadOnly
            ? `Résumé emails non lus — ${categoryLabel} (${messages.length}):`
            : categoryLabel
              ? `Résumé emails — ${categoryLabel} (${messages.length}):`
              : unreadOnly
                ? `Résumé emails non lus (${messages.length}):`
                : `Résumé emails (${messages.length}):`;
        const categoryBreakdown =
          !category && !requestedQuery
            ? summarizeMailCategoryBreakdown(messages)
            : null;

        const senderCounts = new Map<string, number>();
        for (const item of messages) {
          senderCounts.set(item.from, (senderCounts.get(item.from) ?? 0) + 1);
        }
        const topSenders = [...senderCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([from, count]) => `${from} (${count})`);
        const topSendersLine = topSenders.length
          ? `Principaux expéditeurs: ${topSenders.join(', ')}`
          : null;

        const highlights = messages.slice(0, Math.min(5, messages.length));
        const restCount = messages.length - highlights.length;

        return [
          title,
          categoryBreakdown,
          topSendersLine,
          'À traiter:',
          ...highlights.map((item, idx) => {
            const state = item.unread ? 'NON LU' : 'LU';
            const preview = compactText(item.snippet || '', 140);
            return `#${idx + 1} - [${state}] ${formatMailCategoryTag(item)} ${formatMailDate(item.date, tz)} — ${item.subject} (${item.from})${preview ? `\nExtrait: ${preview}` : ''}`;
          }),
          restCount > 0
            ? `(+${restCount} autres. Dis "liste mes emails" pour tout afficher.)`
            : null,
        ]
          .filter((line): line is string => !!line)
          .join('\n');
      }

      const { target, error } = await resolveGmailTarget({
        ref: call.args.ref,
        query: call.args.query,
      });
      if (error) return error;
      if (!target) return 'Aucun email ciblé.';

      const detail = await ctx.gmail.getMessage(sessionId, target.id);
      setLastGmailFocus(sessionId, detail);
      patchGmailInCache(sessionId, detail.id, {
        unread: detail.unread,
        labels: detail.labels,
        category: getMailCategory(detail),
      });

      return [
        `Résumé email:`,
        `Sujet: ${detail.subject}`,
        `De: ${detail.from}`,
        `Date: ${formatMailDate(detail.date, tz)}`,
        `Categorie: ${getGmailCategoryLabel(getMailCategory(detail))}`,
        `Résumé: ${summarizeMail(detail)}`,
      ].join('\n');
    },
  }),
  defineTool({
    name: 'gmail.send',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'gmail.send',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const to = call.args.to.trim();
      const subject = call.args.subject.trim();
      const textBody = call.args.text.trim();
      const cc = call.args.cc?.trim();
      const bcc = call.args.bcc?.trim();

      if (!to) throw new CommandRejectedError('Destinataire email manquant.');
      if (!subject) throw new CommandRejectedError('Sujet email manquant.');
      if (!textBody) throw new CommandRejectedError('Contenu email vide.');

      if (ctx.simulation) {
        return `SIMULATION: email envoyé à ${to} (sujet: "${subject}").`;
      }

      await ctx.gmail.sendMessage(sessionId, {
        to,
        subject,
        text: textBody,
        ...(cc ? { cc } : {}),
        ...(bcc ? { bcc } : {}),
      });
      return `OK. Email envoyé à ${to} (sujet: "${subject}").`;
    },
    preview: (_env, call) => {
      return formatPreviewLines([
        `To: ${call.args.to}`,
        call.args.cc ? `Cc: ${call.args.cc}` : null,
        call.args.bcc ? `Bcc: ${call.args.bcc}` : null,
        `Sujet: ${compactText(call.args.subject, 140)}`,
        `Message: ${compactText(call.args.text, 260)}`,
      ]);
    },
  }),
  defineTool({
    name: 'gmail.mark_read',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email marqué comme lu "${target.subject}".`;
      }

      await ctx.gmail.modifyLabels(sessionId, target.id, [], ['UNREAD']);
      const nextLabels = target.labels.filter((label) => label !== 'UNREAD');
      patchGmailInCache(sessionId, target.id, {
        unread: false,
        labels: nextLabels,
        category: getGmailCategoryFromLabels(nextLabels),
      });
      return `OK. Email marqué comme lu: "${target.subject}"`;
    },
  }),
  defineTool({
    name: 'gmail.bulk_mark_read',
    risk: 'medium',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const items = resolveGmailBatch(ctx, call.args);
      if (ctx.simulation) {
        const sample = items
          .slice(0, 6)
          .map((item) => `- ${formatMailCategoryTag(item)} ${item.subject}`)
          .join('\n');
        const rest = items.length - Math.min(6, items.length);
        return [
          `SIMULATION: ${items.length} emails marqués comme lus.`,
          sample,
          rest > 0 ? `(+${rest} autres)` : null,
        ]
          .filter((line): line is string => !!line)
          .join('\n');
      }

      for (const item of items) {
        await ctx.gmail.modifyLabels(sessionId, item.id, [], ['UNREAD']);
        const nextLabels = item.labels.filter((label) => label !== 'UNREAD');
        patchGmailInCache(sessionId, item.id, {
          unread: false,
          labels: nextLabels,
          category: getGmailCategoryFromLabels(nextLabels),
        });
      }

      const sample = items
        .slice(0, 6)
        .map((item) => `- ${formatMailCategoryTag(item)} ${item.subject}`)
        .join('\n');
      const rest = items.length - Math.min(6, items.length);

      return [
        `OK. ${items.length} emails marqués comme lus.`,
        sample,
        rest > 0 ? `(+${rest} autres)` : null,
      ]
        .filter((line): line is string => !!line)
        .join('\n');
    },
    preview: (env, call) => {
      const { ctx, sessionId } = env;
      if (ctx.frozenGmailTargets) {
        return (
          `${ctx.frozenGmailTargets.length} emails :\n` +
          ctx.frozenGmailTargets
            .map((item) => `- ${item.subject} (${item.from})`)
            .join('\n')
        );
      }
      const unreadOnly = call.args.unreadOnly ?? true;
      const limit = Math.min(Math.max(call.args.limit ?? 50, 1), 50);
      const list = getLastGmailList(sessionId);
      if (!list.length) return 'Liste récente indisponible.';

      const refs = call.args.refs?.length ? call.args.refs : null;
      const picked = refs
        ? refs
            .map((ref) => list[ref - 1])
            .filter((item): item is GmailListItem => !!item)
        : list;
      const filtered = (
        unreadOnly ? picked.filter((item) => item.unread) : picked
      ).slice(0, limit);

      if (!filtered.length) {
        return unreadOnly
          ? 'Aucun email non lu dans la sélection.'
          : 'Aucun email dans la sélection.';
      }

      const sample = filtered.slice(0, 5).map((item) => {
        const ref = list.findIndex((row) => row.id === item.id) + 1;
        return `#${ref} ${formatMailCategoryTag(item)} "${compactText(item.subject, 120)}"`;
      });
      const rest = filtered.length - sample.length;

      return formatPreviewLines([
        `Cibles: ${filtered.length} email(s)${unreadOnly ? ' non lu(s)' : ''}.`,
        ...sample,
        rest > 0 ? `(+${rest} autres)` : null,
      ]);
    },
  }),
  defineTool({
    name: 'gmail.mark_unread',
    risk: 'low',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email marqué comme non lu "${target.subject}".`;
      }

      await ctx.gmail.modifyLabels(sessionId, target.id, ['UNREAD'], []);
      const nextLabels = [...new Set([...target.labels, 'UNREAD'])];
      patchGmailInCache(sessionId, target.id, {
        unread: true,
        labels: nextLabels,
        category: getGmailCategoryFromLabels(nextLabels),
      });
      return `OK. Email marqué comme non lu: "${target.subject}"`;
    },
  }),
  defineTool({
    name: 'gmail.archive',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email archivé "${target.subject}".`;
      }

      await ctx.gmail.modifyLabels(sessionId, target.id, [], ['INBOX']);
      const nextLabels = target.labels.filter((label) => label !== 'INBOX');
      patchGmailInCache(sessionId, target.id, {
        labels: nextLabels,
        category: getGmailCategoryFromLabels(nextLabels),
      });
      return `OK. Email archivé: "${target.subject}"`;
    },
  }),
  defineTool({
    name: 'gmail.unarchive',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email desarchivé "${target.subject}".`;
      }

      await ctx.gmail.modifyLabels(sessionId, target.id, ['INBOX'], []);
      const nextLabels = [...new Set([...target.labels, 'INBOX'])];
      patchGmailInCache(sessionId, target.id, {
        labels: nextLabels,
        category: getGmailCategoryFromLabels(nextLabels),
      });
      return `OK. Email remis dans la boîte de réception: "${target.subject}"`;
    },
  }),
  defineTool({
    name: 'gmail.trash',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email déplacé à la corbeille "${target.subject}".`;
      }

      await ctx.gmail.trashMessage(sessionId, target.id);
      removeGmailFromCache(sessionId, target.id);
      return `OK. Email déplacé à la corbeille: "${target.subject}"`;
    },
    preview: (env, call) => {
      const { previewGmailByArgs } = createPreviewHelpers(env);
      const target = previewGmailByArgs(call.args);
      return target ? `Cible: ${target}` : null;
    },
  }),
  defineTool({
    name: 'gmail.untrash',
    risk: 'medium',
    requiresConfirmation: false,
    sideEffect: true,
    requires: 'gmail.modify',
    deferred: false,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email restauré depuis la corbeille "${target.subject}".`;
      }

      await ctx.gmail.untrashMessage(sessionId, target.id);
      const nextLabels = [...new Set([...target.labels, 'INBOX'])].filter(
        (label) => label !== 'TRASH',
      );
      patchGmailInCache(sessionId, target.id, {
        labels: nextLabels,
        category: getGmailCategoryFromLabels(nextLabels),
      });
      return `OK. Email restauré de la corbeille: "${target.subject}"`;
    },
  }),
  defineTool({
    name: 'gmail.delete',
    risk: 'high',
    requiresConfirmation: true,
    sideEffect: true,
    requires: 'gmail.permanent_delete',
    deferred: true,
    handler: async (env, call) => {
      const { ctx, sessionId } = env;
      const { resolveGmailTarget } = env.resolvers;
      const { target, error } = await resolveGmailTarget(call.args);
      if (error) throw new CommandRejectedError(error);
      if (!target)
        throw new CommandRejectedError('Aucun email ciblé.', 'NOT_FOUND');

      if (ctx.simulation) {
        return `SIMULATION: email supprimé définitivement "${target.subject}".`;
      }

      await ctx.gmail.deleteMessage(sessionId, target.id);
      removeGmailFromCache(sessionId, target.id);
      return `OK. Email supprimé définitivement: "${target.subject}"`;
    },
    preview: (env, call) => {
      const { previewGmailByArgs } = createPreviewHelpers(env);
      const target = previewGmailByArgs(call.args);
      return target ? `Cible: ${target}` : null;
    },
  }),
];
