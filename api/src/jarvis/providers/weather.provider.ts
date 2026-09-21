import { DateTime } from 'luxon';

export type WeatherForecastDay = {
  date: string; // YYYY-MM-DD in requested timezone
  tempMinC: number;
  tempMaxC: number;
  precipitationProbMax?: number;
  windMaxKmh?: number;
  weatherCode?: number;
  description?: string;
};

export type WeatherDailyForecast = {
  resolvedLocation: string;
  timezone: string;
  day: WeatherForecastDay;
  source: 'open-meteo';
};

export interface WeatherProvider {
  readonly name: string;
  getDailyForecast(input: {
    location: string;
    day: 'today' | 'tomorrow';
    tz: string;
  }): Promise<WeatherDailyForecast>;
}

type OpenMeteoGeocodeResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    admin1?: string;
  }>;
};

type OpenMeteoForecastResponse = {
  timezone?: string;
  daily?: {
    time?: string[];
    weathercode?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function weatherCodeToFr(code: number | undefined): string | undefined {
  if (code === undefined) return undefined;
  const map: Record<number, string> = {
    0: 'ciel dégagé',
    1: 'plutôt dégagé',
    2: 'partiellement nuageux',
    3: 'couvert',
    45: 'brouillard',
    48: 'brouillard givrant',
    51: 'bruine faible',
    53: 'bruine modérée',
    55: 'bruine forte',
    56: 'bruine verglaçante faible',
    57: 'bruine verglaçante forte',
    61: 'pluie faible',
    63: 'pluie modérée',
    65: 'pluie forte',
    66: 'pluie verglaçante faible',
    67: 'pluie verglaçante forte',
    71: 'neige faible',
    73: 'neige modérée',
    75: 'neige forte',
    77: 'grains de neige',
    80: 'averses faibles',
    81: 'averses modérées',
    82: 'averses fortes',
    85: 'averses de neige faibles',
    86: 'averses de neige fortes',
    95: 'orage',
    96: 'orage avec grêle',
    99: 'orage avec grêle (fort)',
  };
  return map[code] ?? `code météo ${code}`;
}

export class DefaultWeatherProvider implements WeatherProvider {
  readonly name = 'open-meteo';

  constructor(
    private readonly geocodingBaseUrl = process.env.WEATHER_GEO_BASE_URL ||
      'https://geocoding-api.open-meteo.com',
    private readonly forecastBaseUrl = process.env.WEATHER_BASE_URL ||
      'https://api.open-meteo.com',
    private readonly timeoutMs = Number(
      process.env.WEATHER_TIMEOUT_MS || 6_000,
    ),
  ) {}

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const safeTimeout = clamp(this.timeoutMs, 500, 15_000);
    const timeout = setTimeout(() => controller.abort(), safeTimeout);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Météo indisponible: HTTP ${response.status} ${await response.text()}`,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async geocode(location: string) {
    const name = location.trim();
    if (!name) throw new Error('Lieu météo vide.');

    const url = new URL('/v1/search', this.geocodingBaseUrl);
    url.search = new URLSearchParams({
      name,
      count: '1',
      language: 'fr',
      format: 'json',
    }).toString();

    const payload = await this.fetchJson<OpenMeteoGeocodeResponse>(
      url.toString(),
    );
    const first = payload.results?.[0];
    const latitude =
      typeof first?.latitude === 'number' ? first.latitude : undefined;
    const longitude =
      typeof first?.longitude === 'number' ? first.longitude : undefined;
    if (latitude === undefined || longitude === undefined) {
      throw new Error(`Lieu introuvable: "${name}".`);
    }
    const parts = [first?.name, first?.admin1, first?.country]
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean);
    const resolvedLocation = parts.join(', ') || name;
    return { latitude, longitude, resolvedLocation };
  }

  private async forecastDaily(
    coords: { latitude: number; longitude: number },
    tz: string,
  ) {
    const url = new URL('/v1/forecast', this.forecastBaseUrl);
    url.search = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      timezone: tz,
      forecast_days: '3',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      daily: [
        'weathercode',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','),
    }).toString();

    return this.fetchJson<OpenMeteoForecastResponse>(url.toString());
  }

  async getDailyForecast(input: {
    location: string;
    day: 'today' | 'tomorrow';
    tz: string;
  }): Promise<WeatherDailyForecast> {
    const { latitude, longitude, resolvedLocation } = await this.geocode(
      input.location,
    );
    const payload = await this.forecastDaily({ latitude, longitude }, input.tz);
    const timezone = payload.timezone || input.tz;
    const daily = payload.daily;
    const days = daily?.time ?? [];
    const targetDate = DateTime.now()
      .setZone(timezone)
      .plus({ days: input.day === 'tomorrow' ? 1 : 0 })
      .toISODate();
    if (!targetDate) {
      throw new Error('Date météo invalide.');
    }
    const idx = days.indexOf(targetDate);
    if (idx < 0) {
      throw new Error(`Prévisions indisponibles pour ${targetDate}.`);
    }

    const tMin = daily?.temperature_2m_min?.[idx];
    const tMax = daily?.temperature_2m_max?.[idx];
    if (typeof tMin !== 'number' || typeof tMax !== 'number') {
      throw new Error('Prévisions incomplètes (températures).');
    }

    const code = daily?.weathercode?.[idx];
    const description = weatherCodeToFr(
      typeof code === 'number' ? code : undefined,
    );

    const p = daily?.precipitation_probability_max?.[idx];
    const precipitationProbMax =
      typeof p === 'number' ? Math.round(clamp(p, 0, 100)) : undefined;

    const wind = daily?.wind_speed_10m_max?.[idx];
    const windMaxKmh =
      typeof wind === 'number' ? Math.round(Math.max(0, wind)) : undefined;

    return {
      resolvedLocation,
      timezone,
      day: {
        date: targetDate,
        tempMinC: Math.round(tMin * 10) / 10,
        tempMaxC: Math.round(tMax * 10) / 10,
        precipitationProbMax,
        windMaxKmh,
        weatherCode: typeof code === 'number' ? code : undefined,
        description,
      },
      source: 'open-meteo',
    };
  }
}
