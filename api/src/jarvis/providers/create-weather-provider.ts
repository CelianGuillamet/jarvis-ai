import type { ConfigService } from '@nestjs/config';
import {
  DefaultWeatherProvider,
  type WeatherProvider,
} from './weather.provider';

export function createWeatherProvider(config: ConfigService): WeatherProvider {
  return new DefaultWeatherProvider(
    config.get<string>('WEATHER_GEO_BASE_URL') ||
      'https://geocoding-api.open-meteo.com',
    config.get<string>('WEATHER_BASE_URL') || 'https://api.open-meteo.com',
    Number(config.get<string>('WEATHER_TIMEOUT_MS') || 6_000),
  );
}
