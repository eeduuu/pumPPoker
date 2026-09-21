import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

export const CELEBRATION_MS = 5000;

function fraction(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return (value >>> 0) / 4294967296;
}

const colors = ['#38d986', '#a7f2bb', '#effff1', '#e9c972', '#fff2c8'];
const pieces = Array.from({ length: 96 }, (_, index) => {
  const delay = Math.round(fraction(index, 1) * 650);
  const spin = 540 + Math.round(fraction(index, 2) * 900);
  const sway = (salt: number, reach: number) => Math.round((fraction(index, salt) * 2 - 1) * reach);
  const left = 4 + fraction(index, 3) * 92;
  const vanishingAt = CELEBRATION_MS - Math.round(fraction(index, 11) * 1750);
  return {
    left,
    delay,
    duration: vanishingAt - delay,
    width: 6 + Math.round(fraction(index, 4) * 5),
    height: 9 + Math.round(fraction(index, 5) * 11),
    spin,
    x1: sway(6, 48), x2: sway(7, 70), x3: sway(8, 86), x4: sway(9, 102), x5: sway(10, 34),
    color: colors[index % colors.length],
  };
});

function VictoryOverlay({ winner, paused, onLeave, onRestart }: { winner: string; paused: boolean; onLeave: () => void; onRestart: () => void }) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const overlay = layer.current;
    if (!overlay?.parentElement) return;
    const siblings = Array.from(overlay.parentElement.children)
      .filter(element => element !== overlay)
      .map(element => ({ element, wasInert: element.hasAttribute('inert') }));
    siblings.forEach(({ element }) => element.setAttribute('inert', ''));
    overlay.focus();
    return () => siblings.forEach(({ element, wasInert }) => {
      if (!wasInert) element.removeAttribute('inert');
    });
  }, []);

  return <div ref={layer} className={'confetti-layer' + (paused ? ' paused' : '')} role="dialog" aria-modal="true" aria-label={`Ganador: ${winner}`} tabIndex={-1}>
    {pieces.map((piece, index) => <i className="confetti-piece" aria-hidden="true" key={index} style={{
      '--confetti-left': `${piece.left}%`,
      '--confetti-delay': `${piece.delay}ms`,
      '--confetti-duration': `${piece.duration}ms`,
      '--confetti-width': `${piece.width}px`,
      '--confetti-height': `${piece.height}px`,
      '--confetti-spin-1': `${piece.spin * .22}deg`,
      '--confetti-spin-2': `${piece.spin * .49}deg`,
      '--confetti-spin-3': `${piece.spin * .74}deg`,
      '--confetti-spin': `${piece.spin}deg`,
      '--confetti-x1': `${piece.x1}px`,
      '--confetti-x2': `${piece.x2}px`,
      '--confetti-x3': `${piece.x3}px`,
      '--confetti-x4': `${piece.x4}px`,
      '--confetti-x5': `${piece.x5}px`,
      '--confetti-color': piece.color,
    } as CSSProperties}/>)}
    <div className="victory-message">
      <h2>Ganador: <strong>{winner}</strong></h2>
    </div>
    <div className="victory-actions">
      <button onClick={onLeave}>Volver al lobby</button>
      <button onClick={onRestart}>Nuevo torneo</button>
    </div>
  </div>;
}

export function Confetti({ active, winner, paused = false, onLeave, onRestart }: { active: boolean; winner: string; paused?: boolean; onLeave: () => void; onRestart: () => void }) {
  return active ? <VictoryOverlay winner={winner} paused={paused} onLeave={onLeave} onRestart={onRestart}/> : null;
}
