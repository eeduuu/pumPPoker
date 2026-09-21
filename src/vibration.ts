export type VibrationCue = 'start' | 'turn' | 'eliminated' | 'win' | 'test';

// Milliseconds alternate between vibration and pause. Short, distinct cues avoid
// turning every bot action into a notification.
export const vibrationPatterns: Record<VibrationCue, readonly number[]> = {
  start: [110, 70, 170],
  turn: [180, 90, 180],
  eliminated: [300, 90, 190],
  win: [110, 65, 110, 65, 180],
  test: [180, 90, 180],
};

type VibrationDevice = Pick<Navigator, 'vibrate'>;

export function vibrationAvailable(device: VibrationDevice | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return typeof device?.vibrate === 'function';
}

// A true result only means the browser accepted the request; it cannot confirm
// that the phone's motor actually ran (silent mode and OS settings can block it).
export function playVibration(cue: VibrationCue, device: VibrationDevice | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!vibrationAvailable(device)) return false;
  try {
    return device!.vibrate([...vibrationPatterns[cue]]);
  } catch {
    return false;
  }
}
