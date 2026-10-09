export type ModelLimits = {
  totalDeadlineMs: number;
  maxOutputTokens: number;
};

export const DEFAULT_MODEL_LIMITS: ModelLimits = {
  totalDeadlineMs: 45_000,
  maxOutputTokens: 8_192,
};

export class ModelDeadlineError extends Error {
  constructor() {
    super('Délai total du modèle dépassé');
  }
}
