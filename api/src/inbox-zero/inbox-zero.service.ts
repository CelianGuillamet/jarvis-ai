import {
  BadRequestException,
  Injectable,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { GMAIL_PROVIDER } from '../gmail/gmail.module';
import type {
  GmailMessageDetail,
  GmailProvider,
} from '../gmail/providers/gmail.provider';
import { asGoogleIntegrationError } from '../google/google-integration.error';
import type { LLMProvider } from '../jarvis/providers/llm.provider';
import { OllamaProvider } from '../jarvis/providers/ollama.provider';
import { OpenAIProvider } from '../jarvis/providers/openai.provider';
import { resolveWhenWindow } from '../jarvis/lib/resolve-when';

import { InboxZeroApplyDto } from './dto/inbox-zero-apply.dto';
import type {
  InboxZeroActionType,
  InboxZeroApplyResponse,
  InboxZeroCategory,
  InboxZeroDraftReplyResponse,
  InboxZeroItemView,
  InboxZeroScanResponse,
  InboxZeroSessionView,
  InboxZeroStep,
} from './inbox-zero.types';
import {
  INBOX_ZERO_ACTION_TYPES,
  INBOX_ZERO_CATEGORIES,
  INBOX_ZERO_STEPS,
} from './inbox-zero.types';
import { classifyInboxMessage } from './lib/classify-inbox-message';
import { mapWithConcurrency } from './lib/concurrency';
import {
  buildReplySubject,
  compactText,
  extractEmailAddress,
} from './lib/email';

type RawSessionRow = {
  sessionId: string;
  status: string;
  step: string;
  query: string;
  startedAt: Date;
  scannedAt: Date | null;
  updatedAt: Date;
};

type RawItemRow = {
  id: string;
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: Date;
  snippet: string;
  labelsJson: string;
  gmailCategory: string | null;
  unread: boolean;
  category: string;
  priority: number;
  reason: string | null;
  suggestedJson: string | null;
  status: string;
  lastActionAt: Date | null;
};

const INBOX_ZERO_DB_MIGRATION_MESSAGE =
  "Inbox Zero: tables manquantes en base. Applique les migrations Prisma (cd api && npx prisma migrate deploy), puis redémarre l'API.";

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isPrismaMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && (error as any).code === 'P2021';
}

function ensureInboxZeroCategory(value: string): InboxZeroCategory | null {
  return (INBOX_ZERO_CATEGORIES as readonly string[]).includes(value)
    ? (value as InboxZeroCategory)
    : null;
}

function ensureInboxZeroStep(value: string): InboxZeroStep | null {
  return (INBOX_ZERO_STEPS as readonly string[]).includes(value)
    ? (value as InboxZeroStep)
    : null;
}

function ensureActionType(value: string): InboxZeroActionType | null {
  return (INBOX_ZERO_ACTION_TYPES as readonly string[]).includes(value)
    ? (value as InboxZeroActionType)
    : null;
}

function applyLabels(
  labels: string[],
  add: string[] = [],
  remove: string[] = [],
) {
  const set = new Set(labels);
  for (const r of remove) set.delete(r);
  for (const a of add) set.add(a);
  return [...set];
}

@Injectable()
export class InboxZeroService {
  private readonly logger = new Logger(InboxZeroService.name);
  private readonly llm: LLMProvider;
  private readonly tz: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(GMAIL_PROVIDER) private readonly gmail: GmailProvider,
  ) {
    this.tz = this.config.get<string>('JARVIS_TZ')?.trim() || 'Europe/Paris';

    const llmProvider = (
      this.config.get<string>('LLM_PROVIDER') || ''
    ).toLowerCase();
    const openAiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    const shouldUseOpenAi =
      llmProvider === 'openai' || (!!openAiKey && llmProvider !== 'ollama');

    if (shouldUseOpenAi && openAiKey) {
      this.llm = new OpenAIProvider(
        openAiKey,
        this.config.get<string>('OPENAI_MODEL_PRIMARY') || 'gpt-5-nano',
        this.config.get<string>('OPENAI_MODEL_FALLBACK') || 'gpt-5-mini',
        this.config.get<string>('OPENAI_BASE_URL') ||
          'https://api.openai.com/v1',
        Number(this.config.get<string>('OPENAI_TIMEOUT_MS') || 30_000),
      );
      this.logger.log(
        `LLM provider (InboxZero): openai (${this.config.get<string>('OPENAI_MODEL_PRIMARY') || 'gpt-5-nano'} -> ${this.config.get<string>('OPENAI_MODEL_FALLBACK') || 'gpt-5-mini'})`,
      );
    } else {
      if (shouldUseOpenAi && !openAiKey) {
        this.logger.warn(
          'LLM_PROVIDER=openai mais OPENAI_API_KEY est vide. Fallback vers Ollama.',
        );
      }
      this.llm = new OllamaProvider(
        this.config.get('OLLAMA_URL') || 'http://localhost:11434',
        this.config.get('OLLAMA_MODEL') || 'llama3.1:latest',
      );
      this.logger.log(
        `LLM provider (InboxZero): ollama (${this.config.get('OLLAMA_MODEL') || 'llama3.1:latest'})`,
      );
    }
  }

  async scan(input: {
    sessionId?: string;
    query?: string;
    limit?: number;
    refresh?: boolean;
  }): Promise<InboxZeroScanResponse> {
    const sessionId = this.resolveSessionId(input.sessionId);
    const session = await this.ensureSession(sessionId);

    const nextQuery =
      input.query?.trim() || session.query || 'in:inbox is:unread';
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 50);
    const shouldRefresh = input.refresh ?? !session.scannedAt;

    if (shouldRefresh) {
      const now = new Date();
      const messages = await this.withGoogleGuard(() =>
        this.gmail.listMessages(sessionId, {
          q: nextQuery,
          maxResults: limit,
        }),
      );

      await this.withInboxZeroDbGuard(async () => {
        const tx = messages.map((m) => {
          const classification = classifyInboxMessage(m);
          const suggestedJson = classification.suggested
            ? JSON.stringify(classification.suggested)
            : null;

          return this.prisma.inboxZeroItem.upsert({
            where: { sessionId_messageId: { sessionId, messageId: m.id } },
            create: {
              sessionId,
              messageId: m.id,
              threadId: m.threadId,
              subject: m.subject,
              from: m.from,
              to: m.to || '',
              date: m.date,
              snippet: m.snippet || '',
              labelsJson: JSON.stringify(m.labels ?? []),
              gmailCategory: (m.category as any) ?? null,
              unread: !!m.unread,
              category: classification.category,
              priority: classification.priority,
              reason: classification.reason,
              suggestedJson,
              status: 'pending',
              lastActionAt: null,
            },
            update: {
              threadId: m.threadId,
              subject: m.subject,
              from: m.from,
              to: m.to || '',
              date: m.date,
              snippet: m.snippet || '',
              labelsJson: JSON.stringify(m.labels ?? []),
              gmailCategory: (m.category as any) ?? null,
              unread: !!m.unread,
              category: classification.category,
              priority: classification.priority,
              reason: classification.reason,
              suggestedJson,
              status: 'pending',
              lastActionAt: null,
            },
            select: { id: true },
          });
        });

        await this.prisma.$transaction([
          ...tx,
          this.prisma.inboxZeroSession.update({
            where: { sessionId },
            data: {
              status: 'active',
              query: nextQuery,
              scannedAt: now,
            },
            select: { sessionId: true },
          }),
        ]);
      });
    } else if (nextQuery !== session.query) {
      await this.withInboxZeroDbGuard(() =>
        this.prisma.inboxZeroSession.update({
          where: { sessionId },
          data: { query: nextQuery },
        }),
      );
    }

    return this.getSession(sessionId);
  }

  async getSession(sessionId?: string): Promise<InboxZeroScanResponse> {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    const session = await this.ensureSession(resolvedSessionId);

    const [counts, items, actions] = await this.withInboxZeroDbGuard(() =>
      Promise.all([
        this.computeCounts(resolvedSessionId),
        this.prisma.inboxZeroItem.findMany({
          where: { sessionId: resolvedSessionId, status: 'pending' },
          orderBy: [{ priority: 'desc' }, { date: 'desc' }],
          take: 200,
          select: {
            id: true,
            messageId: true,
            threadId: true,
            subject: true,
            from: true,
            to: true,
            date: true,
            snippet: true,
            labelsJson: true,
            gmailCategory: true,
            unread: true,
            category: true,
            priority: true,
            reason: true,
            suggestedJson: true,
            status: true,
            lastActionAt: true,
          },
        }) as unknown as Promise<RawItemRow[]>,
        this.prisma.inboxZeroAction.findMany({
          where: { sessionId: resolvedSessionId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            messageId: true,
            actionType: true,
            payloadJson: true,
            status: true,
            errorMessage: true,
            createdAt: true,
          },
        }),
      ]),
    );

    const { nextStatus, nextStep } = this.computeStep(session, counts);
    if (nextStatus !== session.status || nextStep !== session.step) {
      await this.withInboxZeroDbGuard(() =>
        this.prisma.inboxZeroSession.update({
          where: { sessionId: resolvedSessionId },
          data: { status: nextStatus, step: nextStep },
        }),
      );
    }

    return {
      session: this.toSessionView(
        { ...session, status: nextStatus, step: nextStep },
        counts,
      ),
      items: items.map((row) => this.toItemView(row)).filter((x) => x !== null),
      recentActions: actions.map((row) => ({
        id: row.id,
        messageId: row.messageId ?? null,
        actionType:
          ensureActionType(row.actionType) ??
          ('archive' as InboxZeroActionType),
        status: row.status,
        errorMessage: row.errorMessage ?? null,
        createdAt: row.createdAt.toISOString(),
        payload: safeParseJson<Record<string, unknown> | null>(
          row.payloadJson,
          null,
        ),
      })),
    };
  }

  async setStep(sessionId: string | undefined, step: InboxZeroStep) {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    await this.ensureSession(resolvedSessionId);
    await this.withInboxZeroDbGuard(() =>
      this.prisma.inboxZeroSession.update({
        where: { sessionId: resolvedSessionId },
        data: { step },
      }),
    );
    return this.getSession(resolvedSessionId);
  }

  async getMessage(sessionId: string | undefined, messageId: string) {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    await this.ensureSession(resolvedSessionId);

    const [item, detail] = await Promise.all([
      this.withInboxZeroDbGuard(() =>
        this.prisma.inboxZeroItem.findUnique({
          where: {
            sessionId_messageId: { sessionId: resolvedSessionId, messageId },
          },
          select: {
            id: true,
            messageId: true,
            category: true,
            priority: true,
            reason: true,
            suggestedJson: true,
            labelsJson: true,
            unread: true,
            gmailCategory: true,
            status: true,
            lastActionAt: true,
          },
        }),
      ),
      this.withGoogleGuard(() =>
        this.gmail.getMessage(resolvedSessionId, messageId),
      ),
    ]);

    return {
      item: item
        ? this.toItemView({
            ...(item as any),
            threadId: detail.threadId,
            subject: detail.subject,
            from: detail.from,
            to: detail.to || '',
            date: detail.date,
            snippet: detail.snippet || '',
          } as RawItemRow)
        : null,
      message: detail,
    };
  }

  async draftReply(
    sessionId: string | undefined,
    messageId: string,
  ): Promise<InboxZeroDraftReplyResponse> {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    await this.ensureSession(resolvedSessionId);

    const detail = await this.withGoogleGuard(() =>
      this.gmail.getMessage(resolvedSessionId, messageId),
    );

    const to = extractEmailAddress(detail.from) || detail.from;
    const subject = buildReplySubject(detail.subject);

    const draftText = await this.generateDraftReply(detail).catch((error) => {
      this.logger.warn(
        `Draft reply failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      const safeSubject = compactText(detail.subject, 80);
      return [
        'Bonjour,',
        '',
        `Merci pour ton message concernant "${safeSubject}".`,
        'Je reviens vers toi rapidement.',
        '',
        'Bien à toi,',
      ].join('\n');
    });

    return {
      messageId,
      subject,
      to,
      draftText: draftText.trim(),
    };
  }

  async apply(input: InboxZeroApplyDto): Promise<InboxZeroApplyResponse> {
    const sessionId = this.resolveSessionId(input.sessionId);
    await this.ensureSession(sessionId);

    const action = input.action;
    if (action === 'draft_reply') {
      throw new BadRequestException(
        'Utilise /inbox-zero/draft-reply pour générer une réponse.',
      );
    }

    if (action === 'send_reply' && input.messageIds.length !== 1) {
      throw new BadRequestException('send_reply nécessite un seul messageId.');
    }

    if (action === 'send_reply' && !input.replyText?.trim()) {
      throw new BadRequestException('replyText manquant pour send_reply.');
    }

    if (action === 'remind' && !input.reminderWhen?.trim()) {
      throw new BadRequestException('reminderWhen manquant pour remind.');
    }

    const messageIds = [
      ...new Set(input.messageIds.map((id) => id.trim())),
    ].filter((id) => id.length > 0);
    if (!messageIds.length) {
      throw new BadRequestException('messageIds vides.');
    }

    const rows = (await this.withInboxZeroDbGuard(() =>
      this.prisma.inboxZeroItem.findMany({
        where: { sessionId, messageId: { in: messageIds } },
        select: {
          id: true,
          messageId: true,
          threadId: true,
          subject: true,
          from: true,
          to: true,
          date: true,
          snippet: true,
          labelsJson: true,
          gmailCategory: true,
          unread: true,
          category: true,
          priority: true,
          reason: true,
          suggestedJson: true,
          status: true,
          lastActionAt: true,
        },
      }),
    )) as unknown as RawItemRow[];

    const foundIds = new Set(rows.map((r) => r.messageId));
    const missing = messageIds.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Emails inconnus dans la session: ${missing.slice(0, 6).join(', ')}${
          missing.length > 6 ? ` (+${missing.length - 6})` : ''
        }`,
      );
    }

    const archiveAfter = input.archiveAfter ?? true;
    const now = new Date();

    const results = await mapWithConcurrency(rows, 4, async (row) => {
      const labels = safeParseJson<string[]>(row.labelsJson, []);
      const suggested = safeParseJson<{
        action?: string;
        label?: string;
      } | null>(row.suggestedJson, null);

      const effectiveAction =
        action === 'apply_recommended'
          ? ensureActionType(suggested?.action || '') || 'mark_read_archive'
          : action;

      try {
        if (
          action === 'apply_recommended' &&
          (effectiveAction === 'draft_reply' ||
            effectiveAction === 'send_reply' ||
            effectiveAction === 'remind')
        ) {
          throw new BadRequestException(
            `Action recommandée "${effectiveAction}" nécessite une étape dédiée.`,
          );
        }

        if (effectiveAction === 'apply_recommended') {
          throw new BadRequestException('apply_recommended non résolu.');
        }

        const itemPatch: Partial<RawItemRow> & {
          labelsJson?: string;
          unread?: boolean;
          status?: string;
          lastActionAt?: Date | null;
        } = {};

        if (effectiveAction === 'star') {
          const remove = ['UNREAD', ...(archiveAfter ? ['INBOX'] : [])];
          const nextLabels = applyLabels(labels, ['STARRED'], remove);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(
              sessionId,
              row.messageId,
              ['STARRED'],
              remove,
            ),
          );
          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'archive') {
          const nextLabels = applyLabels(labels, [], ['INBOX']);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(sessionId, row.messageId, [], ['INBOX']),
          );
          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'mark_read') {
          const nextLabels = applyLabels(labels, [], ['UNREAD']);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(sessionId, row.messageId, [], ['UNREAD']),
          );
          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'mark_read_archive') {
          const remove = ['UNREAD', ...(archiveAfter ? ['INBOX'] : [])];
          const nextLabels = applyLabels(labels, [], remove);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(sessionId, row.messageId, [], remove),
          );
          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'trash') {
          await this.withGoogleGuard(() =>
            this.gmail.trashMessage(sessionId, row.messageId),
          );
          itemPatch.labelsJson = JSON.stringify(
            applyLabels(labels, ['TRASH'], ['INBOX']),
          );
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'delete') {
          await this.withGoogleGuard(() =>
            this.gmail.deleteMessage(sessionId, row.messageId),
          );
          itemPatch.labelsJson = JSON.stringify([]);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'remind') {
          if (!input.reminderWhen?.trim()) {
            throw new BadRequestException('reminderWhen manquant pour remind.');
          }
          const when = resolveWhenWindow(input.reminderWhen, this.tz);
          const triggerAt = new Date(when.startIso);
          const reminderText =
            input.reminderText?.trim() ||
            compactText(`Inbox Zero: ${row.subject} (${row.from})`, 140);

          await this.prisma.reminder.create({
            data: {
              sessionId,
              text: reminderText,
              triggerAt,
            },
            select: { id: true },
          });

          const remove = ['UNREAD', ...(archiveAfter ? ['INBOX'] : [])];
          const nextLabels = applyLabels(labels, [], remove);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(sessionId, row.messageId, [], remove),
          );

          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else if (effectiveAction === 'send_reply') {
          if (!input.replyText?.trim()) {
            throw new BadRequestException(
              'replyText manquant pour send_reply.',
            );
          }
          const detail = await this.withGoogleGuard(() =>
            this.gmail.getMessage(sessionId, row.messageId),
          );
          const to = extractEmailAddress(detail.from) || detail.from;
          const subject = buildReplySubject(detail.subject);
          const text = input.replyText.trim();
          const inReplyTo = detail.messageIdHeader ?? undefined;
          const references = (() => {
            const refs = (detail.referencesHeader || '').trim();
            if (!inReplyTo) return refs || undefined;
            if (!refs) return inReplyTo;
            return refs.includes(inReplyTo) ? refs : `${refs} ${inReplyTo}`;
          })();

          await this.withGoogleGuard(() =>
            this.gmail.sendMessage(sessionId, {
              to,
              subject,
              text,
              threadId: row.threadId,
              inReplyTo,
              references,
            }),
          );

          const remove = ['UNREAD', ...(archiveAfter ? ['INBOX'] : [])];
          const nextLabels = applyLabels(labels, [], remove);
          await this.withGoogleGuard(() =>
            this.gmail.modifyLabels(sessionId, row.messageId, [], remove),
          );

          itemPatch.labelsJson = JSON.stringify(nextLabels);
          itemPatch.unread = false;
          itemPatch.status = 'processed';
          itemPatch.lastActionAt = now;
        } else {
          throw new BadRequestException(
            `Action InboxZero non supportée: ${effectiveAction}`,
          );
        }

        await this.withInboxZeroDbGuard(() =>
          this.prisma.inboxZeroItem.update({
            where: { id: row.id },
            data: {
              ...(itemPatch.labelsJson !== undefined
                ? { labelsJson: itemPatch.labelsJson }
                : {}),
              ...(itemPatch.unread !== undefined
                ? { unread: itemPatch.unread }
                : {}),
              ...(itemPatch.status !== undefined
                ? { status: itemPatch.status }
                : {}),
              ...(itemPatch.lastActionAt !== undefined
                ? { lastActionAt: itemPatch.lastActionAt }
                : {}),
            },
          }),
        );

        return { messageId: row.messageId, ok: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { messageId: row.messageId, ok: false, error: msg };
      }
    });

    const allOk = results.every((r) => r.ok);
    await this.withInboxZeroDbGuard(() =>
      this.prisma.inboxZeroAction.create({
        data: {
          sessionId,
          messageId:
            action === 'send_reply' ? (rows[0]?.messageId ?? null) : null,
          actionType: action,
          status: allOk ? 'completed' : 'failed',
          errorMessage: allOk ? null : 'Certaines actions ont échoué.',
          payloadJson: JSON.stringify({
            action,
            messageIds,
            archiveAfter,
            ...(action === 'remind'
              ? {
                  reminderWhen: input.reminderWhen,
                  reminderText: input.reminderText,
                }
              : {}),
            ...(action === 'send_reply'
              ? { replyTextChars: input.replyText?.length ?? 0 }
              : {}),
            results,
          }),
        },
        select: { id: true },
      }),
    );

    const state = await this.getSession(sessionId);
    return {
      ...state,
      results,
    };
  }

  private resolveSessionId(sessionId: string | undefined) {
    const trimmed = (sessionId || '').trim();
    return trimmed ? trimmed : 'default';
  }

  private async ensureSession(sessionId: string): Promise<RawSessionRow> {
    return this.withInboxZeroDbGuard(async () => {
      const existing = await this.prisma.inboxZeroSession.findUnique({
        where: { sessionId },
        select: {
          sessionId: true,
          status: true,
          step: true,
          query: true,
          startedAt: true,
          scannedAt: true,
          updatedAt: true,
        },
      });

      if (existing) return existing as unknown as RawSessionRow;

      return (await this.prisma.inboxZeroSession.create({
        data: { sessionId },
        select: {
          sessionId: true,
          status: true,
          step: true,
          query: true,
          startedAt: true,
          scannedAt: true,
          updatedAt: true,
        },
      })) as unknown as RawSessionRow;
    });
  }

  private async computeCounts(sessionId: string) {
    const rows = await this.prisma.inboxZeroItem.groupBy({
      by: ['category', 'status'],
      where: { sessionId },
      _count: { _all: true },
    });

    const counts: InboxZeroSessionView['counts'] = {
      urgent: { pending: 0, processed: 0 },
      quick_wins: { pending: 0, processed: 0 },
      schedule: { pending: 0, processed: 0 },
      ignore: { pending: 0, processed: 0 },
      newsletters: { pending: 0, processed: 0 },
    };

    for (const row of rows as Array<{
      category: string;
      status: string;
      _count: { _all: number };
    }>) {
      const category = ensureInboxZeroCategory(row.category);
      if (!category) continue;
      if (row.status === 'pending') counts[category].pending = row._count._all;
      else if (row.status === 'processed')
        counts[category].processed = row._count._all;
    }

    return counts;
  }

  private computeStep(
    session: RawSessionRow,
    counts: InboxZeroSessionView['counts'],
  ) {
    const totalPending = Object.values(counts).reduce(
      (sum, c) => sum + c.pending,
      0,
    );
    if (totalPending === 0) {
      return { nextStatus: 'completed', nextStep: 'done' as InboxZeroStep };
    }

    const pendingForStep = (step: InboxZeroStep) => {
      switch (step) {
        case 'urgent':
          return counts.urgent.pending;
        case 'quick_wins':
          return counts.quick_wins.pending;
        case 'schedule':
          return counts.schedule.pending;
        case 'cleanup':
          return counts.ignore.pending + counts.newsletters.pending;
        case 'done':
          return 0;
        default:
          return 0;
      }
    };

    const order: InboxZeroStep[] = [
      'urgent',
      'quick_wins',
      'schedule',
      'cleanup',
    ];
    const firstWithPending =
      order.find((s) => pendingForStep(s) > 0) ?? 'urgent';
    const current = ensureInboxZeroStep(session.step) ?? firstWithPending;

    if (current === 'done') {
      return { nextStatus: 'active', nextStep: firstWithPending };
    }

    if (pendingForStep(current) > 0) {
      return { nextStatus: 'active', nextStep: current };
    }

    return { nextStatus: 'active', nextStep: firstWithPending };
  }

  private toSessionView(
    session: RawSessionRow,
    counts: InboxZeroSessionView['counts'],
  ): InboxZeroSessionView {
    const status = session.status === 'completed' ? 'completed' : 'active';
    const step = ensureInboxZeroStep(session.step) ?? 'urgent';

    return {
      sessionId: session.sessionId,
      status,
      step,
      query: session.query || 'in:inbox is:unread',
      startedAt: session.startedAt.toISOString(),
      scannedAt: session.scannedAt ? session.scannedAt.toISOString() : null,
      counts,
    };
  }

  private toItemView(row: RawItemRow): InboxZeroItemView | null {
    const category = ensureInboxZeroCategory(row.category);
    if (!category) return null;

    const suggested = safeParseJson<{ action?: string; label?: string } | null>(
      row.suggestedJson,
      null,
    );
    const suggestedAction = ensureActionType(suggested?.action || '');
    const suggestedLabel =
      typeof suggested?.label === 'string' && suggested.label.trim()
        ? suggested.label.trim()
        : null;

    return {
      id: row.id,
      messageId: row.messageId,
      threadId: row.threadId,
      subject: row.subject,
      from: row.from,
      to: row.to,
      date: row.date.toISOString(),
      snippet: row.snippet,
      labels: safeParseJson<string[]>(row.labelsJson, []),
      gmailCategory: row.gmailCategory ?? null,
      unread: !!row.unread,
      category,
      priority: row.priority,
      reason: row.reason ?? null,
      suggested:
        suggestedAction && suggestedLabel
          ? { action: suggestedAction, label: suggestedLabel }
          : null,
      status: row.status === 'processed' ? 'processed' : 'pending',
      lastActionAt: row.lastActionAt ? row.lastActionAt.toISOString() : null,
    };
  }

  private async withGoogleGuard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      const googleError = asGoogleIntegrationError(error);
      if (googleError) {
        throw new BadRequestException({
          code: googleError.code,
          message: googleError.details ?? googleError.code,
        });
      }
      throw error;
    }
  }

  private async withInboxZeroDbGuard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (isPrismaMissingTableError(error)) {
        throw new ServiceUnavailableException(INBOX_ZERO_DB_MIGRATION_MESSAGE);
      }
      throw error;
    }
  }

  private cleanAssistantText(raw: string) {
    return raw
      .trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  private async generateDraftReply(detail: GmailMessageDetail) {
    const maxBodyChars = 3_000;
    const body = compactText(
      detail.bodyText || detail.snippet || '',
      maxBodyChars,
    );

    const messages = [
      {
        role: 'system' as const,
        content:
          "Tu es un assistant d'Inbox Zero. Rédige une réponse email en français, professionnelle, utile, concise (max 10 lignes). Si une information manque, pose 1 question claire. N'invente pas de faits.",
      },
      {
        role: 'user' as const,
        content: [
          `Email reçu`,
          `De: ${detail.from}`,
          `Sujet: ${detail.subject}`,
          `Contenu:`,
          body || '(vide)',
          '',
          `Réponse (texte brut, sans markdown):`,
        ].join('\n'),
      },
    ];

    const out = await this.llm.chat(messages);
    return this.cleanAssistantText(out);
  }
}
