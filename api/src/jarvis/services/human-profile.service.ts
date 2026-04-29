import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createHumanProfile,
  type HumanProfile,
  type HumanSpeechMode,
  type HumanVerbosity,
  updateHumanProfile,
} from '../lib/humanize';

type HumanDefaults = {
  speechMode: HumanSpeechMode;
  verbosity: HumanVerbosity;
};

type CacheEntry = {
  profile: HumanProfile;
  dirty: boolean;
  lastPersistedAt: number;
};

function configBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

@Injectable()
export class HumanProfileService implements OnModuleDestroy {
  private readonly logger = new Logger(HumanProfileService.name);
  private readonly persistEnabled: boolean;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly flushIntervalMs: number;
  private readonly minPersistIntervalMs: number;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly flushTimer: NodeJS.Timeout | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.persistEnabled = configBool(
      this.config.get<string>('HUMAN_PROFILE_PERSIST'),
      true,
    );

    const ttlMinutes = Number(
      this.config.get('HUMAN_PROFILE_TTL_MINUTES') ?? 24 * 60,
    );
    this.ttlMs =
      (Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 24 * 60) *
      60_000;

    const maxSessions = Number(
      this.config.get('HUMAN_PROFILE_MAX_SESSIONS') ?? 5_000,
    );
    this.maxSessions =
      Number.isFinite(maxSessions) && maxSessions > 0
        ? Math.floor(maxSessions)
        : 5_000;

    const flushInterval = Number(
      this.config.get('HUMAN_PROFILE_FLUSH_INTERVAL_MS') ?? 5_000,
    );
    this.flushIntervalMs =
      Number.isFinite(flushInterval) && flushInterval > 0
        ? Math.floor(flushInterval)
        : 5_000;

    const minPersistInterval = Number(
      this.config.get('HUMAN_PROFILE_MIN_PERSIST_INTERVAL_MS') ?? 1_500,
    );
    this.minPersistIntervalMs =
      Number.isFinite(minPersistInterval) && minPersistInterval >= 0
        ? Math.floor(minPersistInterval)
        : 1_500;

    if (!this.persistEnabled) {
      this.flushTimer = null;
      return;
    }

    this.flushTimer = setInterval(() => {
      void this.flushDirty(false);
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [sessionId, entry] of this.cache.entries()) {
      if (now - entry.profile.updatedAt > this.ttlMs) {
        this.cache.delete(sessionId);
      }
    }

    if (this.cache.size <= this.maxSessions) return;
    const oldest = [...this.cache.entries()].sort(
      (a, b) => a[1].profile.updatedAt - b[1].profile.updatedAt,
    );
    for (let i = 0; i < oldest.length - this.maxSessions; i++) {
      this.cache.delete(oldest[i][0]);
    }
  }

  private rowToProfile(
    row: {
      speechMode: string;
      verbosity: string;
      preferredName: string | null;
      turnCount: number;
      updatedAt: Date;
    },
    defaults: HumanDefaults,
  ): HumanProfile {
    const speechMode: HumanSpeechMode =
      row.speechMode === 'vous' || row.speechMode === 'tu'
        ? row.speechMode
        : defaults.speechMode;
    const verbosity: HumanVerbosity =
      row.verbosity === 'brief' ||
      row.verbosity === 'normal' ||
      row.verbosity === 'detailed'
        ? row.verbosity
        : defaults.verbosity;

    return {
      speechMode,
      verbosity,
      preferredName: row.preferredName ?? undefined,
      turnCount:
        Number.isFinite(row.turnCount) && row.turnCount >= 0
          ? row.turnCount
          : 0,
      updatedAt: row.updatedAt.getTime(),
    };
  }

  private async loadFromStore(
    sessionId: string,
    defaults: HumanDefaults,
  ): Promise<HumanProfile> {
    if (!this.persistEnabled) {
      return createHumanProfile(defaults.speechMode, defaults.verbosity);
    }

    try {
      const row = await this.prisma.jarvisHumanProfile.findUnique({
        where: { sessionId },
        select: {
          speechMode: true,
          verbosity: true,
          preferredName: true,
          turnCount: true,
          updatedAt: true,
        },
      });
      if (!row) {
        return createHumanProfile(defaults.speechMode, defaults.verbosity);
      }
      return this.rowToProfile(row, defaults);
    } catch (error) {
      this.logger.warn(
        `Impossible de lire le profil humain pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return createHumanProfile(defaults.speechMode, defaults.verbosity);
    }
  }

  async get(sessionId: string, defaults: HumanDefaults): Promise<HumanProfile> {
    this.cleanupCache();
    const cached = this.cache.get(sessionId);
    if (cached) return cached.profile;

    const loaded = await this.loadFromStore(sessionId, defaults);
    this.cache.set(sessionId, {
      profile: loaded,
      dirty: false,
      lastPersistedAt: Date.now(),
    });
    return loaded;
  }

  private async persistEntry(
    sessionId: string,
    entry: CacheEntry,
    force: boolean,
  ) {
    if (!this.persistEnabled || !entry.dirty) return;
    const now = Date.now();
    if (!force && now - entry.lastPersistedAt < this.minPersistIntervalMs)
      return;

    try {
      await this.prisma.jarvisHumanProfile.upsert({
        where: { sessionId },
        create: {
          sessionId,
          speechMode: entry.profile.speechMode,
          verbosity: entry.profile.verbosity,
          preferredName: entry.profile.preferredName ?? null,
          turnCount: entry.profile.turnCount,
        },
        update: {
          speechMode: entry.profile.speechMode,
          verbosity: entry.profile.verbosity,
          preferredName: entry.profile.preferredName ?? null,
          turnCount: entry.profile.turnCount,
        },
      });

      entry.dirty = false;
      entry.lastPersistedAt = now;
    } catch (error) {
      this.logger.warn(
        `Impossible d'écrire le profil humain pour ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async updateFromUserText(
    sessionId: string,
    userText: string,
    defaults: HumanDefaults,
  ): Promise<HumanProfile> {
    const current = await this.get(sessionId, defaults);
    const next = updateHumanProfile(current, userText);

    const entry: CacheEntry = {
      profile: next,
      dirty: true,
      lastPersistedAt: this.cache.get(sessionId)?.lastPersistedAt ?? 0,
    };
    this.cache.set(sessionId, entry);

    await this.persistEntry(sessionId, entry, false);
    return next;
  }

  private async flushDirty(force: boolean) {
    for (const [sessionId, entry] of this.cache.entries()) {
      await this.persistEntry(sessionId, entry, force);
    }
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flushDirty(true);
  }
}
