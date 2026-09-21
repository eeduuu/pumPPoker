export type EffectKind = 'deal' | 'action' | 'navigate' | 'turn' | 'win' | 'ignite' | 'blast';

type Voice = { frequency: number; duration: number; strength: number; delay?: number; wave?: OscillatorType };

const effects: Record<Exclude<EffectKind, 'blast' | 'win'>, Voice[]> = {
  deal: [
    { frequency: 840, duration: 0.07, strength: 0.17, wave: 'triangle' },
    { frequency: 1180, duration: 0.045, strength: 0.07, delay: 0.015 },
  ],
  action: [{ frequency: 480, duration: 0.11, strength: 0.24, wave: 'triangle' }],
  navigate: [{ frequency: 690, duration: 0.09, strength: 0.2, wave: 'triangle' }],
  turn: [
    { frequency: 650, duration: 0.13, strength: 0.22, wave: 'triangle' },
    { frequency: 870, duration: 0.16, strength: 0.17, delay: 0.1, wave: 'triangle' },
  ],
  ignite: [
    { frequency: 820, duration: 0.09, strength: 0.1, wave: 'triangle' },
    { frequency: 1090, duration: 0.08, strength: 0.07, delay: 0.09, wave: 'sine' },
  ],
};

export class GameAudio {
  private context: AudioContext | null = null;
  private effectsLimiter: DynamicsCompressorNode | null = null;
  private player: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private songIndex = 0;
  private musicEnabled = false;
  private musicUnlocked = false;
  private musicVolume = 75;
  private readonly tracks: string[];

  constructor(tracks: string[]) { this.tracks = tracks; }

  private getContext(): AudioContext | null {
    const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return null;
    if (!this.context || this.context.state === 'closed') {
      this.context = new Constructor();
      this.effectsLimiter = this.context.createDynamicsCompressor();
      this.effectsLimiter.threshold.value = -10;
      this.effectsLimiter.knee.value = 8;
      this.effectsLimiter.ratio.value = 5;
      this.effectsLimiter.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return this.context;
  }

  playEffect(kind: EffectKind, volume: number): void {
    if (volume <= 0) return;
    const context = this.getContext();
    if (!context || !this.effectsLimiter) return;
    const scale = Math.min(100, volume) / 100;
    if (kind === 'blast') { this.playBlast(context, scale); return; }
    if (kind === 'win') { this.playVictory(context, scale); return; }
    for (const voice of effects[kind]) {
      const start = context.currentTime + (voice.delay || 0);
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = voice.wave || 'sine';
      oscillator.frequency.setValueAtTime(voice.frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, voice.strength * scale), start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + voice.duration);
      oscillator.connect(envelope).connect(this.effectsLimiter);
      oscillator.start(start);
      oscillator.stop(start + voice.duration + 0.02);
    }
  }

  private playVictory(context: AudioContext, scale: number): void {
    if (!this.effectsLimiter) return;
    const start = context.currentTime;
    // A short rising fanfare resolves into a warm chord instead of three beeps.
    const notes = [
      { frequency: 392, at: 0, duration: .33, strength: .16 },
      { frequency: 493.88, at: .15, duration: .36, strength: .17 },
      { frequency: 587.33, at: .30, duration: .39, strength: .18 },
      { frequency: 783.99, at: .46, duration: .62, strength: .19 },
      { frequency: 196, at: .71, duration: 1.0, strength: .10 },
      { frequency: 392, at: .71, duration: .95, strength: .08 },
      { frequency: 493.88, at: .71, duration: .95, strength: .08 },
      { frequency: 587.33, at: .71, duration: .95, strength: .09 },
      { frequency: 783.99, at: .71, duration: 1.05, strength: .11 },
    ];
    for (const note of notes) {
      const at = start + note.at;
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(note.frequency, at);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, note.strength * scale), at + .025);
      envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, note.strength * scale * .62), at + .09);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + note.duration);
      oscillator.connect(envelope).connect(this.effectsLimiter);
      oscillator.start(at);
      oscillator.stop(at + note.duration + .02);
    }
  }

  private playBlast(context: AudioContext, scale: number): void {
    if (!this.effectsLimiter) return;
    const start = context.currentTime;
    const duration = 0.62;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 0x51a7e;
    for (let index = 0; index < samples.length; index++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[index] = seed / 2147483648 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;

    // A brief sharp crack, then a low, decaying burst: no pitched arcade chime.
    const crackFilter = context.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.value = 1300;
    const crackGain = context.createGain();
    crackGain.gain.setValueAtTime(0.0001, start);
    crackGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * scale), start + 0.006);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.085);
    noise.connect(crackFilter).connect(crackGain).connect(this.effectsLimiter);

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(3600, start);
    bodyFilter.frequency.exponentialRampToValueAtTime(180, start + duration);
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.48 * scale), start + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    noise.connect(bodyFilter).connect(bodyGain).connect(this.effectsLimiter);
    noise.start(start);
    noise.stop(start + duration);

    const impact = context.createOscillator();
    impact.type = 'triangle';
    impact.frequency.setValueAtTime(170, start);
    impact.frequency.exponentialRampToValueAtTime(52, start + 0.36);
    const impactGain = context.createGain();
    impactGain.gain.setValueAtTime(0.0001, start);
    impactGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.4 * scale), start + 0.013);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    impact.connect(impactGain).connect(this.effectsLimiter);
    impact.start(start);
    impact.stop(start + 0.42);
  }

  private ensurePlayer(): HTMLAudioElement | null {
    if (!this.tracks.length) return null;
    if (this.player) return this.player;
    const player = new Audio(this.tracks[this.songIndex]);
    player.preload = 'auto';
    player.addEventListener('ended', () => {
      this.songIndex = (this.songIndex + 1) % this.tracks.length;
      player.src = this.tracks[this.songIndex];
      if (this.musicEnabled && !document.hidden) void player.play().catch(() => undefined);
    });
    this.player = player;

    const context = this.getContext();
    if (context) {
      try {
        const source = context.createMediaElementSource(player);
        const gain = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -16;
        limiter.knee.value = 12;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.006;
        limiter.release.value = 0.22;
        source.connect(gain).connect(limiter).connect(context.destination);
        this.musicGain = gain;
      } catch {
        this.musicGain = null;
      }
    }
    this.setMusicVolume(this.musicVolume);
    return player;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    if (this.musicGain && this.context) {
      // Up to 1.6× before compression: full volume is not artificially quiet.
      this.musicGain.gain.setTargetAtTime(Math.min(1.6, Math.max(0, volume / 100 * 1.6)), this.context.currentTime, 0.015);
    } else if (this.player) {
      this.player.volume = Math.min(1, Math.max(0, volume / 100));
    }
  }

  setMusic(enabled: boolean, volume: number): void {
    this.musicEnabled = enabled;
    this.setMusicVolume(volume);
    if (!enabled) { this.player?.pause(); return; }
    this.resumeMusic();
  }

  unlockMusic(): void {
    this.musicUnlocked = true;
    this.resumeMusic();
  }

  resumeMusic(): void {
    if (!this.musicEnabled || !this.musicUnlocked || document.hidden) return;
    const player = this.ensurePlayer();
    if (!player) return;
    this.getContext();
    void player.play().catch(() => undefined);
  }

  suspendMusic(): void { this.player?.pause(); }

  dispose(): void {
    this.player?.pause();
    this.player = null;
    this.musicGain = null;
    this.effectsLimiter = null;
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
