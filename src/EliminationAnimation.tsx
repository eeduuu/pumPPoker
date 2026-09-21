import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import bombBody from './assets/bomb-body-transparent.png';
import './elimination-animation.css';

export const ELIMINATION_MS = 5000;
const EXPLOSION_AT_MS = 4100;
const IGNITION_AT_MS = 650;
const FUSE_END_MS = 3950;
const FUSE_PATH = 'M95 30 C89 41 80 39 79 23 C78 5 66 4 55 5 C43 3 39 9 40 20';

type Target = { dx: number; dy: number; origin: number; scale: number };

export function EliminationAnimation({
  seat, name, onBlast, onComplete, feedback,
}: {
  seat: number;
  name: string;
  onBlast: () => void;
  onComplete: () => void;
  feedback: (kind: 'ignite' | 'blast', vibrate?: boolean) => void;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [paused, setPaused] = useState(document.hidden);
  const layer = useRef<HTMLDivElement>(null);
  const fusePath = useRef<SVGPathElement>(null);
  const burnMask = useRef<SVGPathElement>(null);
  const ember = useRef<SVGGElement>(null);
  const ignitionPlayed = useRef(false);
  const explosionPlayed = useRef(false);
  const blastCallback = useRef(onBlast);
  const completeCallback = useRef(onComplete);
  blastCallback.current = onBlast;
  completeCallback.current = onComplete;

  useEffect(() => {
    const overlay = layer.current;
    if (!overlay?.parentElement) return;
    const siblings = Array.from(overlay.parentElement.children)
      .filter(element => element !== overlay)
      .map(element => ({ element, wasInert: element.hasAttribute('inert') }));
    siblings.forEach(({ element }) => element.setAttribute('inert', ''));
    return () => siblings.forEach(({ element, wasInert }) => {
      if (!wasInert) element.removeAttribute('inert');
    });
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const element = seat === 0
        ? document.querySelector<HTMLElement>('.player-dock .private-slots')
        : document.querySelector<HTMLElement>(`[data-seat="${seat}"]`);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const origin = Math.min(window.innerWidth * .75, window.innerHeight * .5, 420);
      const finalSize = Math.min(rect.width * .88, rect.height * .88, 76);
      setTarget({
        dx: rect.left + rect.width / 2 - window.innerWidth / 2,
        dy: rect.top + rect.height / 2 - window.innerHeight / 2,
        origin,
        scale: finalSize / (origin * .72),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [seat]);

  useEffect(() => {
    if (!target) return;
    layer.current?.focus();
    let elapsed = 0;
    let startedAt = 0;
    let running = false;
    let ignited = ignitionPlayed.current;
    let exploded = explosionPlayed.current;
    let ignitionTimer: ReturnType<typeof setTimeout> | undefined;
    let blastTimer: ReturnType<typeof setTimeout> | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const path = fusePath.current;
    const mask = burnMask.current;
    const spark = ember.current;
    const pathLength = path?.getTotalLength() || 0;
    const paintFuse = (time: number) => {
      if (!path || !mask || !spark || !pathLength) return;
      const progress = Math.max(0, Math.min(1, (time - IGNITION_AT_MS) / (FUSE_END_MS - IGNITION_AT_MS)));
      // Negative offset removes the rope from its lit end, not from the bomb end.
      mask.style.strokeDashoffset = String(-progress * 100);
      const point = path.getPointAtLength(progress * pathLength);
      spark.setAttribute('transform', `translate(${point.x} ${point.y})`);
      spark.style.opacity = time >= IGNITION_AT_MS && time < EXPLOSION_AT_MS ? '1' : '0';
    };
    const tick = () => {
      if (!running) return;
      paintFuse(Math.min(ELIMINATION_MS, elapsed + performance.now() - startedAt));
      frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      if (!running) return;
      elapsed = Math.min(ELIMINATION_MS, elapsed + performance.now() - startedAt);
      running = false;
      clearTimeout(ignitionTimer);
      clearTimeout(blastTimer);
      clearTimeout(endTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      paintFuse(elapsed);
      setPaused(true);
    };
    const resume = () => {
      if (running || document.hidden) return;
      running = true;
      startedAt = performance.now();
      setPaused(false);
      paintFuse(elapsed);
      frame = requestAnimationFrame(tick);
      if (!ignited) ignitionTimer = setTimeout(() => {
        ignited = true;
        ignitionPlayed.current = true;
        feedback('ignite');
      }, Math.max(0, IGNITION_AT_MS - elapsed));
      if (!exploded) blastTimer = setTimeout(() => {
        exploded = true;
        explosionPlayed.current = true;
        blastCallback.current();
        feedback('blast', true);
      }, Math.max(0, EXPLOSION_AT_MS - elapsed));
      endTimer = setTimeout(() => completeCallback.current(), Math.max(0, ELIMINATION_MS - elapsed));
    };
    const onVisibility = () => document.hidden ? pause() : resume();
    document.addEventListener('visibilitychange', onVisibility);
    resume();
    return () => {
      clearTimeout(ignitionTimer);
      clearTimeout(blastTimer);
      clearTimeout(endTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [target !== null, seat, feedback]);

  const variables = target ? {
    '--elimination-dx': `${target.dx}px`,
    '--elimination-dy': `${target.dy}px`,
    '--elimination-dx-16': `${target.dx * .16}px`,
    '--elimination-dy-10': `${target.dy * .1}px`,
    '--elimination-dx-48': `${target.dx * .48}px`,
    '--elimination-dy-43': `${target.dy * .43}px`,
    '--elimination-origin': `${target.origin}px`,
    '--elimination-scale': target.scale,
  } as CSSProperties : undefined;

  return <div ref={layer} className={'elimination-overlay' + (paused ? ' paused' : '')} role="dialog" aria-modal="true" aria-label={`${name} eliminado del torneo`} tabIndex={-1} data-elimination-seat={seat} style={variables}>
    <div className="elimination-shade"/>
    {target && <div className="elimination-symbol" aria-hidden="true">
      <div className="elimination-bomb">
        <img className="elimination-body" src={bombBody} alt=""/>
        <svg className="elimination-fuse" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <defs><mask id={`fuse-mask-${seat}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><path ref={burnMask} className="fuse-burn-mask" pathLength="100" d={FUSE_PATH}/></mask></defs>
          <g mask={`url(#fuse-mask-${seat})`}>
            <path ref={fusePath} className="fuse-outline" d={FUSE_PATH}/>
            <path className="fuse-rope" d={FUSE_PATH}/>
          </g>
          <g ref={ember} className="elimination-ember"><circle className="ember-halo" r="2.4"/><circle className="ember-core" r="1.1"/></g>
        </svg>
      </div>
      <i className="elimination-blast"/>
      {Array.from({ length: 12 }, (_, index) => <i className="elimination-spark" key={index} style={{ '--spark-angle': `${index * 30}deg` } as CSSProperties}/>)}
    </div>}
  </div>;
}
