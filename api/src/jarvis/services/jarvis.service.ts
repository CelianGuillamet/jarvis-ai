import {
  BadRequestException,
  HttpException,
  Injectable,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';

import { PrismaService } from '../../prisma/prisma.service';
import type { LLMProvider } from '../providers/llm.provider';
import { OllamaProvider } from '../providers/ollama.provider';
import { OpenAIProvider } from '../providers/openai.provider';
import {
  DisabledWebProvider,
  type WebProvider,
} from '../providers/web.provider';
import {
  DefaultWeatherProvider,
  type WeatherProvider,
} from '../providers/weather.provider';
import {
  buildToolExecutionPlan,
  type DecisionConfidence,
  type DecisionPlanner,
  type ToolExecutionPlan,
} from '../lib/execution-policy';
import { PendingActionsService } from './pending-action.service';
import {
  getLastWebSearchResults,
  previewTool,
  runTool,
  type ToolContext,
  ToolCall,
} from '../tools/tools';
import { normalizeToolOnlyCall, parseToolCall } from '../tools/tool-call';
import { gateToolCall } from '../tools/tool-engine';
import { resolveRange } from '../lib/resolve-range';
import { resolveWhenWindow } from '../lib/resolve-when';
import { planCalendarWrite } from '../lib/calendar-intent';
import {
  createHumanProfile,
  humanizeAskOrFinal,
  humanizeCancellation,
  humanizeError,
  humanizeNoPending,
  humanizePendingPrompt,
  humanizePendingReminder,
  humanizeToolResult,
  type HumanProfile,
  type HumanSpeechMode,
  type HumanVerbosity,
} from '../lib/humanize';
import { HumanProfileService } from './human-profile.service';
import { JarvisAuditService } from './jarvis-audit.service';
import { JarvisMemoryService } from './jarvis-memory.service';
import { JarvisMissionService } from './jarvis-mission.service';
import { JarvisWorkflowService } from './jarvis-workflow.service';
import { JarvisGoalService } from './jarvis-goal.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { JarvisDependencyTrackingService } from './jarvis-dependency-tracking.service';
import { JarvisResourceAllocationService } from './jarvis-resource-allocation.service';
import { JarvisPredictiveAnalyticsService } from './jarvis-predictive-analytics.service';
import { JarvisSmartSchedulingService } from './jarvis-smart-scheduling.service';
import { JarvisContextualHelpService } from './jarvis-contextual-help.service';
import { JarvisSearchService } from './jarvis-search.service';
import { JarvisKnowledgeBaseService } from './jarvis-knowledge-base.service';
import { JarvisTimeInsightsService } from './jarvis-time-insights.service';
import { JarvisDelegationService } from './jarvis-delegation.service';
import { JarvisReminderService } from './jarvis-reminder.service';
import { JarvisHabitService } from './jarvis-habit.service';
import { JarvisContactService } from './jarvis-contact.service';
import { JarvisFinanceService } from './jarvis-finance.service';
import { buildJarvisBaseSystemPrompt } from '../lib/system-prompt';

import { CALENDAR_PROVIDER } from '../../calendar/calendar.module';
import type { CalendarProvider } from '../../calendar/providers/calendar.provider';
import { GMAIL_PROVIDER } from '../../gmail/gmail.module';
import type {
  GmailMessageItem,
  GmailProvider,
} from '../../gmail/providers/gmail.provider';
import { getGmailCategoryPriority } from '../../gmail/gmail-category';
import { asGoogleIntegrationError } from '../../google/google-integration.error';
import { buildGoogleConnectionStatus } from '../../google/google-scopes';

type ToolOnly = Extract<ToolCall, { type: 'tool' }>;
type ToolName = Extract<ToolCall, { type: 'tool' }>['name'];

type AskAction = {
  type: 'ask';
  text: string;
  choices?: string[];
  awaiting?: string;
};

type JarvisAction = ToolCall | AskAction;

type ActionDecision = {
  action: JarvisAction;
  planner: DecisionPlanner;
  confidence: DecisionConfidence;
};

type PendingActionView = {
  id: string;
  name: ToolName;
  args: ToolOnly['args'];
  summary: string;
  preview: string | null;
  risk: ToolExecutionPlan['risk'];
  sideEffect: boolean;
  planner: DecisionPlanner;
  confidence: DecisionConfidence;
  confirmationReason: ToolExecutionPlan['confirmationReason'];
};

type ConversationState = {
  askedText: string;
  awaiting: string;
  originalUserText: string;
  createdAt: number;
};

type SessionMemoryTurn = {
  userText: string;
  assistantText: string;
  kind: 'ask' | 'final' | 'tool' | 'confirm' | 'error';
  toolName?: ToolName;
  createdAt: number;
};

type JarvisQuickAction = {
  kind: 'chat' | 'link' | 'confirm';
  label: string;
  prompt?: string;
  href?: string;
};

type JarvisSuggestion = {
  title: string;
  detail: string;
  tone: 'neutral' | 'warn' | 'ok';
  prompt?: string;
  href?: string;
};

type AuditStatusFilter = 'pending' | 'all';

type AuditExecutionContext = {
  sessionId: string;
  source: 'chat' | 'confirm_text' | 'confirm_endpoint';
  pendingActionId?: string;
  call?: ToolOnly;
  plan?: ToolExecutionPlan;
};

function configBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function parseSpeechMode(
  value: string | undefined,
  fallback: HumanSpeechMode,
): HumanSpeechMode {
  if (value === 'tu' || value === 'vous') return value;
  return fallback;
}

function parseVerbosity(
  value: string | undefined,
  fallback: HumanVerbosity,
): HumanVerbosity {
  if (value === 'brief' || value === 'normal' || value === 'detailed')
    return value;
  return fallback;
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null;
}

function normalizeIntentText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractRefsFromText(value: string) {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of value.matchAll(/\b#?(\d{1,3})\b/g)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 999) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function extractOrdinalRefFromText(value: string) {
  const patterns: Array<{ n: number; re: RegExp }> = [
    { n: 1, re: /\b(premier|premiere|1er|1ere|1e)\b/ },
    { n: 2, re: /\b(deuxieme|second|seconde|2e|2eme)\b/ },
    { n: 3, re: /\b(troisieme|3e|3eme)\b/ },
    { n: 4, re: /\b(quatrieme|4e|4eme)\b/ },
    { n: 5, re: /\b(cinquieme|5e|5eme)\b/ },
    { n: 6, re: /\b(sixieme|6e|6eme)\b/ },
    { n: 7, re: /\b(septieme|7e|7eme)\b/ },
    { n: 8, re: /\b(huitieme|8e|8eme)\b/ },
    { n: 9, re: /\b(neuvieme|9e|9eme)\b/ },
    { n: 10, re: /\b(dixieme|10e|10eme)\b/ },
  ];
  for (const { n, re } of patterns) {
    if (re.test(value)) return n;
  }
  return null;
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((p) => text.includes(p));
}

function hasMetVerb(text: string) {
  return /\bmet(s)?\b/.test(text);
}

function extractWeatherLocation(text: string) {
  const m = text.match(/\b(?:a|sur|pour)\s+([a-z][a-z -]{1,60})/);
  if (!m) return '';
  let raw = (m[1] || '').trim();
  raw = raw.replace(/[.,;!?].*$/, '').trim();

  const stopPhrases = [
    'aujourd hui',
    'demain',
    'today',
    'tomorrow',
    'semaine',
    'mois',
    'prochain',
    'prochaine',
  ];
  for (const stop of stopPhrases) {
    const idx = raw.indexOf(` ${stop}`);
    if (idx > 0) {
      raw = raw.slice(0, idx).trim();
    }
  }
  if (!raw || stopPhrases.includes(raw)) return '';
  return raw;
}

function pickFocusUnreadEmail(messages: GmailMessageItem[]) {
  return (
    [...messages].sort((a, b) => {
      const categoryDelta =
        getGmailCategoryPriority(b.category) -
        getGmailCategoryPriority(a.category);
      if (categoryDelta !== 0) return categoryDelta;
      return b.date.getTime() - a.date.getTime();
    })[0] ?? null
  );
}

function extractMissionObjectiveFromText(userText: string) {
  let out = userText
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  const patterns = [
    /^(?:jarvis[,:\s-]*)?(?:prepare|prépare|fais|construis|donne|genere|génère|elabore|élabore)\s+(?:moi\s+)?(?:un\s+)?(?:plan de mission|plan d['’]action|plan|roadmap|strategie|stratégie)\s+(?:pour|sur|autour de)\s+/i,
    /^(?:comment\s+(?:tu|on)\s+(?:t['’]y|s['’]y)\s+prend(?:rais|rait|re)?\s+pour)\s+/i,
    /^(?:aide[- ]moi\s+a\s+)?(?:structurer|organiser|clarifier)\s+(?:ma\s+|mon\s+)?(?:mission|strategie|stratégie|roadmap|plan)\s+(?:pour\s+)?/i,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, '').trim();
  }
  return out || userText.trim();
}

function extractMissionCloseTargetFromText(userText: string) {
  const cleaned = userText
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  let out = cleaned;
  const patterns = [
    /^(?:jarvis[,:\s-]*)?(?:cloture|clôture|clore|close|ferme|termine|terminer|acheve|achève)\s+(?:moi\s+)?(?:la\s+|ma\s+|cette\s+)?mission\s+/i,
    /^(?:jarvis[,:\s-]*)?(?:marque|passe)\s+(?:la\s+|ma\s+|cette\s+)?mission\s+/i,
  ];
  for (const pattern of patterns) {
    out = out.replace(pattern, '').trim();
  }
  out = out
    .replace(
      /\s+comme\s+(?:terminee|terminée|faite|close|cloturee|clôturée)$/i,
      '',
    )
    .replace(/^(?:de|du|des|d['’])\s+/i, '')
    .trim();

  if (out) return out;

  const generic = cleaned.match(
    /\b(cette mission|la mission|ma mission|mission en cours|mission active)\b/i,
  );
  return generic?.[1] ?? cleaned;
}

function extractFirstJsonObject(text: string) {
  const input = text.trim();
  const start = input.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (ch === '\\') {
        escaping = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseJarvisActionJson(jsonText: string): JarvisAction | null {
  let x: unknown;
  try {
    x = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isRecord(x) || typeof (x as any).type !== 'string') return null;

  if ((x as any).type === 'ask') {
    if (typeof (x as any).text !== 'string') return null;
    const choicesRaw = (x as any).choices;
    const choices = Array.isArray(choicesRaw)
      ? choicesRaw.filter((c) => typeof c === 'string')
      : undefined;
    const awaiting =
      typeof (x as any).awaiting === 'string' ? (x as any).awaiting : undefined;
    return { type: 'ask', text: (x as any).text, choices, awaiting };
  }

  return parseToolCall(jsonText);
}

function parseJarvisAction(jsonText: string): JarvisAction | null {
  const direct = parseJarvisActionJson(jsonText);
  if (direct) return direct;

  const embedded = extractFirstJsonObject(jsonText);
  if (!embedded || embedded === jsonText.trim()) return null;
  return parseJarvisActionJson(embedded);
}

@Injectable()
export class JarvisService {
  private readonly logger = new Logger(JarvisService.name);
  private readonly llm: LLMProvider;
  private readonly web: WebProvider;
  private readonly weather: WeatherProvider;
  private readonly simulation: boolean;
  private readonly tz = 'Europe/Paris';
  private readonly allowDefaultSession: boolean;
  private readonly requireConfirmSessionMatch: boolean;
  private readonly convoMaxSessions: number;
  private readonly humanizeEnabled: boolean;
  private readonly defaultSpeechMode: HumanSpeechMode;
  private readonly defaultVerbosity: HumanVerbosity;
  private readonly webAutoOpenEnabled: boolean;
  private readonly webAutoOpenMax: number;
  private readonly webAutoOpenMaxChars: number;
  private readonly memoryMaxTurns: number;
  private readonly memoryMaxSessions: number;
  private readonly memoryMaxChars: number;
  private readonly memoryTtlMs: number;

  private readonly convo = new Map<string, ConversationState>();
  private readonly recentMemory = new Map<string, SessionMemoryTurn[]>();
  private readonly convoTtlMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly pending: PendingActionsService,
    private readonly humanProfileStore: HumanProfileService,
    private readonly auditStore: JarvisAuditService,
    private readonly memoryStore: JarvisMemoryService,
    private readonly missionStore: JarvisMissionService,
    private readonly workflowStore: JarvisWorkflowService,
    private readonly goalStore: JarvisGoalService,
    private readonly conflictStore: ConflictDetectionService,
    private readonly dependencyStore: JarvisDependencyTrackingService,
    private readonly resourceStore: JarvisResourceAllocationService,
    private readonly analyticsStore: JarvisPredictiveAnalyticsService,
    private readonly schedulingStore: JarvisSmartSchedulingService,
    private readonly helpStore: JarvisContextualHelpService,
    private readonly searchStore: JarvisSearchService,
    private readonly knowledgeStore: JarvisKnowledgeBaseService,
    private readonly timeInsightsStore: JarvisTimeInsightsService,
    private readonly delegationStore: JarvisDelegationService,
    private readonly reminderStore: JarvisReminderService,
    private readonly habitStore: JarvisHabitService,
    private readonly contactStore: JarvisContactService,
    private readonly financeStore: JarvisFinanceService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
    @Inject(GMAIL_PROVIDER) private readonly gmail: GmailProvider,
  ) {
    this.simulation = configBool(this.config.get<string>('SIMULATION'), true);
    this.allowDefaultSession = configBool(
      this.config.get<string>('ALLOW_DEFAULT_SESSION'),
      true,
    );
    this.requireConfirmSessionMatch = configBool(
      this.config.get<string>('REQUIRE_CONFIRM_SESSION_MATCH'),
      false,
    );
    const convoTtlMinutes = Number(this.config.get('CONVO_TTL_MINUTES') ?? 10);
    this.convoTtlMs =
      (Number.isFinite(convoTtlMinutes) && convoTtlMinutes > 0
        ? convoTtlMinutes
        : 10) * 60_000;

    const maxSessions = Number(this.config.get('CONVO_MAX_SESSIONS') ?? 1_000);
    this.convoMaxSessions =
      Number.isFinite(maxSessions) && maxSessions > 0
        ? Math.floor(maxSessions)
        : 1_000;

    const memoryTurnsRaw = Number(
      this.config.get('JARVIS_MEMORY_MAX_TURNS') ?? 8,
    );
    this.memoryMaxTurns =
      Number.isFinite(memoryTurnsRaw) && memoryTurnsRaw > 0
        ? Math.min(20, Math.floor(memoryTurnsRaw))
        : 8;

    const memorySessionsRaw = Number(
      this.config.get('JARVIS_MEMORY_MAX_SESSIONS') ?? this.convoMaxSessions,
    );
    this.memoryMaxSessions =
      Number.isFinite(memorySessionsRaw) && memorySessionsRaw > 0
        ? Math.floor(memorySessionsRaw)
        : this.convoMaxSessions;

    const memoryCharsRaw = Number(
      this.config.get('JARVIS_MEMORY_MAX_CHARS') ?? 700,
    );
    this.memoryMaxChars =
      Number.isFinite(memoryCharsRaw) && memoryCharsRaw >= 160
        ? Math.min(2_000, Math.floor(memoryCharsRaw))
        : 700;

    const memoryTtlMinutesRaw = Number(
      this.config.get('JARVIS_MEMORY_TTL_MINUTES') ?? 60,
    );
    this.memoryTtlMs =
      (Number.isFinite(memoryTtlMinutesRaw) && memoryTtlMinutesRaw > 0
        ? memoryTtlMinutesRaw
        : 60) * 60_000;

    this.humanizeEnabled = configBool(
      this.config.get<string>('HUMANIZE_RESPONSES'),
      true,
    );
    this.defaultSpeechMode = parseSpeechMode(
      this.config.get<string>('JARVIS_DEFAULT_SPEECH_MODE'),
      'tu',
    );
    this.defaultVerbosity = parseVerbosity(
      this.config.get<string>('JARVIS_DEFAULT_VERBOSITY'),
      'normal',
    );
    this.webAutoOpenEnabled = configBool(
      this.config.get<string>('WEB_AUTO_OPEN_RESULTS'),
      true,
    );
    const autoOpenMaxRaw = Number(this.config.get('WEB_AUTO_OPEN_MAX') ?? 2);
    this.webAutoOpenMax =
      Number.isFinite(autoOpenMaxRaw) && autoOpenMaxRaw >= 0
        ? Math.min(5, Math.floor(autoOpenMaxRaw))
        : 2;
    const autoOpenCharsRaw = Number(
      this.config.get('WEB_AUTO_OPEN_MAX_CHARS') ?? 2_200,
    );
    this.webAutoOpenMaxChars =
      Number.isFinite(autoOpenCharsRaw) && autoOpenCharsRaw >= 300
        ? Math.min(8_000, Math.floor(autoOpenCharsRaw))
        : 2_200;

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
        `LLM provider: openai (${this.config.get<string>('OPENAI_MODEL_PRIMARY') || 'gpt-5-nano'} -> ${this.config.get<string>('OPENAI_MODEL_FALLBACK') || 'gpt-5-mini'})`,
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
        `LLM provider: ollama (${this.config.get('OLLAMA_MODEL') || 'llama3.1:latest'})`,
      );
    }

    this.web = new DisabledWebProvider();
    this.logger.log(`Web provider: ${this.web.name}`);

    this.weather = new DefaultWeatherProvider(
      this.config.get<string>('WEATHER_GEO_BASE_URL') ||
        'https://geocoding-api.open-meteo.com',
      this.config.get<string>('WEATHER_BASE_URL') || 'https://api.open-meteo.com',
      Number(this.config.get<string>('WEATHER_TIMEOUT_MS') || 6_000),
    );
    this.logger.log(`Weather provider: ${this.weather.name}`);
  }

  private readonly baseSystemPrompt = buildJarvisBaseSystemPrompt();

  private cleanJson(raw: string) {
    return raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  private cleanAssistantText(raw: string) {
    const cleaned = this.cleanJson(raw).trim();
    if (!cleaned) return '';
    if (parseJarvisAction(cleaned)) return '';
    return cleaned.replace(/^"(.*)"$/s, '$1').trim();
  }

  private nowContextLine() {
    const nowParis = DateTime.now()
      .setZone(this.tz)
      .toISO({ suppressMilliseconds: true });
    return `Contexte: nous sommes le ${nowParis} (timezone ${this.tz}).`;
  }

  private async askModel(
    sessionId: string,
    userText: string,
    extraSystem?: string,
  ) {
    const recentMemory = this.buildRecentMemoryContext(sessionId);
    const [worldModelContext, missionContext, workflowContext, googleToken] =
      await Promise.all([
        this.memoryStore.buildPromptContext(sessionId),
        this.missionStore.buildPromptContext(sessionId),
        this.workflowStore.buildPromptContext(sessionId),
        this.prisma.googleOAuthToken.findUnique({
          where: { sessionId },
          select: { scope: true },
        }),
      ]);
    const googleStatus = buildGoogleConnectionStatus(googleToken?.scope);
    const capabilitiesContext = [
      `Capacités: todos/notes/courses=OK | web=${this.web.name} | weather=${this.weather.name} | Google=${googleStatus.connected ? 'connecté' : 'non connecté'} | Calendar=${googleStatus.calendarConnected ? 'connecté' : 'non connecté'} | Gmail=${googleStatus.gmailConnected ? 'connecté' : 'non connecté'} | simulation=${this.simulation ? 'true' : 'false'}.`,
      `Si Calendar/Gmail ne sont pas connectés, n’utilise pas les outils calendar.* / gmail.*: réponds "ask" pour proposer la connexion.`,
    ].join('\n');
    const system = [
      this.baseSystemPrompt,
      this.nowContextLine(),
      capabilitiesContext,
      worldModelContext,
      missionContext,
      workflowContext,
      recentMemory
        ? `Historique recent de la session:\n${recentMemory}\n\nUtilise cet historique pour resoudre les suites logiques comme "et demain", "le 2e", "celui-la". Si le lien reste ambigu, reponds "ask".`
        : '',
      extraSystem ? `RAPPEL IMPORTANT:\n${extraSystem}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const raw = await this.llm.chat([
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ]);

    return { raw, cleaned: this.cleanJson(raw) };
  }

  private shouldSummarizeWebResult(
    call: Extract<ToolCall, { type: 'tool' }>,
    rawResult: string,
  ) {
    const text = rawResult.trim();
    if (!text) return false;
    if (call.name === 'web.search') {
      return /^Résultats web \(/i.test(text);
    }
    if (call.name === 'web.open') {
      return /^Page web:/i.test(text);
    }
    return false;
  }

  private async maybeSummarizeWebResult(
    userText: string,
    call: Extract<ToolCall, { type: 'tool' }>,
    rawResult: string,
  ) {
    if (!this.shouldSummarizeWebResult(call, rawResult)) return rawResult;

    const nowParis = DateTime.now()
      .setZone(this.tz)
      .toISO({ suppressMilliseconds: true });

    const evidence =
      call.name === 'web.search'
        ? await this.collectWebEvidenceFromResults(rawResult)
        : '';

    const system = [
      'Tu synthétises une sortie brute de recherche web pour un assistant personnel.',
      'Objectif: répondre directement à la question utilisateur, comme un assistant conversationnel.',
      'Règles:',
      '- Réponds en français naturel.',
      '- Donne d’abord la réponse directe en 1 à 3 phrases.',
      '- Priorité aux informations lues dans les pages ("Contenus consultes") si disponibles.',
      '- Si la question est temporelle (ex: prochain, aujourd’hui), utilise la date de référence fournie.',
      '- Si la demande contient "prochain/next", ne propose jamais une date passée.',
      '- S’il y a ambiguïté ou conflit entre sources, donne la meilleure hypothèse et précise brièvement l’incertitude.',
      '- Ajoute ensuite une ligne "Sources: URL1 | URL2" (max 3 URLs).',
      '- Pas de markdown.',
    ].join('\n');

    const user = [
      `Date de reference: ${nowParis} (${this.tz})`,
      `Demande utilisateur: ${userText}`,
      `Tool execute: ${call.name}`,
      `Sortie brute:`,
      rawResult,
      evidence ? '\nContenus consultes:\n' : '',
      evidence,
      '',
      'Reponse finale:',
    ].join('\n');

    try {
      const out = await this.llm.chat([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);
      const cleaned = out.trim();
      if (cleaned) return cleaned;
    } catch (error) {
      this.logger.warn(
        `Synthese web LLM indisponible (${call.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.summarizeWebResultFallback(userText, call, rawResult);
  }

  private extractWebUrlsFromSearchResult(rawResult: string) {
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /URL:\s*(https?:\/\/\S+)/g;
    for (const m of rawResult.matchAll(re)) {
      const url = (m[1] || '').replace(/[)\].,;!?]+$/g, '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  }

  private async collectWebEvidenceFromResults(rawResult: string) {
    if (!this.webAutoOpenEnabled || this.webAutoOpenMax <= 0) return '';
    const urls = this.extractWebUrlsFromSearchResult(rawResult).slice(
      0,
      this.webAutoOpenMax,
    );
    if (!urls.length) return '';

    const opened = await Promise.allSettled(
      urls.map((url) => this.web.open(url, this.webAutoOpenMaxChars)),
    );

    const blocks: string[] = [];
    for (const item of opened) {
      if (item.status === 'rejected') {
        this.logger.warn(
          `Lecture source web echouee: ${item.reason instanceof Error ? item.reason.message : String(item.reason)}`,
        );
        continue;
      }
      const content = item.value.content.trim();
      if (!content) continue;
      blocks.push(
        [
          `Source: ${item.value.url}`,
          item.value.title ? `Titre: ${item.value.title}` : null,
          `Contenu: ${content}`,
        ]
          .filter((line): line is string => !!line)
          .join('\n'),
      );
    }
    return blocks.join('\n\n');
  }

  private parseWebSearchRows(rawResult: string) {
    const rows: Array<{ title: string; url: string; snippet: string }> = [];
    const re = /#\d+\s*-\s*([^\n]+)\nURL:\s*(\S+)(?:\nExtrait:\s*([^\n]+))?/g;
    for (const m of rawResult.matchAll(re)) {
      rows.push({
        title: (m[1] || '').trim(),
        url: (m[2] || '').trim(),
        snippet: (m[3] || '').trim(),
      });
    }
    return rows;
  }

  private summarizeWebResultFallback(
    userText: string,
    call: Extract<ToolCall, { type: 'tool' }>,
    rawResult: string,
  ) {
    if (call.name === 'web.open') {
      const text = rawResult.trim();
      const snippet = text.length > 900 ? `${text.slice(0, 900)}...` : text;
      return `J'ai ouvert la page. Voici l'essentiel:\n${snippet}`;
    }

    const rows = this.parseWebSearchRows(rawResult);
    if (!rows.length) return rawResult;

    const normalized = normalizeIntentText(userText);
    const mentionsGrandPrix =
      /\b(?:grand|gran)\s+prix\b/.test(normalized) || /\bgp\b/.test(normalized);
    const asksDateAndPlace =
      /\bdate\b/.test(normalized) &&
      (/\blieu\b/.test(normalized) ||
        /\bou\b/.test(normalized) ||
        /\bo[uù]\b/.test(normalized));
    const asksNext = /\b(prochain|prochaine|next|suivant|suivante)\b/.test(
      normalized,
    );
    const asksF1NextGp =
      /\b(?:f1|formule 1)\b/.test(normalized) &&
      (asksNext || asksDateAndPlace) &&
      mentionsGrandPrix;
    if (asksF1NextGp) {
      const extracted = this.extractNextF1GrandPrix(rows, {
        futureOnly: asksNext,
      });
      if (extracted) {
        const sources = rows
          .slice(0, 3)
          .map((r) => r.url)
          .join(' | ');
        return [
          `Le prochain Grand Prix semble etre ${extracted.name}, a ${extracted.place}, le ${extracted.dateText}.`,
          `Sources: ${sources}`,
        ].join('\n');
      }
      if (asksNext) {
        const sources = rows
          .slice(0, 3)
          .map((r) => r.url)
          .join(' | ');
        return [
          'Je ne trouve pas de date future certaine dans ces resultats. Essaie: "prochain GP F1 2026 date et lieu".',
          `Sources: ${sources}`,
        ].join('\n');
      }
    }

    const currentYear = DateTime.now().setZone(this.tz).year;
    const rankedRows = asksNext
      ? rows.filter((row) => {
          const y = `${row.title} ${row.snippet}`.match(/\b(20\d{2})\b/);
          if (!y) return true;
          return Number(y[1]) >= currentYear;
        })
      : rows;
    const top = rankedRows[0] || rows[0];
    const sourceRows = (rankedRows.length ? rankedRows : rows).slice(0, 3);
    const sources = sourceRows.map((r) => r.url).join(' | ');
    return [
      `J'ai trouve ${rows.length} resultats. Le plus pertinent: ${top.title}.`,
      top.snippet ? `Extrait: ${top.snippet}` : null,
      `Sources: ${sources}`,
    ]
      .filter((line): line is string => !!line)
      .join('\n');
  }

  private parseSlashDate(value: string) {
    const parsedShort = DateTime.fromFormat(value, 'd/L/yy', {
      zone: this.tz,
    });
    if (parsedShort.isValid) return parsedShort;
    const parsedLong = DateTime.fromFormat(value, 'd/L/yyyy', {
      zone: this.tz,
    });
    return parsedLong.isValid ? parsedLong : null;
  }

  private extractNextF1GrandPrix(
    rows: Array<{ title: string; url: string; snippet: string }>,
    options?: { futureOnly?: boolean },
  ) {
    const now = DateTime.now().setZone(this.tz).startOf('day');
    const futureOnly = options?.futureOnly ?? false;

    type Candidate = {
      name: string;
      place: string;
      start: DateTime;
      end?: DateTime;
    };
    const candidates: Candidate[] = [];
    const pushCandidate = (candidate: Candidate | null) => {
      if (!candidate) return;
      if (!candidate.start.isValid) return;
      candidates.push(candidate);
    };

    const monthMap: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };

    for (const row of rows) {
      const text = `${row.title} ${row.snippet}`.replace(/\s+/g, ' ').trim();

      for (const m of text.matchAll(
        /([A-Za-zÀ-ÿ'’ -]+)\s*\(([^)]+)\)\s*,\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      )) {
        const date = this.parseSlashDate((m[3] || '').trim());
        if (!date) continue;
        const place = (m[2] || '').trim() || (m[1] || '').trim();
        const name = `Grand Prix de ${(m[1] || '').trim()}`;
        pushCandidate({ name, place, start: date });
      }

      for (const m of text.matchAll(
        /Grand Prix d['’]?\s*([A-Za-zÀ-ÿ'’ -]+).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
      )) {
        const date = this.parseSlashDate((m[2] || '').trim());
        if (!date) continue;
        const place = (m[1] || '').trim();
        const name = `Grand Prix de ${place}`;
        pushCandidate({ name, place, start: date });
      }

      const yearHint =
        Number(
          (`${row.title} ${row.url} ${row.snippet}`.match(/\b(20\d{2})\b/) ||
            [])[1],
        ) || now.year;
      for (const m of text.matchAll(
        /ROUND\s*\d+\s*(\d{1,2})\s*-\s*(\d{1,2})\s*([A-Za-z]{3})\.?\s*([A-Za-zÀ-ÿ'’ -]+)/gi,
      )) {
        const startDay = Number(m[1]);
        const endDay = Number(m[2]);
        const month = monthMap[(m[3] || '').toLowerCase()];
        const place = (m[4] || '').trim();
        if (!month || !place) continue;
        let year = yearHint;
        if (year === now.year && month < now.month - 1) year += 1;

        const start = DateTime.fromObject(
          { year, month, day: startDay },
          { zone: this.tz },
        );
        const end = DateTime.fromObject(
          { year, month, day: endDay },
          { zone: this.tz },
        );
        if (!start.isValid || !end.isValid) continue;
        pushCandidate({
          name: `Grand Prix de ${place}`,
          place,
          start,
          end,
        });
      }
    }

    if (!candidates.length) return null;

    const futureCandidates = candidates.filter((c) => {
      const at = (c.end ?? c.start).endOf('day');
      return at.toMillis() >= now.toMillis();
    });
    const pool =
      futureOnly && futureCandidates.length
        ? futureCandidates
        : futureOnly
          ? []
          : futureCandidates.length
            ? futureCandidates
            : candidates;
    if (!pool.length) return null;

    const selected = [...pool].sort(
      (a, b) => a.start.toMillis() - b.start.toMillis(),
    )[0];
    const hasWeekend =
      !!selected.end &&
      selected.end.isValid &&
      selected.end.toMillis() > selected.start.toMillis();
    const dateText = hasWeekend
      ? `week-end du ${selected.start.toFormat('d')} au ${selected.end!.toFormat('d LLLL yyyy')}`
      : selected.start.toFormat('cccc d LLLL yyyy');

    return {
      name: selected.name,
      place: selected.place,
      dateText,
    };
  }

  private getState(sessionId: string) {
    this.cleanupConvo();
    const st = this.convo.get(sessionId);
    if (!st) return null;
    if (Date.now() - st.createdAt > this.convoTtlMs) {
      this.convo.delete(sessionId);
      return null;
    }
    return st;
  }

  private setState(sessionId: string, st: ConversationState) {
    this.cleanupConvo();
    this.convo.set(sessionId, st);
  }

  private clearState(sessionId: string) {
    this.convo.delete(sessionId);
  }

  private cleanupConvo() {
    const now = Date.now();
    for (const [sessionId, st] of this.convo.entries()) {
      if (now - st.createdAt > this.convoTtlMs) this.convo.delete(sessionId);
    }

    if (this.convo.size <= this.convoMaxSessions) return;
    const oldest = [...this.convo.entries()].sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    for (let i = 0; i < oldest.length - this.convoMaxSessions; i++) {
      this.convo.delete(oldest[i][0]);
    }
  }

  private cleanupRecentMemory() {
    const now = Date.now();
    for (const [sessionId, turns] of this.recentMemory.entries()) {
      const fresh = turns.filter(
        (turn) => now - turn.createdAt <= this.memoryTtlMs,
      );
      if (fresh.length) {
        this.recentMemory.set(sessionId, fresh);
      } else {
        this.recentMemory.delete(sessionId);
      }
    }

    if (this.recentMemory.size <= this.memoryMaxSessions) return;
    const oldest = [...this.recentMemory.entries()].sort((a, b) => {
      const aTs = a[1][a[1].length - 1]?.createdAt ?? 0;
      const bTs = b[1][b[1].length - 1]?.createdAt ?? 0;
      return aTs - bTs;
    });
    for (let i = 0; i < oldest.length - this.memoryMaxSessions; i++) {
      this.recentMemory.delete(oldest[i][0]);
    }
  }

  private compactMemoryText(text: string, max = this.memoryMaxChars) {
    const clean = text
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!clean) return '';
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1)}…`;
  }

  private rememberTurn(
    sessionId: string,
    turn: Omit<SessionMemoryTurn, 'createdAt'>,
  ) {
    this.cleanupRecentMemory();
    const history = this.recentMemory.get(sessionId) ?? [];
    history.push({
      ...turn,
      userText: this.compactMemoryText(turn.userText, 280),
      assistantText: this.compactMemoryText(turn.assistantText),
      createdAt: Date.now(),
    });
    if (history.length > this.memoryMaxTurns) {
      history.splice(0, history.length - this.memoryMaxTurns);
    }
    this.recentMemory.set(sessionId, history);
  }

  private rememberToolTurn(
    sessionId: string,
    userText: string,
    call: Extract<ToolCall, { type: 'tool' }>,
    result: string,
    options?: { prefix?: string },
  ) {
    const argsText = this.compactMemoryText(JSON.stringify(call.args), 220);
    const assistantText = [
      options?.prefix
        ? `${options.prefix} ${call.name}.`
        : `Action ${call.name}.`,
      argsText ? `Args: ${argsText}` : '',
      `Resultat: ${result}`,
    ]
      .filter(Boolean)
      .join('\n');

    this.rememberTurn(sessionId, {
      userText,
      assistantText,
      kind: options?.prefix ? 'confirm' : 'tool',
      toolName: call.name,
    });
  }

  private async refreshPersistentSessionState(sessionId: string) {
    await this.memoryStore.refreshSessionSummary(
      sessionId,
      this.recentMemory.get(sessionId) ?? [],
    );
  }

  private buildRecentMemoryContext(sessionId: string) {
    this.cleanupRecentMemory();
    const turns = this.recentMemory.get(sessionId) ?? [];
    if (!turns.length) return '';

    return turns
      .map((turn, index) => {
        const assistantLabel = turn.toolName
          ? `${turn.kind}:${turn.toolName}`
          : turn.kind;
        return [
          `Tour ${index + 1}:`,
          `Utilisateur: ${turn.userText}`,
          `Assistant [${assistantLabel}]: ${turn.assistantText}`,
        ].join('\n');
      })
      .join('\n\n');
  }

  private extractSuggestedCommandsFromToolResult(text: string) {
    if (!text) return [];

    const lines = text.split('\n');
    const start = lines.findIndex((line) =>
      /^Commandes suggerees/i.test(line.trim()),
    );
    if (start < 0) return [];

    const out: string[] = [];
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line) continue;
      if (!line.startsWith('- ')) break;
      out.push(line.slice(2).trim());
    }

    return out.slice(0, 5);
  }

  private combineChoiceLists(...lists: Array<string[] | undefined>) {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const list of lists) {
      for (const item of list ?? []) {
        const clean = item.trim();
        if (!clean) continue;

        const key = normalizeIntentText(clean);
        if (!key || seen.has(key)) continue;

        seen.add(key);
        out.push(clean);
      }
    }

    return out.slice(0, 5);
  }

  private async buildAutoFollowUpChoices(
    sessionId: string,
    triggerToolName: string,
    result: string,
  ) {
    const workflowChoices = await this.workflowStore.suggestNextPrompts(
      sessionId,
      triggerToolName,
      { limit: 3 },
    );

    return this.combineChoiceLists(
      workflowChoices,
      this.extractSuggestedCommandsFromToolResult(result),
    );
  }

  private llmProviderName() {
    const explicit = (this.llm as any)?.providerName;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    if (this.llm instanceof OpenAIProvider) return 'openai';
    if (this.llm instanceof OllamaProvider) return 'ollama';
    return this.llm.constructor?.name || 'unknown';
  }

  private buildRecoverableErrorResponse(sessionId: string, error: unknown) {
    const googleError = asGoogleIntegrationError(error);
    if (!googleError) return null;

    const connectUrl = `/auth/google?sessionId=${encodeURIComponent(sessionId)}`;

    switch (googleError.code) {
      case 'GOOGLE_NOT_CONNECTED':
        return {
          text: `Google Calendar n’est pas connecté pour cette session. Connecte-le via ${connectUrl} puis réessaie.`,
          meta: { simulation: this.simulation, sessionId },
        };
      case 'CALENDAR_SCOPE_MISSING':
        return {
          text: `Les permissions Calendar sont insuffisantes. Reconnecte Google via ${connectUrl} (consent) pour accorder les scopes Calendar.`,
          meta: { simulation: this.simulation, sessionId },
        };
      case 'GMAIL_NOT_CONNECTED':
        return {
          text: `Gmail n’est pas connecté pour cette session. Connecte Google via ${connectUrl} puis réessaie.`,
          meta: { simulation: this.simulation, sessionId },
        };
      case 'GMAIL_SCOPE_MISSING':
        return {
          text: `Les permissions Gmail sont insuffisantes. Reconnecte Google via ${connectUrl} (consent) pour accorder les scopes Gmail.`,
          meta: { simulation: this.simulation, sessionId },
        };
      default:
        return null;
    }
  }

  private buildQuickActions(input: {
    sessionId: string;
    pendingAction: {
      id: string;
      call: Extract<ToolCall, { type: 'tool' }>;
    } | null;
    googleConnected: boolean;
    gmailConnected: boolean;
    openTodos: number;
    openShopping: number;
    unreadEmails: number | null;
    eventsToday: number | null;
    nextEventTitle?: string | null;
    activeMissions?: number;
    actionAuditCount?: number;
    workflowSuggestion?: string | null;
  }): JarvisQuickAction[] {
    const actions: JarvisQuickAction[] = [];

    if (input.pendingAction) {
      actions.push({
        kind: 'confirm',
        label: 'Confirmer l’action en attente',
        prompt: 'oui',
      });
    }

    if (!input.googleConnected) {
      actions.push({
        kind: 'link',
        label: 'Connecter Google',
        href: `/auth/google?sessionId=${encodeURIComponent(input.sessionId)}`,
      });
    }

    if ((input.unreadEmails ?? 0) > 0 && input.gmailConnected) {
      actions.push({
        kind: 'chat',
        label: 'Résumer les emails non lus',
        prompt: 'Résume mes emails non lus',
      });
    }

    if ((input.eventsToday ?? 0) > 0) {
      actions.push({
        kind: 'chat',
        label: 'Afficher mon agenda du jour',
        prompt: "Montre-moi mon agenda d'aujourd'hui",
      });
    }

    if (input.nextEventTitle) {
      actions.push({
        kind: 'chat',
        label: 'Préparer la prochaine mission',
        prompt: `Prépare un plan de mission pour ${input.nextEventTitle}`,
      });
    }

    if ((input.activeMissions ?? 0) > 0) {
      actions.push({
        kind: 'chat',
        label: 'Voir les missions actives',
        prompt: 'Liste mes missions actives',
      });
    }

    if ((input.actionAuditCount ?? 0) > 0) {
      actions.push({
        kind: 'chat',
        label: 'Voir l’audit récent',
        prompt: 'Montre-moi l’historique des actions',
      });
    }

    if (input.workflowSuggestion) {
      actions.push({
        kind: 'chat',
        label: 'Relancer une routine',
        prompt: input.workflowSuggestion,
      });
    }

    if (input.openTodos > 0) {
      actions.push({
        kind: 'chat',
        label: 'Revoir les todos',
        prompt: 'Liste mes todos',
      });
    }

    if (input.openShopping > 0) {
      actions.push({
        kind: 'chat',
        label: 'Voir les courses',
        prompt: 'Liste mes courses',
      });
    }

    if (!actions.length) {
      actions.push({
        kind: 'chat',
        label: 'Lancer un briefing',
        prompt: 'Fais mon briefing du jour',
      });
    }

    const deduped: JarvisQuickAction[] = [];
    const seen = new Set<string>();
    for (const action of actions) {
      const key = `${action.kind}|${action.label}|${action.prompt ?? ''}|${action.href ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(action);
    }

    return deduped.slice(0, 5);
  }

  private buildProactiveSuggestions(input: {
    sessionId: string;
    pendingAction: PendingActionView | null;
    googleConnected: boolean;
    unreadEmails: number | null;
    nextEvent: { title: string; when: Date } | null;
    activeMission: {
      objective: string;
      summary: string;
      nextStep: string | null;
    } | null;
    openTodos: number;
    workflowSuggestion?: string | null;
  }): JarvisSuggestion[] {
    const compact = (value: string, max = 140) => {
      const clean = value.replace(/\s+/g, ' ').trim();
      if (clean.length <= max) return clean;
      return `${clean.slice(0, max - 1)}…`;
    };

    const suggestions: JarvisSuggestion[] = [];

    if (input.pendingAction) {
      suggestions.push({
        title: 'Validation en attente',
        detail: input.pendingAction.summary,
        tone: input.pendingAction.risk === 'high' ? 'warn' : 'neutral',
        prompt: 'oui',
      });
    }

    if (!input.googleConnected) {
      suggestions.push({
        title: 'Connexion incomplète',
        detail:
          'Google n’est pas encore connecté pour cette session, ce qui limite Calendar et Gmail.',
        tone: 'neutral',
        href: `/auth/google?sessionId=${encodeURIComponent(input.sessionId)}`,
      });
    }

    if (input.activeMission) {
      suggestions.push({
        title: 'Mission active',
        detail: input.activeMission.nextStep
          ? `${input.activeMission.objective} · prochaine étape: ${compact(input.activeMission.nextStep, 110)}`
          : `${input.activeMission.objective} · ${compact(input.activeMission.summary, 110)}`,
        tone: 'neutral',
        prompt: `Aide-moi à avancer sur ${input.activeMission.objective}`,
      });
    }

    if (input.workflowSuggestion) {
      suggestions.push({
        title: 'Routine détectée',
        detail: `Une suite d’action probable a été reconnue: ${compact(input.workflowSuggestion, 105)}`,
        tone: 'neutral',
        prompt: input.workflowSuggestion,
      });
    }

    if (input.nextEvent) {
      const diffMinutes = Math.round(
        (input.nextEvent.when.getTime() - Date.now()) / 60_000,
      );
      suggestions.push({
        title: diffMinutes <= 90 ? 'Rendez-vous proche' : 'Agenda du jour',
        detail:
          diffMinutes <= 90
            ? `${input.nextEvent.title} commence bientôt. Vérifie ce qui doit être prêt.`
            : `${input.nextEvent.title} reste le prochain jalon visible aujourd’hui.`,
        tone: diffMinutes <= 90 ? 'warn' : 'neutral',
        prompt: "Montre-moi mon agenda d'aujourd'hui",
      });
    }

    if ((input.unreadEmails ?? 0) > 0) {
      suggestions.push({
        title: 'Emails à trier',
        detail:
          input.unreadEmails === 1
            ? '1 email non lu peut encore changer les priorités du moment.'
            : `${input.unreadEmails} emails non lus peuvent perturber l’exécution si tu les laisses s’accumuler.`,
        tone: (input.unreadEmails ?? 0) >= 3 ? 'warn' : 'neutral',
        prompt: 'Résume mes emails non lus',
      });
    }

    if (input.openTodos >= 5) {
      suggestions.push({
        title: 'Charge ouverte élevée',
        detail: `${input.openTodos} todos restent ouverts. Un tri rapide éviterait la dispersion.`,
        tone: 'warn',
        prompt: 'Liste mes todos',
      });
    }

    if (!suggestions.length) {
      suggestions.push({
        title: 'Cap stable',
        detail:
          'Aucun point chaud immédiat détecté. Jarvis peut repartir d’un briefing court.',
        tone: 'ok',
        prompt: 'Fais mon briefing du jour',
      });
    }

    const deduped: JarvisSuggestion[] = [];
    const seen = new Set<string>();
    for (const suggestion of suggestions) {
      const key = `${suggestion.title}|${suggestion.prompt ?? ''}|${suggestion.href ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(suggestion);
    }

    return deduped.slice(0, 4);
  }

  private summarizeActivityResult(result: string | null | undefined) {
    const text = (result || '').trim();
    if (!text) return '';
    if (text.startsWith('PENDING:')) {
      return 'Action sensible en attente de confirmation.';
    }
    if (text.startsWith('ASK:')) {
      const awaiting = text.slice(4).trim() || 'generic';
      return `Jarvis attend une precision (${awaiting}).`;
    }
    if (text.startsWith('ERROR:')) {
      return `Erreur: ${text.slice(6).trim()}`;
    }
    return text;
  }

  private resolveSessionId(sessionId?: string) {
    const value = sessionId?.trim();
    if (value) return value;

    if (this.allowDefaultSession) return 'default';
    throw new BadRequestException('sessionId est requis');
  }

  private async logSafe(data: {
    sessionId?: string;
    userText: string;
    modelRaw: string;
    simulation: boolean;
    toolName?: string;
    toolArgs?: string;
    result?: string;
  }) {
    try {
      await this.prisma.jarvisLog.create({ data });
    } catch (error) {
      this.logger.error(
        'Impossible d’écrire le log Jarvis',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async getHumanProfile(sessionId: string) {
    if (!this.humanizeEnabled) {
      return createHumanProfile(this.defaultSpeechMode, this.defaultVerbosity);
    }
    return this.humanProfileStore.get(sessionId, {
      speechMode: this.defaultSpeechMode,
      verbosity: this.defaultVerbosity,
    });
  }

  private async refreshHumanProfile(sessionId: string, userText: string) {
    if (!this.humanizeEnabled) {
      return createHumanProfile(this.defaultSpeechMode, this.defaultVerbosity);
    }

    return this.humanProfileStore.updateFromUserText(sessionId, userText, {
      speechMode: this.defaultSpeechMode,
      verbosity: this.defaultVerbosity,
    });
  }

  private humanizeAskOrFinalText(
    profile: HumanProfile,
    text: string,
    kind: 'ask' | 'final',
  ) {
    if (!this.humanizeEnabled) return text;
    return humanizeAskOrFinal(profile, text, kind);
  }

  private humanizeToolOutput(
    profile: HumanProfile,
    result: string,
    options?: { fromConfirmation?: boolean },
  ) {
    if (!this.humanizeEnabled) return result;
    return humanizeToolResult(profile, result, options);
  }

  private buildPendingActionView(
    profile: HumanProfile,
    item: { id: string; call: ToolOnly },
    options?: {
      planner?: DecisionPlanner;
      confidence?: DecisionConfidence;
      preview?: string | null;
    },
  ): {
    pendingAction: PendingActionView;
    decision: ToolExecutionPlan;
  } {
    const decision = buildToolExecutionPlan(item.call, {
      planner: options?.planner,
      confidence: options?.confidence,
      tz: this.tz,
      speechMode: profile.speechMode,
    });

    return {
      pendingAction: {
        id: item.id,
        name: item.call.name,
        args: item.call.args,
        summary: decision.summary,
        preview: options?.preview ?? null,
        risk: decision.risk,
        sideEffect: decision.sideEffect,
        planner: decision.planner,
        confidence: decision.confidence,
        confirmationReason: decision.confirmationReason,
      },
      decision,
    };
  }

  private buildToolContext(sessionId: string): ToolContext {
    return {
      prisma: this.prisma,
      memory: this.memoryStore,
      simulation: this.simulation,
      tz: this.tz,
      sessionId,
      calendar: this.calendar,
      web: this.web,
      weather: this.weather,
      gmail: this.gmail,
      goals: this.goalStore,
      conflicts: this.conflictStore,
      dependencies: this.dependencyStore,
      resources: this.resourceStore,
      analytics: this.analyticsStore,
      scheduling: this.schedulingStore,
      help: this.helpStore,
      search: this.searchStore,
      knowledge: this.knowledgeStore,
      timeInsights: this.timeInsightsStore,
      delegation: this.delegationStore,
      reminders: this.reminderStore,
      habits: this.habitStore,
      contacts: this.contactStore,
      finance: this.financeStore,
    };
  }

  private async persistMissionPlanIfNeeded(
    sessionId: string,
    call: ToolOnly,
    result: string,
  ) {
    if (this.simulation || call.name !== 'mission.plan') return;
    await this.missionStore.recordPlan(
      sessionId,
      {
        objective: call.args.objective,
        horizon: call.args.horizon,
      },
      result,
    );
  }

  async status(sessionId?: string) {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    const profile = await this.getHumanProfile(resolvedSessionId);
    const pendingAction = await this.pending.peekLatest(resolvedSessionId);

    const [
      googleToken,
      openTodos,
      openShopping,
      notesTotal,
      recentLogs,
      worldModel,
      missions,
      actionAudit,
      workflowMemory,
      upcomingReminders,
      habits,
    ] = await Promise.all([
      this.prisma.googleOAuthToken.findUnique({
        where: { sessionId: resolvedSessionId },
        select: { scope: true, updatedAt: true },
      }),
      this.prisma.todo.count({ where: { done: false } }),
      this.prisma.shoppingItem.count({ where: { bought: false } }),
      this.prisma.note.count(),
      this.prisma.jarvisLog.findMany({
        where: { sessionId: resolvedSessionId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          createdAt: true,
          userText: true,
          result: true,
          toolName: true,
        },
      }),
      this.memoryStore.getSnapshot(resolvedSessionId),
      this.missionStore.list(resolvedSessionId, { status: 'active', limit: 5 }),
      this.auditStore.listRecent(resolvedSessionId, { limit: 8 }),
      this.workflowStore.list(resolvedSessionId, { limit: 5 }),
      this.reminderStore.upcoming(resolvedSessionId, 24 * 60 * 60 * 1000),
      this.habitStore.list(resolvedSessionId),
    ]);

    const googleStatus = buildGoogleConnectionStatus(googleToken?.scope);
    const now = DateTime.now().setZone(this.tz);
    const todayRange = resolveRange("aujourd'hui", this.tz);

    let unreadEmails: Awaited<
      ReturnType<GmailProvider['listMessages']>
    > | null = null;
    try {
      unreadEmails = await this.gmail.listMessages(resolvedSessionId, {
        q: 'is:unread',
        maxResults: 5,
      });
    } catch {
      unreadEmails = null;
    }

    let todayEvents: Awaited<
      ReturnType<CalendarProvider['listEventsInterval']>
    > | null = null;
    try {
      todayEvents = await this.calendar.listEventsInterval(
        resolvedSessionId,
        todayRange.startIso,
        todayRange.endIso,
        this.tz,
        12,
      );
    } catch {
      todayEvents = null;
    }

    const sortedEvents = [...(todayEvents ?? [])].sort(
      (a, b) => a.when.getTime() - b.when.getTime(),
    );
    const nextEvent =
      sortedEvents.find((event) => {
        const end = DateTime.fromJSDate(event.end ?? event.when).setZone(
          this.tz,
        );
        return end >= now;
      }) ?? null;

    const recentActivity = recentLogs
      .slice()
      .reverse()
      .map((row) => ({
        at: row.createdAt.toISOString(),
        userText: row.userText,
        assistantText: this.summarizeActivityResult(row.result),
        toolName: row.toolName ?? null,
      }));

    const memoryTurns = (this.recentMemory.get(resolvedSessionId) ?? []).map(
      (turn) => ({
        at: new Date(turn.createdAt).toISOString(),
        kind: turn.kind,
        userText: turn.userText,
        assistantText: turn.assistantText,
        toolName: turn.toolName ?? null,
      }),
    );

    const pendingPreview = pendingAction
      ? await previewTool(
          this.buildToolContext(resolvedSessionId),
          pendingAction.call,
        )
      : null;
    const pendingActionView = pendingAction
      ? this.buildPendingActionView(profile, pendingAction, {
          preview: pendingPreview,
        }).pendingAction
      : null;
    const latestCompletedAction = actionAudit.find(
      (event) => event.status === 'completed',
    );
    const workflowSuggestions = latestCompletedAction
      ? await this.workflowStore.suggestNextPrompts(
          resolvedSessionId,
          latestCompletedAction.toolName,
          { limit: 3 },
        )
      : [];
    const featuredWorkflowSuggestion =
      workflowSuggestions[0] ?? workflowMemory[0]?.followUpPrompt ?? null;
    const activeMissionFocus = missions.length
      ? {
          objective: missions[0].objective,
          summary: missions[0].summary,
          nextStep: missions[0].nextStep,
          updatedAt: missions[0].updatedAt,
        }
      : null;
    const topUnreadEmail = unreadEmails?.length
      ? pickFocusUnreadEmail(unreadEmails)
      : null;
    const quickActions = this.buildQuickActions({
      sessionId: resolvedSessionId,
      pendingAction,
      googleConnected: googleStatus.connected,
      gmailConnected: googleStatus.gmailConnected,
      openTodos,
      openShopping,
      unreadEmails: unreadEmails?.length ?? null,
      eventsToday: todayEvents?.length ?? null,
      nextEventTitle: nextEvent?.title ?? null,
      activeMissions: missions.length,
      actionAuditCount: actionAudit.length,
      workflowSuggestion: featuredWorkflowSuggestion,
    });
    const proactiveSuggestions = this.buildProactiveSuggestions({
      sessionId: resolvedSessionId,
      pendingAction: pendingActionView,
      googleConnected: googleStatus.connected,
      unreadEmails: unreadEmails?.length ?? null,
      nextEvent: nextEvent
        ? {
            title: nextEvent.title,
            when: nextEvent.when,
          }
        : null,
      activeMission: activeMissionFocus,
      openTodos,
      workflowSuggestion: featuredWorkflowSuggestion,
    });

    return {
      sessionId: resolvedSessionId,
      now: now.toISO({ suppressMilliseconds: true }),
      timezone: this.tz,
      simulation: this.simulation,
      providers: {
        llm: this.llmProviderName(),
        web: this.web.name,
        weather: this.weather.name,
      },
      profile,
      pendingAction: pendingActionView,
      integrations: {
        googleConnected: googleStatus.connected,
        calendarConnected: googleStatus.calendarConnected,
        gmailConnected: googleStatus.gmailConnected,
        scopes: googleStatus.scopes,
        lastGoogleSyncAt: googleToken?.updatedAt?.toISOString() ?? null,
      },
      metrics: {
        openTodos,
        openShopping,
        notesTotal,
        unreadEmails: unreadEmails?.length ?? null,
        eventsToday: todayEvents?.length ?? null,
        upcomingReminders: upcomingReminders.length,
        habitsTotal: habits.length,
        habitsLoggedToday: habits.filter((h) => h.loggedToday).length,
      },
      focus: {
        nextEvent: nextEvent
          ? {
              title: nextEvent.title,
              when: nextEvent.when.toISOString(),
              end: nextEvent.end?.toISOString() ?? null,
            }
          : null,
        activeMission: activeMissionFocus,
        topUnreadEmail: topUnreadEmail
          ? {
              subject: topUnreadEmail.subject,
              from: topUnreadEmail.from,
              date: topUnreadEmail.date.toISOString(),
            }
          : null,
      },
      worldModel,
      missions,
      actionAudit,
      workflowMemory,
      workflowSuggestions,
      upcomingReminders,
      habits,
      quickActions,
      proactiveSuggestions,
      recentActivity,
      memoryTurns,
    };
  }

  private parseYesNo(text: string): 'yes' | 'no' | null {
    // normalise : minuscules + retire accents + espaces clean
    const t = text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ');

    // 1) NO d'abord (gère les négations)
    if (
      /(^|\b)(non|no|annule|cancel|stop|laisse tomber|ne fais pas|pas maintenant)(\b|$)/.test(
        t,
      ) ||
      /ne .*confirme pas/.test(t) ||
      /je .*confirme pas/.test(t) ||
      /je .*valide pas/.test(t)
    ) {
      return 'no';
    }

    // 2) YES (plus naturel)
    if (
      /(^|\b)(oui|ok|okay|daccord|vas y|go|yes|yep|execute|lance)(\b|$)/.test(
        t,
      ) ||
      /(^|\b)(confirme|confirm|valide|approve|approuve)(\b|$)/.test(t) ||
      /\bje (confirme|valide|suis daccord|veux|peux y aller)\b/.test(t)
    ) {
      return 'yes';
    }

    return null;
  }

  private parseRefCorrection(text: string) {
    const normalized = normalizeIntentText(text);
    const hasCue =
      normalized.includes('#') ||
      /\b(numero|num|n)\s*\d{1,3}\b/.test(normalized) ||
      extractOrdinalRefFromText(normalized) !== null;
    if (!hasCue) return null;

    const ordinal = extractOrdinalRefFromText(normalized);
    if (ordinal !== null) return ordinal;

    const hashMatch = normalized.match(/#\s*(\d{1,3})\b/);
    if (hashMatch) return Number(hashMatch[1]);

    const numMatch = normalized.match(/\b(?:numero|num|n)\s*(\d{1,3})\b/);
    if (numMatch) return Number(numMatch[1]);

    const refs = extractRefsFromText(normalized);
    return refs[0] ?? null;
  }

  private maybeCorrectPendingCall(
    userText: string,
    call: Extract<ToolCall, { type: 'tool' }>,
  ): Extract<ToolCall, { type: 'tool' }> | null {
    if (call.name !== 'calendar.update' && call.name !== 'calendar.delete') {
      return null;
    }

    const ref = this.parseRefCorrection(userText);
    if (!ref || !Number.isInteger(ref) || ref < 1 || ref > 200) return null;
    if (call.args.ref === ref) return null;

    return {
      ...call,
      args: { ...call.args, ref },
    } as Extract<ToolCall, { type: 'tool' }>;
  }

  private isFillerFinal(text: string) {
    return /(veuillez patienter|je vais|j(?:e|’)\s*vais\s)/i.test(text);
  }

  private seemsActionable(userText: string) {
    const t = normalizeIntentText(userText);
    return /\b(ajoute|ajouter|liste|lister|supprime|supprimer|efface|retire|enleve|marque|mettre|met|mets|planifie|planifier|cree|creer|modifie|modifier|annule|annuler|cherche|recherche|ouvre|ouvrir|consulte|gmail|mail|email|courriel|archive|roadmap|strategie|stratégie|objectif|mission|missions)\b/.test(
      t,
    );
  }

  private tryDirectAction(
    userText: string,
    st: ConversationState | null,
    sessionId: string,
  ): ActionDecision | null {
    const call = this.tryDirectToolCall(userText, st, sessionId);
    if (!call) return null;
    return {
      action: call,
      planner: 'direct',
      confidence: 'high',
    };
  }

  private choosePrecomputedAction(
    userText: string,
    st: ConversationState | null,
    sessionId: string,
  ): ActionDecision | null {
    const calendarDecision = planCalendarWrite(userText, this.tz);
    if (calendarDecision) return calendarDecision;
    return this.tryDirectAction(userText, st, sessionId);
  }

  private tryDirectToolCall(
    userText: string,
    st: ConversationState | null,
    sessionId: string,
  ): Extract<ToolCall, { type: 'tool' }> | null {
    const text = normalizeIntentText(userText);
    const refs = extractRefsFromText(text);
    const hashRefMatch = text.match(/#\s*(\d{1,3})\b/);
    const numRefMatch = text.match(/\b(?:numero|num|n)\s*(\d{1,3})\b/);

    const listWords = ['liste', 'lister', 'montre', 'affiche', 'voir'];
    const allWords = ['tout', 'tous', 'toutes', 'all', 'entier', 'complet'];
    const deleteWords = [
      'supprime',
      'supprimer',
      'efface',
      'effacer',
      'retire',
      'retirer',
      'enleve',
      'enlever',
    ];
    const doneWords = [
      'termine',
      'termines',
      'terminer',
      'fait',
      'fini',
      'clos',
    ];
    const boughtWords = ['achete', 'achetes', 'acheter', 'pris', 'prendre'];
    const unboughtWords = ['non achete', 'pas achete'];
    const monthWords = [
      'janvier',
      'fevrier',
      'mars',
      'avril',
      'mai',
      'juin',
      'juillet',
      'aout',
      'septembre',
      'octobre',
      'novembre',
      'decembre',
    ];

    const wantsList = includesAny(text, listWords);
    const wantsAll = includesAny(text, allWords);
    const wantsDelete = includesAny(text, deleteWords);
    const wantsDone = includesAny(text, doneWords);
    const wantsBought = includesAny(text, boughtWords);
    const wantsModify =
      includesAny(text, [
        'modifie',
        'modifier',
        'change',
        'changer',
        'mettre',
        'deplace',
        'deplacer',
        'decale',
        'decaler',
        'avance',
        'avancer',
        'recule',
        'reculer',
        'reporte',
        'reporter',
        'reprogramme',
        'reprogrammer',
      ]) || hasMetVerb(text);
    if (
      includesAny(text, [
        'undo',
        'annule la derniere action',
        'annule derniere action',
        'retour en arriere',
      ])
    ) {
      return { type: 'tool', name: 'undo.last_action', args: {} };
    }

    if (
      includesAny(text, [
        'briefing',
        'resume du jour',
        'resume quotidien',
        'priorites du jour',
        'priorites aujourd hui',
        'situation du jour',
        'centre de commande',
        'command center',
        'mission control',
        'tableau de bord',
        'dashboard',
        'que dois je traiter aujourd hui',
      ]) &&
      !includesAny(text, ['calendar', 'calendrier'])
    ) {
      return { type: 'tool', name: 'daily.briefing', args: {} };
    }

    const wantsActionHistory =
      includesAny(text, [
        'historique des actions',
        'historique d actions',
        'journal des actions',
        'journal d audit',
        'audit log',
        'audit trail',
        'actions recentes',
        'actions récentes',
        'qu as tu fait',
        'qu as-tu fait',
        'qu est ce que tu as fait',
        'que s est il passe',
        'que s’est il passe',
      ]) ||
      (includesAny(text, ['action', 'actions']) &&
        includesAny(text, [
          'historique',
          'journal',
          'attente',
          'recent',
          'récent',
        ]));
    if (wantsActionHistory) {
      const status: AuditStatusFilter = includesAny(text, [
        'en attente',
        'pending',
        'pas encore executees',
        'pas encore exécutées',
      ])
        ? 'pending'
        : 'all';
      return {
        type: 'tool',
        name: 'action.history',
        args: { status, limit: status === 'pending' ? 5 : 8 },
      };
    }

    const wantsWorkflowList =
      includesAny(text, [
        'workflow',
        'workflows',
        'routine',
        'routines',
        'habitudes',
        'ce que tu as appris',
        'workflows appris',
      ]) &&
      (wantsList ||
        includesAny(text, [
          'appris',
          'apprises',
          'habitudes',
          'routines',
          'workflow',
          'workflows',
        ]));
    if (wantsWorkflowList) {
      return {
        type: 'tool',
        name: 'workflow.list',
        args: { limit: 5 },
      };
    }

    const wantsMemoryList =
      includesAny(text, [
        'memoire',
        'ta memoire',
        'monde personnel',
        'world model',
        'qu est ce que tu sais',
        'qu est ce que tu sais sur moi',
        'qu as tu retenu',
        'qu as tu retenu sur moi',
      ]) &&
      (wantsList ||
        includesAny(text, [
          'montre',
          'affiche',
          'liste',
          'resume',
          'résume',
          'donne',
        ]));
    if (wantsMemoryList) {
      return {
        type: 'tool',
        name: 'memory.list',
        args: { layer: 'all', limit: 20 },
      };
    }

    const wantsMemoryForget =
      includesAny(text, ['memoire', 'souvenir', 'souvenirs']) &&
      includesAny(text, [
        'oublie',
        'oublier',
        'efface',
        'effacer',
        'supprime',
        'supprimer',
        'retire',
        'retirer',
      ]);
    if (wantsMemoryForget) {
      const query = userText
        .trim()
        .replace(/^jarvis[,:\s-]*/i, '')
        .replace(
          /^(?:oublie|oublier|efface|effacer|supprime|supprimer|retire|retirer)\s+(?:de\s+ta\s+memoire\s+)?/i,
          '',
        )
        .trim();

      return {
        type: 'tool',
        name: 'memory.forget',
        args: { query: query || userText.trim() },
      };
    }

    const wantsMissionList =
      (includesAny(text, [
        'mission',
        'missions',
        'mission active',
        'missions actives',
        'mission en cours',
        'missions en cours',
      ]) &&
        (wantsList ||
          /quelles?\s+sont\s+mes\s+missions/.test(text) ||
          /mes\s+missions\s+actives/.test(text))) ||
      includesAny(text, ['liste mes missions', 'montre mes missions']);
    if (
      wantsMissionList &&
      !includesAny(text, ['mission control', 'centre de commande'])
    ) {
      return {
        type: 'tool',
        name: 'mission.list',
        args: { status: 'active', limit: 5 },
      };
    }

    const wantsMissionClose =
      includesAny(text, [
        'cloture la mission',
        'clôture la mission',
        'cloturer la mission',
        'clôturer la mission',
        'ferme la mission',
        'termine la mission',
        'mission terminee',
        'mission terminée',
        'close la mission',
      ]) ||
      (includesAny(text, ['mission', 'missions']) &&
        includesAny(text, [
          'cloture',
          'clôture',
          'cloturer',
          'clôturer',
          'ferme',
          'terminer',
          'termine',
          'acheve',
          'achève',
          'close',
        ]) &&
        !includesAny(text, ['mission control', 'centre de commande']));
    if (wantsMissionClose) {
      const ref =
        extractOrdinalRefFromText(text) ??
        (hashRefMatch ? Number(hashRefMatch[1]) : null) ??
        (numRefMatch ? Number(numRefMatch[1]) : null);
      const query = extractMissionCloseTargetFromText(userText);
      return {
        type: 'tool',
        name: 'mission.close',
        args:
          typeof ref === 'number'
            ? { ref }
            : query
              ? { query }
              : { query: userText.trim() },
      };
    }

    const wantsMissionPlan =
      includesAny(text, [
        'plan de mission',
        'mission plan',
        'plan d action',
        'roadmap',
        'strategie',
        'stratégie',
      ]) ||
      /comment\s+(?:tu|on)\s+(?:t\s*y|s\s*y)\s+prend/.test(text) ||
      /comment\s+(?:organiser|structurer)\b/.test(text);
    if (
      wantsMissionPlan &&
      !includesAny(text, [
        'planifie',
        'planifier',
        'calendrier',
        'agenda',
        'rendez vous',
        'rendez-vous',
        'rdv',
      ])
    ) {
      return {
        type: 'tool',
        name: 'mission.plan',
        args: {
          objective: extractMissionObjectiveFromText(userText),
        },
      };
    }

    const isTodo = includesAny(text, ['todo', 'todos', 'tache', 'taches']);
    const isCalendar = includesAny(text, [
      'calendrier',
      'agenda',
      'rendez vous',
      'rendez-vous',
      'rdv',
      'reunion',
      'evenement',
    ]);
    const isShopping = includesAny(text, [
      'course',
      'courses',
      'shopping',
      'achat',
      'achats',
      'liste de courses',
      'liste des courses',
    ]);
    const isNote = includesAny(text, ['note', 'notes']);
    const isGmail = includesAny(text, [
      'gmail',
      'email',
      'e mail',
      'mail',
      'courriel',
      'boite mail',
      'boite de reception',
      'inbox',
    ]);
    const urlMatch = userText.match(/\bhttps?:\/\/[^\s<>()]+/i);
    const ordinalRef = extractOrdinalRefFromText(text);
    const explicitCalendarRef =
      ordinalRef ??
      (hashRefMatch ? Number(hashRefMatch[1]) : null) ??
      (numRefMatch ? Number(numRefMatch[1]) : null);

    const asksWeather =
      (includesAny(text, [
        'meteo',
        'weather',
        'temperature',
        'temperatures',
        'pluie',
        'vent',
        'humidite',
        'neige',
        'prevision',
        'previsions',
      ]) ||
        /\bquel temps\b/.test(text)) &&
      !isTodo &&
      !isCalendar &&
      !isShopping &&
      !isNote &&
      !isGmail;
    if (asksWeather) {
      const day = includesAny(text, ['demain', 'tomorrow']) ? 'tomorrow' : 'today';
      const location = extractWeatherLocation(text);
      return {
        type: 'tool',
        name: 'weather.forecast',
        args: {
          ...(location ? { location } : {}),
          day,
        },
      };
    }

    const asksWebSearch =
      includesAny(text, [
        'sur internet',
        'sur le web',
        'cherche sur',
        'recherche sur',
        'google',
        'actualite',
        'actualites',
        'news',
        'wikipedia',
      ]) &&
      !isTodo &&
      !isCalendar &&
      !isShopping &&
      !isNote;
    if (asksWebSearch) {
      return {
        type: 'tool',
        name: 'web.search',
        args: { query: userText.trim(), limit: 5 },
      };
    }

    if (urlMatch) {
      const onlyUrl = userText.trim() === urlMatch[0];
      const wantsOpenUrl =
        onlyUrl ||
        includesAny(text, [
          'ouvre',
          'ouvrir',
          'lis',
          'lire',
          'consulte',
          'resume',
          'resumer',
          'analyse',
          'va sur',
        ]);
      if (wantsOpenUrl) {
        return {
          type: 'tool',
          name: 'web.open',
          args: { url: urlMatch[0] },
        };
      }
    }

    const priorNorm = st
      ? normalizeIntentText(`${st.originalUserText} ${st.askedText}`)
      : '';
    const priorGmail = includesAny(priorNorm, [
      'gmail',
      'email',
      'mail',
      'courriel',
      'boite de reception',
      'inbox',
    ]);
    const gmailContext =
      isGmail ||
      includesAny(text, [
        'onglet promotion',
        'onglet social',
        'onglet mise a jour',
        'onglet forum',
        'onglet primary',
        'onglet principal',
        'mails promotion',
        'emails promotion',
        'mails social',
        'emails social',
        'mails mise a jour',
        'emails mise a jour',
        'mes primary',
        'mes promotions',
        'mes promos',
        'mes social',
        'mes updates',
        'mes forums',
        'dans primary',
        'dans promotions',
        'dans social',
        'dans updates',
        'dans forums',
      ]) ||
      (includesAny(text, ['non lu', 'non lus', 'unread']) &&
        includesAny(text, ['mail', 'email', 'courriel'])) ||
      (priorGmail &&
        includesAny(text, [
          'non lu',
          'non lus',
          'unread',
          'ouvre',
          'ouvrir',
          'lis',
          'lire',
          'resume',
          'resumer',
          'marque',
          'mettre',
          'archive',
          'supprime',
          '#',
          'premier',
          'deuxieme',
          'troisieme',
        ]));

    if (gmailContext) {
      const gmailRef = explicitCalendarRef;
      const wantsUnread = includesAny(text, [
        'non lu',
        'non lus',
        'pas lu',
        'pas lus',
        'unread',
        'non ouvert',
        'non ouverts',
      ]);
      const asksCount = includesAny(text, ['combien', 'nombre']);
      const wantsOpen = includesAny(text, [
        'ouvre',
        'ouvrir',
        'lis',
        'lire',
        'consulte',
        'affiche',
        'montre',
        'detail',
      ]);
      const wantsSummary = includesAny(text, [
        'resume',
        'resumer',
        'synthese',
        'summarise',
        'summariser',
      ]);
      const wantsSearchMail = includesAny(text, [
        'cherche',
        'recherche',
        'trouve',
        'from:',
        'subject:',
        'label:',
      ]);
      const wantsMarkUnread =
        (includesAny(text, ['marque', 'mettre', 'remet']) ||
          hasMetVerb(text)) &&
        wantsUnread;
      const wantsMarkRead =
        (includesAny(text, ['marque', 'mettre']) || hasMetVerb(text)) &&
        includesAny(text, ['lu', 'lue', 'lus']) &&
        !wantsMarkUnread;
      const wantsUnarchive = includesAny(text, [
        'desarchive',
        'desarchiver',
        'restaure',
        'restaurer',
        'unarchive',
      ]);
      const wantsArchive =
        includesAny(text, ['archive', 'archiver']) && !wantsUnarchive;
      const wantsPermanentDelete =
        wantsDelete &&
        includesAny(text, [
          'definitif',
          'definitivement',
          'permanent',
          'pour toujours',
        ]);
      const wantsSend = includesAny(text, [
        'envoie',
        'envoyer',
        'envoi',
        'send',
      ]);

      const gmailCategory:
        | 'primary'
        | 'promotions'
        | 'social'
        | 'updates'
        | 'forums'
        | undefined = includesAny(text, [
        'promotion',
        'promotions',
        'promo',
        'promos',
        'spam commercial',
      ])
        ? 'promotions'
        : includesAny(text, [
              'social',
              'reseaux sociaux',
              'facebook',
              'twitter',
              'linkedin',
              'instagram',
            ])
          ? 'social'
          : includesAny(text, [
                'mise a jour',
                'mises a jour',
                'update',
                'updates',
                'notification',
                'notifications',
                'alerte',
                'alertes',
              ])
            ? 'updates'
            : includesAny(text, [
                  'forum',
                  'forums',
                  'discussion',
                  'discussions',
                ])
              ? 'forums'
              : includesAny(text, [
                    'principal',
                    'principale',
                    'primaire',
                    'primary',
                    'important',
                    'importants',
                    'boite principale',
                  ])
                ? 'primary'
                : undefined;
      const mentionedCategories = [
        includesAny(text, [
          'principal',
          'principale',
          'primaire',
          'primary',
          'boite principale',
        ])
          ? 'primary'
          : null,
        includesAny(text, ['promotion', 'promotions', 'promo', 'promos'])
          ? 'promotions'
          : null,
        includesAny(text, ['social', 'reseaux sociaux']) ? 'social' : null,
        includesAny(text, ['mise a jour', 'mises a jour', 'update', 'updates'])
          ? 'updates'
          : null,
        includesAny(text, ['forum', 'forums']) ? 'forums' : null,
      ].filter((value): value is NonNullable<typeof gmailCategory> => !!value);
      const wantsCategoryBreakdown =
        includesAny(text, [
          'difference',
          'differences',
          'distinction',
          'distingue',
          'distinguer',
          'repartition',
          'repartis',
          'repartir',
          'classe',
          'classer',
          'categorie',
          'categories',
          'onglet',
          'onglets',
          'tabs',
        ]) &&
        (mentionedCategories.length >= 2 ||
          includesAny(text, ['gmail', 'mail', 'email', 'courriel']));
      const requestedCategory = wantsCategoryBreakdown
        ? undefined
        : gmailCategory;

      if (wantsSend) {
        const emails = Array.from(
          userText.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi),
        )
          .map((m) => (m[0] || '').trim())
          .filter((email) => email.length > 0);
        const to = emails[0] || '';
        const ccMatch = userText.match(
          /\bcc\s*[:=-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
        );
        const bccMatch = userText.match(
          /\bbcc\s*[:=-]\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
        );
        const cc =
          ccMatch?.[1]?.trim() || (emails.length > 1 ? emails[1] : undefined);
        const bcc = bccMatch?.[1]?.trim();

        const subjectMatch = userText.match(
          /\b(?:objet|sujet)\s*[:=-]\s*([^,\n]+)/i,
        );
        const textMatch = userText.match(
          /\b(?:texte|message|contenu)\s*[:=-]\s*([\s\S]+)/i,
        );
        const quotedBody = userText.match(/["“”]([^"“”]{3,})["“”]/);
        const lower = userText.toLowerCase();
        const lowerTo = to.toLowerCase();
        const toPos = to ? lower.indexOf(lowerTo) : -1;
        const afterToRaw =
          toPos >= 0 ? userText.slice(toPos + to.length).trim() : '';
        const afterToBody = afterToRaw
          .replace(/^(?:,|;|-|:)\s*/, '')
          .replace(/^(?:texte|message|contenu)\s*[:=-]?\s*/i, '')
          .replace(/\b(?:objet|sujet)\s*[:=-]\s*[^,\n]+/i, '')
          .replace(/\bcc\s*[:=-]\s*[^\s,;]+/gi, '')
          .replace(/\bbcc\s*[:=-]\s*[^\s,;]+/gi, '')
          .trim();

        const subject = subjectMatch?.[1]?.trim() || 'Message Jarvis';
        const body =
          textMatch?.[1]?.trim() || quotedBody?.[1]?.trim() || afterToBody;

        if (to && body) {
          return {
            type: 'tool',
            name: 'gmail.send',
            args: {
              to,
              subject,
              text: body,
              ...(cc ? { cc } : {}),
              ...(bcc ? { bcc } : {}),
            },
          };
        }
      }

      if (wantsSummary) {
        if (gmailRef) {
          return { type: 'tool', name: 'gmail.summary', args: { ref: gmailRef } };
        }

        const wantsMailboxSummary =
          !!requestedCategory ||
          wantsCategoryBreakdown ||
          wantsUnread ||
          includesAny(text, [
            'boite de reception',
            'inbox',
            'mes mails',
            'mes emails',
          ]);

        const cleanedQuery = userText
          .replace(
            /\b(résume|resume|resumer|résumer|synthese|synthèse|summarise|summariser)\b/gi,
            '',
          )
          .replace(/\b(mails?|emails?|courriels?)\b/gi, '')
          .replace(/\b(non\s*lus?|unread)\b/gi, '')
          .replace(/\b(boite|boîte)\s+principale\b/gi, '')
          .replace(/\b(boite|boîte)\s+(?:de\s+)?(reception|réception)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (wantsMailboxSummary) {
          const wantsAllEmails = includesAny(text, [
            'tous mes mails',
            'tous mes emails',
            'toutes mes mails',
            'toutes mes emails',
            'derniers mails',
            'dernieres mails',
            'derniers emails',
            'dernieres emails',
            'emails recents',
            'mails recents',
          ]);
          const unreadOnly = wantsUnread ? true : wantsAllEmails ? false : undefined;

          return {
            type: 'tool',
            name: 'gmail.summary',
            args: {
              ...(unreadOnly === undefined ? {} : { unreadOnly }),
              ...(requestedCategory ? { category: requestedCategory } : {}),
              ...(wantsSearchMail
                ? { query: cleanedQuery || userText.trim() }
                : {}),
              limit: 10,
            },
          };
        }

        return {
          type: 'tool',
          name: 'gmail.summary',
          args: { query: cleanedQuery || userText.trim() },
        };
      }

      if (wantsMarkUnread) {
        return gmailRef
          ? { type: 'tool', name: 'gmail.mark_unread', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.mark_unread',
              args: { query: userText.trim() },
            };
      }

      if (wantsMarkRead) {
        const bulkCue =
          includesAny(text, ['ces', 'ceux', 'tous', 'toutes']) &&
          includesAny(text, ['mail', 'email', 'courriel']);
        const bulkRefs = refs;

        if (!gmailRef && (bulkCue || bulkRefs.length >= 2)) {
          return {
            type: 'tool',
            name: 'gmail.bulk_mark_read',
            args: {
              ...(bulkRefs.length ? { refs: bulkRefs } : {}),
              unreadOnly: true,
            },
          };
        }

        return gmailRef
          ? { type: 'tool', name: 'gmail.mark_read', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.mark_read',
              args: { query: userText.trim() },
            };
      }

      if (wantsUnarchive) {
        return gmailRef
          ? { type: 'tool', name: 'gmail.unarchive', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.unarchive',
              args: { query: userText.trim() },
            };
      }

      if (wantsArchive) {
        return gmailRef
          ? { type: 'tool', name: 'gmail.archive', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.archive',
              args: { query: userText.trim() },
            };
      }

      if (wantsDelete) {
        if (wantsPermanentDelete) {
          return gmailRef
            ? { type: 'tool', name: 'gmail.delete', args: { ref: gmailRef } }
            : {
                type: 'tool',
                name: 'gmail.delete',
                args: { query: userText.trim() },
              };
        }
        return gmailRef
          ? { type: 'tool', name: 'gmail.trash', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.trash',
              args: { query: userText.trim() },
            };
      }

      if (
        requestedCategory ||
        wantsCategoryBreakdown ||
        wantsUnread ||
        asksCount ||
        wantsList ||
        includesAny(text, [
          'boite de reception',
          'inbox',
          'mes mails',
          'mes emails',
        ])
      ) {
        return {
          type: 'tool',
          name: 'gmail.list',
          args: {
            unreadOnly: wantsUnread,
            ...(requestedCategory ? { category: requestedCategory } : {}),
            ...(wantsSearchMail ? { query: userText.trim() } : {}),
            limit: 20,
          },
        };
      }

      if (wantsOpen || gmailRef !== null) {
        return gmailRef
          ? { type: 'tool', name: 'gmail.get', args: { ref: gmailRef } }
          : {
              type: 'tool',
              name: 'gmail.get',
              args: { query: userText.trim() },
            };
      }
    }

    if (isTodo) {
      if (wantsList) {
        return {
          type: 'tool',
          name: 'todo.list',
          args: wantsAll ? { show: 'all' } : { show: 'open' },
        };
      }
      if (wantsDelete && wantsAll && wantsDone) {
        return { type: 'tool', name: 'todo.clear_done', args: {} };
      }
      if (wantsDelete && wantsAll) {
        return { type: 'tool', name: 'todo.clear_all', args: {} };
      }
      if (wantsDone && wantsAll) {
        return { type: 'tool', name: 'todo.done_all', args: {} };
      }
      if (refs.length && wantsDelete) {
        return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
      }
      if (refs.length && wantsDone) {
        return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
      }
    }

    if (isShopping) {
      if (wantsList) {
        return {
          type: 'tool',
          name: 'shopping.list',
          args: wantsAll ? { show: 'all' } : { show: 'open' },
        };
      }
      if (wantsDelete && wantsAll && wantsBought) {
        return { type: 'tool', name: 'shopping.clear_bought', args: {} };
      }
      if (wantsDelete && wantsAll) {
        return { type: 'tool', name: 'shopping.clear_all', args: {} };
      }
      if (wantsBought && wantsAll) {
        return { type: 'tool', name: 'shopping.bought_all', args: {} };
      }
      if (refs.length && wantsDelete) {
        return { type: 'tool', name: 'shopping.bulk_delete', args: { refs } };
      }
      if (refs.length && wantsBought) {
        return { type: 'tool', name: 'shopping.bulk_bought', args: { refs } };
      }
      if (refs.length && includesAny(text, unboughtWords)) {
        return {
          type: 'tool',
          name: 'shopping.unbought',
          args: { query: `#${refs[0]}` },
        };
      }
    }

    if (isNote && wantsList) {
      return { type: 'tool', name: 'note.list', args: {} };
    }

    // Par défaut sur des refs + action "terminé/supprimer", on privilégie les todos.
    if (!isCalendar && !isTodo && !isShopping && refs.length && wantsDone) {
      return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
    }
    if (!isCalendar && !isTodo && !isShopping && refs.length && wantsDelete) {
      return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
    }

    // Follow-up de clarification: "le 1 et le 2" sans répéter le domaine.
    if (!isCalendar && !isTodo && !isShopping && refs.length && st) {
      const prior = normalizeIntentText(
        `${st.originalUserText} ${st.askedText}`,
      );
      const priorTodo = includesAny(prior, [
        'todo',
        'todos',
        'tache',
        'taches',
      ]);
      const priorShopping = includesAny(prior, [
        'course',
        'courses',
        'shopping',
        'achat',
        'achats',
      ]);
      const priorGmail = includesAny(prior, [
        'gmail',
        'email',
        'mail',
        'courriel',
        'boite de reception',
        'inbox',
      ]);
      if (priorTodo) {
        if (includesAny(prior, deleteWords)) {
          return { type: 'tool', name: 'todo.bulk_delete', args: { refs } };
        }
        if (includesAny(prior, doneWords)) {
          return { type: 'tool', name: 'todo.bulk_done', args: { refs } };
        }
      }
      if (priorShopping) {
        if (includesAny(prior, deleteWords)) {
          return { type: 'tool', name: 'shopping.bulk_delete', args: { refs } };
        }
        if (includesAny(prior, boughtWords)) {
          return { type: 'tool', name: 'shopping.bulk_bought', args: { refs } };
        }
      }
      if (priorGmail) {
        const firstRef = refs[0];
        if (includesAny(prior, ['resume', 'resumer', 'synthese'])) {
          return {
            type: 'tool',
            name: 'gmail.summary',
            args: { ref: firstRef },
          };
        }
        if (
          includesAny(prior, ['non lu', 'non lus', 'pas lu']) &&
          (includesAny(prior, ['marque', 'mettre', 'remet']) ||
            hasMetVerb(prior))
        ) {
          return {
            type: 'tool',
            name: 'gmail.mark_unread',
            args: { ref: firstRef },
          };
        }
        if (
          includesAny(prior, ['lu', 'lue', 'lus']) &&
          (includesAny(prior, ['marque', 'mettre']) || hasMetVerb(prior))
        ) {
          return {
            type: 'tool',
            name: 'gmail.mark_read',
            args: { ref: firstRef },
          };
        }
        if (includesAny(prior, ['supprime', 'supprimer', 'efface', 'retire'])) {
          return { type: 'tool', name: 'gmail.trash', args: { ref: firstRef } };
        }
        return { type: 'tool', name: 'gmail.get', args: { ref: firstRef } };
      }
    }

    return null;
  }

  /**
   * Anti-hallucination: calendar.create/calendar.update.when recalculé serveur
   */
  private normalizeToolCall(
    call: Extract<ToolCall, { type: 'tool' }>,
    effectiveTextForDates: string,
  ) {
    if (call.name === 'calendar.create') {
      const resolved = resolveWhenWindow(effectiveTextForDates, this.tz);
      return {
        ...call,
        args: {
          ...call.args,
          when: resolved.startIso,
          ...(resolved.endIso ? { endWhen: resolved.endIso } : {}),
        },
      } as any;
    }
    if (call.name === 'calendar.update') {
      const nextArgs = { ...call.args };
      if (nextArgs.when) {
        const parsedStart = DateTime.fromISO(nextArgs.when, { zone: this.tz });
        if (parsedStart.isValid) {
          nextArgs.when =
            parsedStart.toISO({ suppressMilliseconds: true }) ?? nextArgs.when;
        } else {
          const whenNorm = normalizeIntentText(nextArgs.when);
          const isDayOnlyTarget =
            /\b(?:le|au|a|du|de)\s+\d{1,2}(?!\s*(?:h|:))\b/.test(whenNorm) &&
            !/\b\d{1,2}[./-]\d{1,2}\b/.test(whenNorm) &&
            !/\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.test(
              whenNorm,
            );

          // Les expressions "le 20" doivent rester textuelles pour être résolues
          // plus tard avec le contexte du rendez-vous ciblé (mois/année).
          if (!isDayOnlyTarget) {
            const resolved = resolveWhenWindow(nextArgs.when, this.tz);
            if (resolved.hasExplicitDate) {
              nextArgs.when = resolved.startIso;
              if (resolved.endIso && !nextArgs.endWhen) {
                nextArgs.endWhen = resolved.endIso;
              }
            }
          }
        }
      }
      if (nextArgs.endWhen) {
        const parsedEnd = DateTime.fromISO(nextArgs.endWhen, {
          zone: this.tz,
        });
        if (parsedEnd.isValid) {
          nextArgs.endWhen =
            parsedEnd.toISO({ suppressMilliseconds: true }) ?? nextArgs.endWhen;
        }
      }
      return { ...call, args: nextArgs } as any;
    }
    return call;
  }

  async chat(userText: string, sessionId?: string) {
    const resolvedSessionId = this.resolveSessionId(sessionId);
    const tz = this.tz;
    const profile = await this.refreshHumanProfile(resolvedSessionId, userText);
    await this.memoryStore.rememberFromUserText(resolvedSessionId, userText);
    let auditContext: AuditExecutionContext | null = null;

    try {
      const googleToken = await this.prisma.googleOAuthToken.findUnique({
        where: { sessionId: resolvedSessionId },
        select: { scope: true },
      });
      const googleStatus = buildGoogleConnectionStatus(googleToken?.scope);

      // CONFIRMATION “HUMAINE” : si une action pending existe, on peut répondre "oui/non"
      const pending = await this.pending.peekLatest(resolvedSessionId);
      if (pending) {
        const correctedPendingCall = this.maybeCorrectPendingCall(
          userText,
          pending.call,
        );
        if (correctedPendingCall) {
          const gateError = gateToolCall(correctedPendingCall, googleStatus);
          if (gateError) {
            const recoverable = this.buildRecoverableErrorResponse(
              resolvedSessionId,
              gateError,
            );
            if (recoverable) {
              const text = `${recoverable.text}\n\nAction en attente: "${pending.call.name}". Une fois connecté, réponds "oui" pour l’exécuter (ou "non" pour annuler).`;
              await this.logSafe({
                sessionId: resolvedSessionId,
                userText,
                modelRaw: '',
                toolName: pending.call.name,
                toolArgs: JSON.stringify(pending.call.args),
                simulation: this.simulation,
                result: `GATED:${gateError.code}`,
              });
              this.rememberTurn(resolvedSessionId, {
                userText,
                assistantText: text,
                kind: 'ask',
              });
              await this.refreshPersistentSessionState(resolvedSessionId);
              return {
                text,
                meta: {
                  ...recoverable.meta,
                  awaiting: 'connect_google',
                  gatedTool: pending.call.name,
                },
              };
            }
          }

          await this.auditStore.markSessionPendingAsSuperseded(
            resolvedSessionId,
          );
          const actionId = await this.pending.create(
            resolvedSessionId,
            correctedPendingCall,
          );
          const correctedPendingView = this.buildPendingActionView(profile, {
            id: actionId,
            call: correctedPendingCall,
          });
          await this.auditStore.recordPending({
            sessionId: resolvedSessionId,
            pendingActionId: actionId,
            call: correctedPendingCall,
            plan: correctedPendingView.decision,
            source: 'chat',
          });

          return {
            text: this.humanizeEnabled
              ? humanizePendingPrompt(
                  profile,
                  correctedPendingCall,
                  tz,
                  correctedPendingView.decision,
                )
              : `Je peux exécuter "${correctedPendingCall.name}". Tu confirmes ?`,
            choices: ['oui', 'non'],
            pending_action: correctedPendingView.pendingAction,
            meta: {
              simulation: this.simulation,
              requiresConfirmation: true,
              sessionId: resolvedSessionId,
              awaiting: 'confirm',
              decision: correctedPendingView.decision,
              planner: correctedPendingView.decision.planner,
              confidence: correctedPendingView.decision.confidence,
              toolName: correctedPendingCall.name,
              toolArgs: correctedPendingCall.args,
            },
          };
        }

        const yn = this.parseYesNo(userText);
        if (yn === 'yes') {
          const gateError = gateToolCall(pending.call, googleStatus);
          if (gateError) {
            const recoverable = this.buildRecoverableErrorResponse(
              resolvedSessionId,
              gateError,
            );
            if (recoverable) {
              const text = `${recoverable.text}\n\nAction en attente: "${pending.call.name}". Une fois connecté, réponds "oui" pour l’exécuter (ou "non" pour annuler).`;
              await this.logSafe({
                sessionId: resolvedSessionId,
                userText,
                modelRaw: '',
                toolName: pending.call.name,
                toolArgs: JSON.stringify(pending.call.args),
                simulation: this.simulation,
                result: `GATED:${gateError.code}`,
              });
              this.rememberTurn(resolvedSessionId, {
                userText,
                assistantText: text,
                kind: 'ask',
              });
              await this.refreshPersistentSessionState(resolvedSessionId);
              return {
                text,
                meta: {
                  ...recoverable.meta,
                  awaiting: 'connect_google',
                  gatedTool: pending.call.name,
                },
              };
            }
          }

          const consumed = await this.pending.consume(
            pending.id,
            resolvedSessionId,
          );
          if (!consumed) {
            return {
              text: this.humanizeEnabled
                ? humanizeNoPending(profile)
                : "Je n'ai plus d'action en attente.",
              meta: {
                simulation: this.simulation,
                sessionId: resolvedSessionId,
              },
            };
          }

          auditContext = {
            sessionId: resolvedSessionId,
            source: 'confirm_text',
            pendingActionId: consumed.id,
          };
          const result = await runTool(
            this.buildToolContext(resolvedSessionId),
            consumed.call,
          );
          const choices = await this.buildAutoFollowUpChoices(
            resolvedSessionId,
            consumed.call.name,
            result,
          );

          await this.logSafe({
            sessionId: resolvedSessionId,
            userText: `[CONFIRM yes] ${userText}`,
            modelRaw: '',
            toolName: consumed.call.name,
            toolArgs: JSON.stringify(consumed.call.args),
            simulation: this.simulation,
            result,
          });
          await this.auditStore.recordCompletion({
            sessionId: resolvedSessionId,
            pendingActionId: consumed.id,
            result,
            source: 'confirm_text',
          });
          auditContext = null;

          const humanText = this.humanizeToolOutput(profile, result, {
            fromConfirmation: true,
          });
          this.rememberToolTurn(
            resolvedSessionId,
            userText,
            consumed.call,
            result,
            { prefix: 'Confirmation executee pour' },
          );
          await this.persistMissionPlanIfNeeded(
            resolvedSessionId,
            consumed.call,
            result,
          );
          await this.refreshPersistentSessionState(resolvedSessionId);

          return {
            text: humanText,
            choices: choices.length ? choices : undefined,
            meta: { simulation: this.simulation, sessionId: resolvedSessionId },
          };
        }

        if (yn === 'no') {
          await this.pending.cancelLatest(resolvedSessionId);
          await this.auditStore.markSessionPendingAsCancelled(
            resolvedSessionId,
          );
          const text = this.humanizeEnabled
            ? humanizeCancellation(profile)
            : 'OK, je n’exécute pas cette action.';
          this.rememberTurn(resolvedSessionId, {
            userText,
            assistantText: text,
            kind: 'confirm',
          });
          await this.refreshPersistentSessionState(resolvedSessionId);
          return {
            text,
            meta: { simulation: this.simulation, sessionId: resolvedSessionId },
          };
        }

        // Si l'utilisateur répond autre chose alors qu'une action est pending
        const gateError = gateToolCall(pending.call, googleStatus);
        if (gateError) {
          const recoverable = this.buildRecoverableErrorResponse(
            resolvedSessionId,
            gateError,
          );
          if (recoverable) {
            const text = `${recoverable.text}\n\nAction en attente: "${pending.call.name}". Réponds "oui" pour l’exécuter après connexion, ou "non" pour annuler.`;
            await this.logSafe({
              sessionId: resolvedSessionId,
              userText,
              modelRaw: '',
              toolName: pending.call.name,
              toolArgs: JSON.stringify(pending.call.args),
              simulation: this.simulation,
              result: `GATED:${gateError.code}`,
            });
            this.rememberTurn(resolvedSessionId, {
              userText,
              assistantText: text,
              kind: 'ask',
            });
            await this.refreshPersistentSessionState(resolvedSessionId);
            return {
              text,
              meta: {
                ...recoverable.meta,
                awaiting: 'connect_google',
                gatedTool: pending.call.name,
              },
            };
          }
        }

        const pendingPreview = await previewTool(
          this.buildToolContext(resolvedSessionId),
          pending.call,
        );
        const pendingDecision = this.buildPendingActionView(profile, pending, {
          preview: pendingPreview,
        });
        return {
          text: this.humanizeEnabled
            ? humanizePendingReminder(
                profile,
                pending.call,
                tz,
                pendingDecision.decision,
                { preview: pendingPreview },
              )
            : 'Je peux exécuter l’action en attente. Tu confirmes ?',
          choices: ['oui', 'non'],
          meta: {
            simulation: this.simulation,
            awaiting: 'confirm',
            sessionId: resolvedSessionId,
          },
        };
      }

      // ---- Flow normal (IA)
      const st = this.getState(resolvedSessionId);

      const followupHint = st
        ? `CONTEXTE:
- Demande initiale: "${st.originalUserText}"
- Tu as demandé: "${st.askedText}" (awaiting="${st.awaiting}")
- Réponse actuelle: "${userText}"
Si c'est actionnable: renvoie un JSON tool/ask.`
        : '';

      const precomputedDecision = this.choosePrecomputedAction(
        userText,
        st,
        resolvedSessionId,
      );
      let raw = precomputedDecision
        ? `[${precomputedDecision.planner.toUpperCase()}_ACTION]`
        : '';
      let cleaned = '';
      let decision: ActionDecision | null = precomputedDecision;
      let action: JarvisAction | null = precomputedDecision?.action ?? null;

      if (!action) {
        const first = await this.askModel(
          resolvedSessionId,
          userText,
          followupHint,
        );
        raw = first.raw;
        cleaned = first.cleaned;
        action = parseJarvisAction(cleaned);
        if (action) {
          decision = {
            action,
            planner: 'llm',
            confidence: 'unknown',
          };
        }
      }

      if (!action) {
        if (this.seemsActionable(userText)) {
          const retry = await this.askModel(
            resolvedSessionId,
            userText,
            `${followupHint}\nSi la demande est actionnable, reponds UNIQUEMENT avec un JSON tool/ask valide. Aucun markdown.`,
          );
          raw = retry.raw;
          cleaned = retry.cleaned;
          action = parseJarvisAction(cleaned);
          if (action) {
            decision = {
              action,
              planner: 'llm',
              confidence: 'unknown',
            };
          }
        }
      }

      if (!action) {
        const natural = this.cleanAssistantText(raw);
        if (natural && !this.seemsActionable(userText)) {
          const text = this.humanizeAskOrFinalText(profile, natural, 'final');
          await this.logSafe({
            sessionId: resolvedSessionId,
            userText,
            modelRaw: raw,
            simulation: this.simulation,
            result: natural,
          });
          this.rememberTurn(resolvedSessionId, {
            userText,
            assistantText: text,
            kind: 'final',
          });
          await this.refreshPersistentSessionState(resolvedSessionId);
          return {
            text,
            meta: { simulation: this.simulation, sessionId: resolvedSessionId },
          };
        }

        await this.logSafe({
          sessionId: resolvedSessionId,
          userText,
          modelRaw: raw,
          simulation: this.simulation,
          result: 'PARSE_ERROR',
        });
        return {
          text: this.simulation
            ? raw
            : 'Je n’ai pas réussi à interpréter la réponse. Peux-tu reformuler ?',
          meta: { simulation: this.simulation, sessionId: resolvedSessionId },
        };
      }

      // Anti "je vais..." + anti-final pour demandes actionnables
      if (action.type === 'final') {
        const actionable = this.seemsActionable(userText);
        if (this.isFillerFinal(action.text) || actionable) {
          const fallbackDecision = this.choosePrecomputedAction(
            userText,
            st,
            resolvedSessionId,
          );
          if (fallbackDecision) {
            raw = `${raw}\n[${fallbackDecision.planner.toUpperCase()}_ACTION_FALLBACK]`;
            decision = fallbackDecision;
            action = fallbackDecision.action;
          } else {
            const fix = await this.askModel(
              resolvedSessionId,
              userText,
              `${followupHint}\nSi la demande est actionnable, réponds avec "tool" ou "ask", jamais "final". JSON strict uniquement.`,
            );
            const fixed = parseJarvisAction(fix.cleaned);
            if (fixed && (fixed.type !== 'final' || !actionable)) {
              raw = fix.raw;
              decision = {
                action: fixed,
                planner: 'llm',
                confidence: 'unknown',
              };
              action = fixed;
            }
          }
        }
      }

      // ASK
      if (action.type === 'ask') {
        const text = this.humanizeAskOrFinalText(profile, action.text, 'ask');
        const decisionMeta = decision ?? {
          action,
          planner: 'llm' as DecisionPlanner,
          confidence: 'unknown' as DecisionConfidence,
        };
        this.setState(resolvedSessionId, {
          askedText: action.text,
          awaiting: action.awaiting ?? 'generic',
          originalUserText: st ? st.originalUserText : userText,
          createdAt: Date.now(),
        });

        await this.logSafe({
          sessionId: resolvedSessionId,
          userText,
          modelRaw: raw,
          simulation: this.simulation,
          result: `ASK:${action.awaiting ?? 'generic'}`,
        });
        this.rememberTurn(resolvedSessionId, {
          userText,
          assistantText: text,
          kind: 'ask',
        });
        await this.refreshPersistentSessionState(resolvedSessionId);

        return {
          text,
          choices: action.choices,
          meta: {
            simulation: this.simulation,
            awaiting: action.awaiting ?? 'generic',
            sessionId: resolvedSessionId,
            planner: decisionMeta.planner,
            confidence: decisionMeta.confidence,
          },
        };
      }

      const call = action;

      // FINAL
      if (call.type === 'final') {
        this.clearState(resolvedSessionId);
        const text = this.humanizeAskOrFinalText(profile, call.text, 'final');
        const decisionMeta = decision ?? {
          action: call,
          planner: 'llm' as DecisionPlanner,
          confidence: 'unknown' as DecisionConfidence,
        };
        await this.logSafe({
          sessionId: resolvedSessionId,
          userText,
          modelRaw: raw,
          simulation: this.simulation,
          result: call.text,
        });
        this.rememberTurn(resolvedSessionId, {
          userText,
          assistantText: text,
          kind: 'final',
        });
        await this.refreshPersistentSessionState(resolvedSessionId);
        return {
          text,
          meta: {
            simulation: this.simulation,
            sessionId: resolvedSessionId,
            planner: decisionMeta.planner,
            confidence: decisionMeta.confidence,
          },
        };
      }

      if (call.type !== 'tool') {
        throw new Error('UNSUPPORTED_ACTION_TYPE');
      }

      if (!decision) {
        decision = {
          action: call,
          planner: 'llm',
          confidence: 'unknown',
        };
      }

      // TOOL
      this.clearState(resolvedSessionId);

      const effectiveTextForDates = st
        ? `${st.originalUserText}\nClarification: ${userText}`
        : userText;
      let toolCall = this.normalizeToolCall(call, effectiveTextForDates);

      const validatedToolCall = normalizeToolOnlyCall({
        name: toolCall.name,
        args: toolCall.args,
      });
      if (!validatedToolCall) {
        await this.logSafe({
          sessionId: resolvedSessionId,
          userText,
          modelRaw: raw,
          toolName: toolCall.name,
          toolArgs: JSON.stringify(toolCall.args),
          simulation: this.simulation,
          result: 'INVALID_TOOL_ARGS',
        });
        const text = this.humanizeEnabled
          ? humanizeAskOrFinal(
              profile,
              'Je n’ai pas compris les paramètres. Peux-tu reformuler ?',
              'ask',
            )
          : 'Je n’ai pas compris les paramètres. Peux-tu reformuler ?';
        this.rememberTurn(resolvedSessionId, {
          userText,
          assistantText: text,
          kind: 'ask',
        });
        await this.refreshPersistentSessionState(resolvedSessionId);
        return {
          text,
          meta: { simulation: this.simulation, sessionId: resolvedSessionId },
        };
      }
      toolCall = validatedToolCall;

      const gateError = gateToolCall(toolCall, googleStatus);
      if (gateError) {
        const recoverable = this.buildRecoverableErrorResponse(
          resolvedSessionId,
          gateError,
        );
        if (recoverable) {
          await this.logSafe({
            sessionId: resolvedSessionId,
            userText,
            modelRaw: raw,
            toolName: toolCall.name,
            toolArgs: JSON.stringify(toolCall.args),
            simulation: this.simulation,
            result: `GATED:${gateError.code}`,
          });
          this.rememberTurn(resolvedSessionId, {
            userText,
            assistantText: recoverable.text,
            kind: 'ask',
          });
          await this.refreshPersistentSessionState(resolvedSessionId);
          return {
            text: recoverable.text,
            meta: {
              ...recoverable.meta,
              awaiting: 'connect_google',
              gatedTool: toolCall.name,
            },
          };
        }
      }
      const executionPlan = buildToolExecutionPlan(toolCall, {
        planner: decision.planner,
        confidence: decision.confidence,
        tz,
        speechMode: profile.speechMode,
      });
      const toolArgsJson = JSON.stringify(toolCall.args);

      // Confirmation requise → on enregistre pending et on demande "oui/non"
      if (executionPlan.requiresConfirmation) {
        await this.auditStore.markSessionPendingAsSuperseded(resolvedSessionId);
        const actionId = await this.pending.create(resolvedSessionId, toolCall);
        const preview = await previewTool(
          this.buildToolContext(resolvedSessionId),
          toolCall,
        );
        const pendingActionView = this.buildPendingActionView(
          profile,
          {
            id: actionId,
            call: toolCall,
          },
          {
            planner: decision.planner,
            confidence: decision.confidence,
            preview,
          },
        );

        await this.logSafe({
          sessionId: resolvedSessionId,
          userText,
          modelRaw: raw,
          toolName: toolCall.name,
          toolArgs: toolArgsJson,
          simulation: this.simulation,
          result: `PENDING:${actionId}`,
        });
        await this.auditStore.recordPending({
          sessionId: resolvedSessionId,
          pendingActionId: actionId,
          call: toolCall,
          plan: pendingActionView.decision,
          source: 'chat',
        });

        return {
          text: this.humanizeEnabled
            ? humanizePendingPrompt(
                profile,
                toolCall,
                tz,
                pendingActionView.decision,
                { preview },
              )
            : `Je peux exécuter "${toolCall.name}". Tu confirmes ?`,
          choices: ['oui', 'non'],
          pending_action: pendingActionView.pendingAction,
          meta: {
            simulation: this.simulation,
            requiresConfirmation: true,
            sessionId: resolvedSessionId,
            awaiting: 'confirm',
            decision: pendingActionView.decision,
            planner: pendingActionView.decision.planner,
            confidence: pendingActionView.decision.confidence,
            toolName: toolCall.name,
            toolArgs: toolCall.args,
          },
        };
      }

      auditContext = {
        sessionId: resolvedSessionId,
        source: 'chat',
        call: toolCall,
        plan: executionPlan,
      };
      const result = await runTool(
        this.buildToolContext(resolvedSessionId),
        toolCall,
      );
      const finalResult = await this.maybeSummarizeWebResult(
        userText,
        toolCall,
        result,
      );
      await this.workflowStore.observeSuccessfulTool({
        sessionId: resolvedSessionId,
        userText,
        call: toolCall,
      });
      const choices = await this.buildAutoFollowUpChoices(
        resolvedSessionId,
        toolCall.name,
        finalResult,
      );

      await this.logSafe({
        sessionId: resolvedSessionId,
        userText,
        modelRaw: raw,
        toolName: toolCall.name,
        toolArgs: toolArgsJson,
        simulation: this.simulation,
        result: finalResult,
      });
      await this.auditStore.recordCompletion({
        sessionId: resolvedSessionId,
        call: toolCall,
        plan: executionPlan,
        result: finalResult,
        source: 'chat',
      });
      auditContext = null;

      const humanText = this.humanizeToolOutput(profile, finalResult);
      this.rememberToolTurn(resolvedSessionId, userText, toolCall, finalResult);
      await this.persistMissionPlanIfNeeded(
        resolvedSessionId,
        toolCall,
        finalResult,
      );
      await this.refreshPersistentSessionState(resolvedSessionId);

      return {
        text: humanText,
        choices: choices.length ? choices : undefined,
        meta: {
          simulation: this.simulation,
          requiresConfirmation: false,
          sessionId: resolvedSessionId,
          decision: executionPlan,
          planner: executionPlan.planner,
          confidence: executionPlan.confidence,
          toolName: toolCall.name,
          toolArgs: toolCall.args,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      this.logger.error(
        `Erreur Jarvis (session=${resolvedSessionId}): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (auditContext) {
        await this.auditStore.recordFailure({
          sessionId: auditContext.sessionId,
          pendingActionId: auditContext.pendingActionId,
          call: auditContext.call,
          plan: auditContext.plan,
          source: auditContext.source,
          errorMessage: message,
        });
      }

      await this.logSafe({
        sessionId: resolvedSessionId,
        userText,
        modelRaw: '',
        simulation: this.simulation,
        result: `ERROR:${message}`,
      });
      this.rememberTurn(resolvedSessionId, {
        userText,
        assistantText: `Erreur: ${message}`,
        kind: 'error',
      });
      await this.refreshPersistentSessionState(resolvedSessionId);

      const recoverable = this.buildRecoverableErrorResponse(
        resolvedSessionId,
        error,
      );
      if (recoverable) return recoverable;

      return {
        text: this.humanizeEnabled
          ? humanizeError(profile)
          : 'Je rencontre une erreur technique. Réessaie dans quelques secondes.',
        meta: { simulation: this.simulation, sessionId: resolvedSessionId },
      };
    }
  }

  // Backup: route /confirm
  async confirm(actionId: string, sessionId?: string) {
    const expectedSessionId = sessionId?.trim() || undefined;
    if (this.requireConfirmSessionMatch && !expectedSessionId) {
      throw new BadRequestException(
        'sessionId est requis pour confirmer cette action',
      );
    }

    const fallbackProfile = await this.getHumanProfile(
      expectedSessionId ?? 'default',
    );
    const peeked = await this.pending.peek(actionId, expectedSessionId);
    if (!peeked)
      return {
        text: this.humanizeEnabled
          ? humanizeNoPending(fallbackProfile)
          : 'Action introuvable ou expirée.',
        meta: { simulation: this.simulation },
      };

    const googleToken = await this.prisma.googleOAuthToken.findUnique({
      where: { sessionId: peeked.sessionId },
      select: { scope: true },
    });
    const googleStatus = buildGoogleConnectionStatus(googleToken?.scope);
    const gateError = gateToolCall(peeked.call, googleStatus);
    if (gateError) {
      const recoverable = this.buildRecoverableErrorResponse(
        peeked.sessionId,
        gateError,
      );
      if (recoverable) {
        const text = `${recoverable.text}\n\nAction en attente: "${peeked.call.name}".`;
        await this.logSafe({
          sessionId: peeked.sessionId,
          userText: `[CONFIRM endpoint] ${actionId}`,
          modelRaw: '',
          toolName: peeked.call.name,
          toolArgs: JSON.stringify(peeked.call.args),
          simulation: this.simulation,
          result: `GATED:${gateError.code}`,
        });
        this.rememberTurn(peeked.sessionId, {
          userText: `[CONFIRM endpoint] ${actionId}`,
          assistantText: text,
          kind: 'ask',
        });
        await this.refreshPersistentSessionState(peeked.sessionId);
        return {
          text,
          meta: {
            ...recoverable.meta,
            awaiting: 'connect_google',
            gatedTool: peeked.call.name,
          },
        };
      }
    }

    const item = await this.pending.consume(actionId, expectedSessionId);
    if (!item)
      return {
        text: this.humanizeEnabled
          ? humanizeNoPending(fallbackProfile)
          : 'Action introuvable ou expirée.',
        meta: { simulation: this.simulation },
      };

    let auditContext: AuditExecutionContext | null = {
      sessionId: item.sessionId,
      source: 'confirm_endpoint',
      pendingActionId: item.id,
    };

    try {
      const profile = await this.getHumanProfile(item.sessionId);
      const result = await runTool(
        this.buildToolContext(item.sessionId),
        item.call,
      );
      const choices = await this.buildAutoFollowUpChoices(
        item.sessionId,
        item.call.name,
        result,
      );

      await this.logSafe({
        sessionId: item.sessionId,
        userText: `[CONFIRM endpoint] ${actionId}`,
        modelRaw: '',
        toolName: item.call.name,
        toolArgs: JSON.stringify(item.call.args),
        simulation: this.simulation,
        result,
      });
      await this.auditStore.recordCompletion({
        sessionId: item.sessionId,
        pendingActionId: item.id,
        result,
        source: 'confirm_endpoint',
      });
      auditContext = null;

      const humanText = this.humanizeToolOutput(profile, result, {
        fromConfirmation: true,
      });
      this.rememberToolTurn(
        item.sessionId,
        `[CONFIRM endpoint] ${actionId}`,
        item.call,
        result,
        { prefix: 'Confirmation executee pour' },
      );
      await this.persistMissionPlanIfNeeded(item.sessionId, item.call, result);
      await this.refreshPersistentSessionState(item.sessionId);

      return {
        text: humanText,
        choices: choices.length ? choices : undefined,
        meta: { simulation: this.simulation, sessionId: item.sessionId },
      };
    } catch (error) {
      const profile = await this.getHumanProfile(item.sessionId);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      this.logger.error(
        `Erreur confirm (session=${item.sessionId}): ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      if (auditContext) {
        await this.auditStore.recordFailure({
          sessionId: auditContext.sessionId,
          pendingActionId: auditContext.pendingActionId,
          source: auditContext.source,
          errorMessage: message,
        });
      }

      await this.logSafe({
        sessionId: item.sessionId,
        userText: `[CONFIRM endpoint] ${actionId}`,
        modelRaw: '',
        simulation: this.simulation,
        result: `ERROR:${message}`,
      });
      this.rememberTurn(item.sessionId, {
        userText: `[CONFIRM endpoint] ${actionId}`,
        assistantText: `Erreur: ${message}`,
        kind: 'error',
      });
      await this.refreshPersistentSessionState(item.sessionId);

      const recoverable = this.buildRecoverableErrorResponse(
        item.sessionId,
        error,
      );
      if (recoverable) return recoverable;

      return {
        text: this.humanizeEnabled
          ? humanizeError(profile)
          : 'Je rencontre une erreur technique. Réessaie dans quelques secondes.',
        meta: { simulation: this.simulation, sessionId: item.sessionId },
      };
    }
  }
}
