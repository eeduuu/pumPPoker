import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GameAudio } from './audioEngine';
import type { EffectKind } from './audioEngine';
import { musicPlaylist } from './musicLibrary';
import {
  defaultFeedbackSettings,
  FEEDBACK_STORAGE_KEY,
  normalizeFeedbackSettings,
  normalizeVolume,
} from './preferences';
import type { FeedbackSettings } from './preferences';

type BooleanPreference = 'music' | 'effects' | 'vibration';
type VolumePreference = 'musicVolume' | 'effectsVolume';
type FeedbackContextValue = {
  settings: FeedbackSettings;
  setPreference: (key: BooleanPreference, enabled: boolean) => void;
  setVolume: (key: VolumePreference, volume: number) => void;
  feedback: (kind: EffectKind, vibrate?: boolean) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function loadSettings(): FeedbackSettings {
  try {
    return normalizeFeedbackSettings(JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || 'null'));
  } catch {
    return { ...defaultFeedbackSettings };
  }
}

export function vibrationAvailable(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.vibrate === 'function'
    && (navigator.maxTouchPoints > 0 || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches));
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings);
  const settingsRef = useRef(settings);
  const engineRef = useRef<GameAudio | null>(null);

  const engine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new GameAudio(musicPlaylist);
    return engineRef.current;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    try { localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  }, [settings]);

  useEffect(() => {
    if (settings.music) engine().setMusic(true, settings.musicVolume);
    else engineRef.current?.setMusic(false, settings.musicVolume);
  }, [settings.music, engine]);

  useEffect(() => { engineRef.current?.setMusicVolume(settings.musicVolume); }, [settings.musicVolume]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) engineRef.current?.suspendMusic();
      else engineRef.current?.resumeMusic();
    };
    const onInteraction = () => {
      if (!settingsRef.current.music) return;
      const audio = engine();
      audio.setMusic(true, settingsRef.current.musicVolume);
      audio.unlockMusic();
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onInteraction);
    document.addEventListener('keydown', onInteraction);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerdown', onInteraction);
      document.removeEventListener('keydown', onInteraction);
    };
  }, [engine]);

  useEffect(() => () => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  const feedback = useCallback((kind: EffectKind, vibrate = false) => {
    const current = settingsRef.current;
    const audio = engine();
    if (kind === 'navigate' && current.music) {
      audio.setMusic(true, current.musicVolume);
      audio.unlockMusic();
    }
    if (current.effects) audio.playEffect(kind, current.effectsVolume);
    if (vibrate && current.vibration && vibrationAvailable()) {
      navigator.vibrate(kind === 'win' ? [110, 65, 110, 65, 180] : kind === 'turn' ? [70, 45, 70] : 65);
    }
  }, [engine]);

  const setPreference = useCallback((key: BooleanPreference, enabled: boolean) => {
    if (key === 'vibration' && !vibrationAvailable()) return;
    settingsRef.current = { ...settingsRef.current, [key]: enabled };
    setSettings(current => ({ ...current, [key]: enabled }));
    if (key === 'music') {
      const audio = engine();
      audio.setMusic(enabled, settingsRef.current.musicVolume);
      if (enabled) audio.unlockMusic();
    }
    if (key === 'effects' && enabled) engine().playEffect('navigate', settingsRef.current.effectsVolume);
    if (key === 'vibration' && enabled) navigator.vibrate(70);
  }, [engine]);

  const setVolume = useCallback((key: VolumePreference, volume: number) => {
    const next = normalizeVolume(volume, settingsRef.current[key]);
    settingsRef.current = { ...settingsRef.current, [key]: next };
    setSettings(current => ({ ...current, [key]: next }));
    if (key === 'musicVolume') engineRef.current?.setMusicVolume(next);
  }, []);

  return <FeedbackContext.Provider value={{ settings, setPreference, setVolume, feedback }}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider');
  return value;
}

export function AudioPreferences({ onLeave }: { onLeave?: () => void } = {}) {
  const { settings, setPreference, setVolume, feedback } = useFeedback();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const vibrationSupported = vibrationAvailable();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const audioControls: Array<{ key: 'music' | 'effects'; label: string; icon: string; volume: VolumePreference }> = [
    { key: 'music', label: 'Música', icon: '♫', volume: 'musicVolume' },
    { key: 'effects', label: 'Efectos', icon: '✦', volume: 'effectsVolume' },
  ];

  return <div className="audio-settings" ref={panel}>
    <button className="audio-settings-button" type="button" aria-label={onLeave ? 'Ajustes y opciones de la mesa' : 'Ajustes de música, efectos y vibración'} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">⚙︎</span><i className={settings.music || settings.effects || (settings.vibration && vibrationSupported) ? 'enabled' : ''}/>
    </button>
    {open && <div className="audio-settings-panel" role="dialog" aria-label="Preferencias de la app">
      <strong>Preferencias</strong>
      {audioControls.map(({ key, label, icon, volume }) => <div className="audio-preference" key={key}>
        <button className="preference-toggle" type="button" role="switch" aria-checked={settings[key]} onClick={() => setPreference(key, !settings[key])}>
          <span className="preference-label"><i aria-hidden="true">{icon}</i>{label}</span><span className={'preference-switch '+(settings[key] ? 'on' : '')} aria-hidden="true"><i/></span>
        </button>
        <div className="preference-volume-line"><label htmlFor={`${key}-volume`}>Volumen</label><output htmlFor={`${key}-volume`}>{settings[volume]}%</output></div>
        <input id={`${key}-volume`} type="range" min="0" max="100" step="1" value={settings[volume]} aria-label={`Volumen de ${label.toLowerCase()}`} onChange={event => setVolume(volume, Number(event.target.value))} onPointerUp={() => { if (key === 'effects') feedback('navigate'); }} onKeyUp={() => { if (key === 'effects') feedback('navigate'); }}/>
      </div>)}
      <div className="audio-preference vibration-preference">
        <button className="preference-toggle" type="button" role="switch" aria-checked={vibrationSupported && settings.vibration} disabled={!vibrationSupported} onClick={() => setPreference('vibration', !settings.vibration)}>
          <span className="preference-label"><i aria-hidden="true">⌁</i>Vibración</span>
          {vibrationSupported ? <span className={'preference-switch '+(settings.vibration ? 'on' : '')} aria-hidden="true"><i/></span> : <span className="preference-unavailable">No disponible</span>}
        </button>
      </div>
      {onLeave && <button className="audio-settings-leave" type="button" onClick={() => { setOpen(false); onLeave(); }}>← Abandonar mesa</button>}
    </div>}
  </div>;
}
