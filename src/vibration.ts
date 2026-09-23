export type HapticEvent =
  | 'GAME_START' | 'TURN_START' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'
  | 'WIN' | 'ELIMINATED' | 'TOURNAMENT_WIN' | 'TEST';

// Each event is a single pulse. For former multi-pulse events, the duration is
// the first vibration plus its following pause, without the second vibration.
export const vibrationPatterns: Record<HapticEvent, readonly number[]> = {
  GAME_START: [180],
  TURN_START: [270],
  CHECK: [70],
  CALL: [110],
  RAISE: [160],
  ALL_IN: [255],
  WIN: [175],
  ELIMINATED: [390],
  TOURNAMENT_WIN: [175],
  TEST: [270],
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
