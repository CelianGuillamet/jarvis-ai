import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandRejectedError } from '../commands/command-rejected.error';
import { TokenEncryptionService } from '../google/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  HomeAddressError,
  validateHomeTarget,
  type HomeLookup,
  type ValidatedHomeTarget,
} from './home-address-policy';
import {
  HomeAssistantClient,
  HomeAssistantError,
  type HaState,
} from './home-assistant.client';

export const HOME_LOOKUP = Symbol('HOME_LOOKUP');
export const HOME_CLIENT_FACTORY = Symbol('HOME_CLIENT_FACTORY');
export const HOME_DOMAINS = [
  'light',
  'scene',
  'sensor',
  'binary_sensor',
] as const;
export type HomeDomain = (typeof HOME_DOMAINS)[number];
export const MAX_HOME_ENTITIES = 50;
const ENTITY_ID = /^(light|scene|sensor|binary_sensor)\.[a-z0-9_]{1,80}$/;

export type HomeEntity = { entityId: string; label: string };
export type HomeStatus = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string | null;
  entities: HomeEntity[];
};
export type HomeReading = HomeEntity & {
  domain: HomeDomain;
  state: string;
  brightnessPct: number | null;
  unit: string | null;
};

export type HomeClientFactory = (
  target: ValidatedHomeTarget,
  token: string,
) => Pick<HomeAssistantClient, 'ping' | 'states' | 'state' | 'callService'>;

export type HomeToolPort = {
  status(): Promise<HomeStatus>;
  readAllowed(): Promise<HomeReading[]>;
  resolve(query: string, domain: 'light' | 'scene'): Promise<HomeEntity>;
  setLight(
    entity: HomeEntity,
    on: boolean,
    brightnessPct?: number,
  ): Promise<void>;
  activateScene(entity: HomeEntity): Promise<void>;
};

const domainOf = (entityId: string) => entityId.split('.')[0] as HomeDomain;
/** Names and states come from the home network and are data, never instructions: flatten and bound them. */
const clean = (value: string, max: number) =>
  value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const label = (state: HaState) => {
  const name = state.attributes.friendly_name;
  return clean(
    typeof name === 'string' && clean(name, 80) ? name : state.entity_id,
    80,
  );
};

/** Per-account Home Assistant access. The token is encrypted at rest and never leaves this service. */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: TokenEncryptionService,
    @Optional() @Inject(HOME_LOOKUP) private readonly lookup?: HomeLookup,
    @Optional()
    @Inject(HOME_CLIENT_FACTORY)
    private readonly clientFactory: HomeClientFactory = (target, token) =>
      new HomeAssistantClient(target, token),
  ) {}

  /** The only view tools receive: bound to one owner, allow-list enforced inside. */
  forOwner(ownerId: string): HomeToolPort {
    return {
      status: () => this.status(ownerId),
      readAllowed: () => this.readAllowed(ownerId),
      resolve: (query, domain) => this.resolve(ownerId, query, domain),
      setLight: (entity, on, pct) => this.setLight(ownerId, entity, on, pct),
      activateScene: (entity) => this.activateScene(ownerId, entity),
    };
  }

  enabled(): boolean {
    return this.config.get<string>('HOME_ASSISTANT_ENABLED') === 'true';
  }

  async status(ownerId: string): Promise<HomeStatus> {
    const row = this.enabled()
      ? await this.prisma.homeAssistantConnection.findUnique({
          where: { ownerId },
        })
      : null;
    return {
      enabled: this.enabled(),
      connected: !!row,
      baseUrl: row?.baseUrl ?? null,
      entities: row ? this.entitiesOf(row.entities) : [],
    };
  }

  async connect(ownerId: string, baseUrl: string, token: string) {
    this.assertEnabled();
    const target = await this.validate(baseUrl);
    try {
      await this.clientFactory(target, token).ping();
    } catch (error) {
      throw this.unavailable(error);
    }
    const context = `home-assistant:${ownerId}`;
    const encryptedToken = this.encryption.encrypt(token, context);
    const normalized = target.url.origin;
    await this.prisma.homeAssistantConnection.upsert({
      where: { ownerId },
      create: { ownerId, baseUrl: normalized, encryptedToken, entities: [] },
      update: { baseUrl: normalized, encryptedToken, entities: [] },
    });
    return this.status(ownerId);
  }

  async disconnect(ownerId: string) {
    await this.prisma.homeAssistantConnection.deleteMany({
      where: { ownerId },
    });
    return this.status(ownerId);
  }

  async discover(ownerId: string): Promise<HomeEntity[]> {
    const client = await this.client(ownerId);
    const states = await this.guard(() => client.states());
    return states
      .filter((s) => ENTITY_ID.test(s.entity_id))
      .slice(0, 300)
      .map((s) => ({ entityId: s.entity_id, label: label(s) }));
  }

  async setEntities(ownerId: string, entityIds: string[]) {
    const unique = [...new Set(entityIds)];
    if (
      unique.length > MAX_HOME_ENTITIES ||
      !unique.every((id) => ENTITY_ID.test(id))
    )
      throw new ConflictException('Sélection d’appareils invalide.');
    const known = new Map(
      (await this.discover(ownerId)).map((e) => [e.entityId, e]),
    );
    if (!unique.every((id) => known.has(id)))
      throw new ConflictException('Un appareil sélectionné est introuvable.');
    await this.prisma.homeAssistantConnection.update({
      where: { ownerId },
      data: { entities: unique.map((id) => known.get(id)!) },
    });
    return this.status(ownerId);
  }

  async readAllowed(ownerId: string): Promise<HomeReading[]> {
    const allowed = await this.allowed(ownerId);
    if (!allowed.length) return [];
    const client = await this.client(ownerId);
    const states = new Map(
      (await this.guard(() => client.states())).map((s) => [s.entity_id, s]),
    );
    return allowed.flatMap((entity) => {
      const state = states.get(entity.entityId);
      if (!state) return [];
      const brightness = state.attributes.brightness;
      const unit = state.attributes.unit_of_measurement;
      return [
        {
          ...entity,
          domain: domainOf(entity.entityId),
          state: clean(state.state, 80),
          brightnessPct:
            typeof brightness === 'number'
              ? Math.round((brightness / 255) * 100)
              : null,
          unit: typeof unit === 'string' ? clean(unit, 20) : null,
        },
      ];
    });
  }

  /** Resolve a spoken name or entity ID against the explicit allow-list only. */
  async resolve(
    ownerId: string,
    query: string,
    domain: 'light' | 'scene',
  ): Promise<HomeEntity> {
    const wanted = query.trim().toLowerCase();
    const matches = (await this.allowed(ownerId)).filter(
      (e) =>
        domainOf(e.entityId) === domain &&
        (e.entityId === wanted || e.label.toLowerCase() === wanted),
    );
    if (matches.length !== 1)
      throw new CommandRejectedError(
        matches.length
          ? 'Plusieurs appareils portent ce nom. Précise lequel.'
          : 'Cet appareil n’est pas autorisé pour Jarvis.',
        'NOT_FOUND',
      );
    return matches[0];
  }

  async setLight(
    ownerId: string,
    entity: HomeEntity,
    on: boolean,
    brightnessPct?: number,
  ) {
    if (domainOf(entity.entityId) !== 'light')
      throw new CommandRejectedError('Ce n’est pas une lumière.');
    const client = await this.client(ownerId);
    await this.write(() =>
      client.callService('light', on ? 'turn_on' : 'turn_off', {
        entity_id: entity.entityId,
        ...(on && brightnessPct !== undefined
          ? { brightness_pct: brightnessPct }
          : {}),
      }),
    );
  }

  async activateScene(ownerId: string, entity: HomeEntity) {
    if (domainOf(entity.entityId) !== 'scene')
      throw new CommandRejectedError('Ce n’est pas une scène.');
    const client = await this.client(ownerId);
    await this.write(() =>
      client.callService('scene', 'turn_on', { entity_id: entity.entityId }),
    );
  }

  private assertEnabled() {
    if (!this.enabled())
      throw new ConflictException(
        'L’intégration Home Assistant est désactivée.',
      );
  }

  private async allowed(ownerId: string): Promise<HomeEntity[]> {
    this.assertEnabled();
    const row = await this.prisma.homeAssistantConnection.findUnique({
      where: { ownerId },
      select: { entities: true },
    });
    return row ? this.entitiesOf(row.entities) : [];
  }

  private entitiesOf(value: unknown): HomeEntity[] {
    return Array.isArray(value)
      ? value.filter(
          (e): e is HomeEntity =>
            !!e &&
            typeof (e as HomeEntity).entityId === 'string' &&
            ENTITY_ID.test((e as HomeEntity).entityId) &&
            typeof (e as HomeEntity).label === 'string',
        )
      : [];
  }

  private async validate(baseUrl: string) {
    try {
      return await validateHomeTarget(baseUrl, this.lookup);
    } catch (error) {
      if (error instanceof HomeAddressError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  private async client(ownerId: string) {
    this.assertEnabled();
    const row = await this.prisma.homeAssistantConnection.findUnique({
      where: { ownerId },
    });
    if (!row) throw new ConflictException('Home Assistant n’est pas connecté.');
    const target = await this.validate(row.baseUrl);
    const token = this.encryption.decrypt(
      row.encryptedToken,
      `home-assistant:${ownerId}`,
    );
    return this.clientFactory(target, token);
  }

  private async guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  /** A write that may have reached the server has an unknown outcome and is never retried. */
  private async write(work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      if (error instanceof HomeAssistantError && !error.mayHaveReachedServer)
        throw new CommandRejectedError(
          'Home Assistant est injoignable. Rien n’a été modifié.',
        );
      throw error instanceof HomeAssistantError
        ? new Error('Résultat Home Assistant incertain.')
        : error;
    }
  }

  private unavailable(error: unknown) {
    if (error instanceof HomeAssistantError)
      return new ServiceUnavailableException(
        error.kind === 'unauthorized'
          ? 'Home Assistant a refusé le jeton.'
          : 'Home Assistant est injoignable ou répond de façon inattendue.',
      );
    return error;
  }
}
