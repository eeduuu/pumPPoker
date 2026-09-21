export type FeedbackSettings = {
  music: boolean;
  effects: boolean;
  vibration: boolean;
  musicVolume: number;
  effectsVolume: number;
};

export const FEEDBACK_STORAGE_KEY = 'pumpoker-feedback-v1';

export const defaultFeedbackSettings: FeedbackSettings = {
  music: false,
  effects: true,
  vibration: true,
  musicVolume: 75,
  effectsVolume: 80,
};

export function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

export function normalizeFeedbackSettings(value: unknown): FeedbackSettings {
  if (!value || typeof value !== 'object') return { ...defaultFeedbackSettings };
  const saved = value as Partial<FeedbackSettings> & { sounds?: unknown };
  return {
    music: typeof saved.music === 'boolean' ? saved.music : defaultFeedbackSettings.music,
    effects: typeof saved.effects === 'boolean' ? saved.effects : typeof saved.sounds === 'boolean' ? saved.sounds : defaultFeedbackSettings.effects,
    vibration: typeof saved.vibration === 'boolean' ? saved.vibration : defaultFeedbackSettings.vibration,
    musicVolume: normalizeVolume(saved.musicVolume, defaultFeedbackSettings.musicVolume),
    effectsVolume: normalizeVolume(saved.effectsVolume, defaultFeedbackSettings.effectsVolume),
  };
}
