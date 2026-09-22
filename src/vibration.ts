export type HapticEvent =
  | 'GAME_START' | 'TURN_START' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'
  | 'WIN' | 'ELIMINATED' | 'TOURNAMENT_WIN' | 'TEST';

// Milliseconds alternate between vibration and pause. Game events, not game modes
// or bot decisions, determine the pattern.
export const vibrationPatterns: Record<HapticEvent, readonly number[]> = {
  GAME_START: [110, 70, 170],
  TURN_START: [180, 90, 180],
  CHECK: [70],
  CALL: [110],
  RAISE: [100, 60, 150],
  ALL_IN: [180, 75, 230],
  WIN: [110, 65, 110],
  ELIMINATED: [300, 90, 190],
  TOURNAMENT_WIN: [110, 65, 110, 65, 180],
  TEST: [180, 90, 180],
};

type HapticNavigator = {
  vibrate?: (pattern: number | number[]) => boolean;
  userActivation?: { hasBeenActive: boolean };
};
type HapticDocument = { visibilityState: string };

export type HapticReport = {
  apiAvailable: boolean;
  pageVisible: boolean;
  hasInteracted: boolean;
  enabled: boolean;
  called: boolean;
  returned: boolean | null;
};

export class HapticsService {
  private trustedInteractionSeen = false;
  private readonly getNavigator: () => HapticNavigator | undefined;
  private readonly getDocument: () => HapticDocument | undefined;

  constructor(
    getNavigator: () => HapticNavigator | undefined = () => typeof navigator === 'undefined' ? undefined : navigator,
    getDocument: () => HapticDocument | undefined = () => typeof document === 'undefined' ? undefined : document,
  ) {
    this.getNavigator = getNavigator;
    this.getDocument = getDocument;
  }

  // Fallback for browsers without userActivation; only real user input counts.
  noteTrustedInteraction() { this.trustedInteractionSeen = true; }

  inspect(enabled: boolean): HapticReport {
    const device = this.getNavigator();
    const page = this.getDocument();
    const apiAvailable = typeof device?.vibrate === 'function';
    const pageVisible = page?.visibilityState === 'visible';
    const hasInteracted = device?.userActivation?.hasBeenActive ?? this.trustedInteractionSeen;
    return { apiAvailable, pageVisible, hasInteracted, enabled, called: false, returned: null };
  }

  emit(event: HapticEvent, enabled: boolean): HapticReport {
    const report = this.inspect(enabled);
    if (!report.apiAvailable || !report.pageVisible || !report.hasInteracted || !report.enabled) return report;
    report.called = true;
    try {
      report.returned = this.getNavigator()!.vibrate!([...vibrationPatterns[event]]);
    } catch {
      report.returned = false;
    }
    return report;
  }
}

export const haptics = new HapticsService();
