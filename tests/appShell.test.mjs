import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultFeedbackSettings, normalizeFeedbackSettings, normalizeVolume } from '../src/preferences.ts';
import { orderedMusicUrls } from '../src/musicPlaylist.ts';
import { GameAudio } from '../src/audioEngine.ts';
import { HapticsService, vibrationPatterns } from '../src/vibration.ts';
import { preselectedAction, validPreselection } from '../src/poker/preselectedAction.ts';
import { fitBoardCenter } from '../src/boardPlacement.ts';
import { mobileLayouts, mobileSeatLeft } from '../src/seats.ts';
import { handSeatStatus, tournamentSeatEliminated, newlyEliminatedSeats } from '../src/seatStatus.ts';
import { displayPlayerName, normalizePlayerName, readPlayerName, savePlayerName } from '../src/playerProfile.ts';

test('Los colores de la mano solo distinguen activos y retirados mientras se juega', () => {
  assert.equal(handSeatStatus(false, 2, false), 'active');
  assert.equal(handSeatStatus(false, 2, true), 'folded');
  assert.equal(handSeatStatus(false, 1, false), null, 'No marca antes de repartir ambas cartas');
  assert.equal(handSeatStatus(false, 0, true), null, 'Un eliminado no es un retirado de esta mano');
  assert.equal(handSeatStatus(true, 2, false), null, 'Al acabar, el ganador vuelve a neutro');
  assert.equal(handSeatStatus(true, 2, true), null, 'Al acabar, el retirado vuelve a neutro');
});

test('La marca roja solo identifica eliminados del torneo, nunca un all-in pendiente', () => {
  assert.equal(tournamentSeatEliminated('normal', 0, true, true), false, 'En partida normal hay recarga');
  assert.equal(tournamentSeatEliminated('tournament', 0, true, false), false, 'Un all-in todavía puede ganar');
  assert.equal(tournamentSeatEliminated('tournament', 0, true, true), true, 'Se marca al repartir el bote');
  assert.equal(tournamentSeatEliminated('tournament', 0, false, false), true, 'Se conserva en las manos siguientes');
  assert.equal(tournamentSeatEliminated('tournament', 1, true, true), false, 'Un jugador con BB sigue vivo');
});

test('La animación se reserva a los recién eliminados y respeta el orden de asientos', () => {
  const dealt = [0, 1, 2, 3].map(seat => ({ seat, stack: seat === 1 ? 0 : 100, committed: seat === 1 ? 100 : 0, cards: seat === 3 ? [] : [{}, {}] }));
  const balances = [{ stack: 0 }, { stack: 0 }, { stack: 125 }, { stack: 0 }];
  assert.deepEqual(newlyEliminatedSeats('tournament', 'preflop-complete', dealt, balances), [], 'El all-in aún no está eliminado');
  assert.deepEqual(newlyEliminatedSeats('normal', 'settled', dealt, balances), [], 'La partida normal recarga BB');
  assert.deepEqual(newlyEliminatedSeats('tournament', 'settled', dealt, balances), [0, 1]);
  assert.deepEqual(newlyEliminatedSeats('tournament', 'uncontested', dealt, balances), [0, 1]);
});

test('Las eliminaciones se presentan de una en una durante tres segundos y esperan antes de la mano siguiente', async () => {
  const [table, animation, styles, audio] = await Promise.all([
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/EliminationAnimation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/elimination-animation.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/audioEngine.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(animation, /ELIMINATION_MS = 3000/);
  assert.match(animation, /IGNITION_AT_MS = 400/);
  assert.match(animation, /FUSE_END_MS = 2350/);
  assert.match(animation, /EXPLOSION_AT_MS = 2450/);
  assert.match(animation, /'--elimination-duration': `\$\{ELIMINATION_MS\}ms`/, 'CSS y temporizadores usan una sola duración');
  assert.match(styles, /animation:elimination-flight var\(--elimination-duration\)/);
  assert.match(styles, /animation:elimination-burst var\(--elimination-duration\)/);
  assert.match(styles, /elimination-reduced var\(--elimination-duration\)/);
  assert.doesNotMatch(styles, /5000ms/, 'La animación ya no conserva tramos de cinco segundos');
  assert.match(animation, /feedback\('ignite'\)/);
  assert.match(animation, /feedback\('blast'\)/, 'El sonido de la explosión es independiente de la vibración');
  assert.match(table, /if\(eliminationSeat===0\)haptic\('ELIMINATED'\)/, 'Solo vibra si la explosión ocurre en tu asiento');
  assert.match(animation, /completeCallback\.current\(\)/);
  assert.match(table, /setEliminationIndex\(index=>index\+1\)/);
  assert.doesNotMatch(table, /eliminationActive/, 'La animación no detiene el reloj de niveles');
  assert.match(table, /\|\|eliminating\)return/, 'La mano siguiente espera');
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(animation, /bomb-body-transparent\.png/, 'La bomba utiliza una imagen con transparencia');
  assert.match(animation, /fuse-burn-mask/, 'La mecha tiene una máscara que se consume');
  assert.match(animation, /getPointAtLength/, 'La brasa recorre el trazado real de la mecha');
  assert.match(animation, /strokeDashoffset = String\(-progress \* 100\)/, 'La mecha desaparece detrás de la brasa');
  assert.match(styles, /elimination-wobble/, 'La bomba se mueve mientras viaja');
  assert.doesNotMatch(styles, /background:#000(?:;|})/, 'La mesa no se apaga por completo');
  assert.match(table, /bomb-body-transparent\.png/, 'La marca final reutiliza el símbolo de la app');
  assert.doesNotMatch(table, /skull-face/, 'La marca final no vuelve a ser una calavera');
  assert.match(audio, /ignite: \[/);
  assert.match(audio, /playBlast\(context, scale\)/);
  assert.match(audio, /createBufferSource\(\)/, 'La explosión usa una ráfaga de ruido, no tonos agudos');
  assert.match(audio, /frequency\.exponentialRampToValueAtTime\(52/, 'El impacto baja de frecuencia');
});

test('El estado de eliminado aparece después de su animación y los botones finales no se duplican', async () => {
  const table = await readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8');
  assert.match(table, /const showEliminatedStatus=\(seat:number\)=>\{[\s\S]*?return index<0\|\|index<eliminationIndex;/);
  assert.match(table, /const humanEliminated=tournamentSeatEliminated\([^\n]+&&showEliminatedStatus\(0\)/);
  assert.match(table, /const eliminated=tournamentSeatEliminated\([^\n]+&&showEliminatedStatus\(seat\)/);
  assert.match(table, /\(spectating\|\|\(outcome\.terminal&&config\.mode!=='tournament'\)\)&&!eliminating&&!celebrating\?<div className="terminal-actions"/);
  assert.match(table, /<Confetti active=\{celebrating\}[^\n]+onLeave=\{onLeave\} onRestart=\{onRestart\}/);
});

test('Las apuestas y el dealer pertenecen a cada asiento y no flotan sobre la mesa', async () => {
  const table = await readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8');
  assert.match(table, /className="seat-heading"/);
  assert.match(table, /className="seat-foot"/);
  assert.match(table, /className="seat-wager"/);
  assert.match(table, /roleBadges\(seat\)/);
  assert.match(table, /roleBadges\(0\)/);
  assert.doesNotMatch(table, /className=\{'table-markers/);
});

test('La mesa móvil usa un óvalo, ocho bots como máximo y tu asiento dentro de la mesa', async () => {
  const [table, styles, revealStyles] = await Promise.all([
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/seat-reveal.css', import.meta.url), 'utf8'),
  ]);
  for (let bots = 1; bots <= 8; bots++) {
    assert.equal(mobileLayouts[bots].length, bots);
    assert.ok(mobileLayouts[bots].every(([x,y]) => x >= 12 && x <= 88 && y >= 12 && y <= 91));
    assert.equal(new Set(mobileLayouts[bots].map(([x,y]) => `${x},${y}`)).size, bots);
  }
  assert.deepEqual(mobileLayouts[8], [[20,91],[12,73],[15,31],[38,12],[62,12],[85,31],[88,73],[80,91]]);
  assert.match(table, /portrait\?mobileLayouts\[config\.bots\]\[i\]/, 'Los perfiles mantienen su identificador horario');
  assert.match(table, /\(portrait\?mobileLayouts:layouts\)\[config\.bots\]\[frame\.flyingSeat-1\]/, 'El reparto apunta al asiento visible');
  assert.match(table, /left: portrait\?mobileSeatLeft\(config\.bots,i\)/, 'Los asientos laterales siguen el borde en cualquier anchura móvil');
  assert.match(table, /const destinationLeft=[^;]*mobileSeatLeft\(config\.bots,frame\.flyingSeat-1\)/, 'Las cartas vuelan a la misma posición que el asiento');
  assert.match(table, /portrait\?\[50,97\]:\[50,98\]/, 'La carta propia vuela hasta el asiento inferior sin alterar el reparto de PC');
  assert.match(table, /<div className="table-surface">[\s\S]*<section ref=\{stageRef\} className=\{"table-stage/);
  assert.match(table, /<section className=\{"player-dock"[\s\S]*<\/section>\s*<\/div>/);
  assert.match(table, /hand\.players\.filter\(p=>p\.cards\.length>0\)\.length\} JUGADORES/, 'El contador incluye a quien recibió cartas, no solo bots');
  assert.match(styles, /\.table-surface\{display:contents\}/, 'El escritorio conserva su estructura actual');
  assert.match(styles, /\.table-surface::before\{[^}]*border-radius:50% \/ 44%/, 'En móvil la mesa es ovalada');
  assert.match(styles, /\.table-surface \.player-dock \.player-row\{[^}]*width:min\(70%,260px\)/, 'Tu asiento se integra en el extremo inferior del óvalo');
  assert.match(styles, /\.table-surface \.player-dock \.raise-panel\{position:absolute;right:0;bottom:0;left:0;height:90px/, 'El panel de subida no añade scroll');
  assert.match(styles, /\.game-shell\.reveal-active \.table-surface \.player-dock \.human-equity\{position:absolute;top:17px;right:6px/, 'El porcentaje propio no queda tapado por las cartas');
  assert.match(styles, /max-height:620px\)[\s\S]*\.seat-count-7,\.seat-count-8\) \.bot-seat\.reveal-showing\{height:56px;min-height:0;padding:1px\}/, 'Las cartas reveladas de perfiles vecinos no se pisan en móviles bajos');
  assert.match(table, /className="board-rank"/);
  assert.match(table, /className="board-suit"/);
  assert.match(styles, /--mobile-seat-width:clamp\(70px,22vw,90px\)/);
  assert.match(styles, /\.table-surface \.table-stage\{[^}]*--mobile-seat-width:clamp\(70px,22vw,90px\)/, 'El ancho del asiento también está disponible para el texto central');
  assert.match(styles, /\.table-stage \.board,\.game-shell\.reveal-active \.table-stage \.board\{width:100%;max-width:none;top:48%/);
  assert.match(styles, /\.community-slots>span,\.game-shell\.reveal-active \.table-stage \.board \.community-slots>span\{flex:0 0 clamp\(54px,17\.5vw,68px\)/, 'La carta revelada gana la prioridad visual frente al diseño compacto anterior');
  assert.match(styles, /\.game-shell\.reveal-active \.table-stage \.board \.community-slots>span\{height:clamp\(62px,19vw,70px\)/, 'La altura también se conserva en móviles bajos');
  assert.match(styles, /\.community-slots \.board-rank,\.community-slots \.board-suit\{[^}]*border:0;[^}]*background:none/, 'Las letras interiores no heredan el marco de una carta completa');
  assert.doesNotMatch(revealStyles, /\.community-slots span\{/, 'El resultado no convierte rango y palo en cartas gigantes');
  assert.match(styles, /\.seat-stack\{font-size:clamp\(13px,3\.7vw,15px\)/);
  assert.match(styles, /\.seat-wager\{padding:1px 4px;font-size:clamp\(10px,3vw,12px\)/);
});

test('Los asientos laterales dejan libre el pasillo central con cualquier número de rivales', () => {
  const sideSeats = { 3: [0, 2], 4: [0, 3], 5: [0, 4], 6: [0, 5], 7: [1, 5], 8: [1, 6] };
  for (let bots = 1; bots <= 8; bots++) {
    for (let seat = 0; seat < bots; seat++) {
      const left = mobileSeatLeft(bots, seat);
      const sideIndex = sideSeats[bots]?.indexOf(seat) ?? -1;
      if (sideIndex === 0) assert.equal(left, 'calc(var(--mobile-seat-width) / 2 + 4px)');
      else if (sideIndex === 1) assert.equal(left, 'calc(100% - var(--mobile-seat-width) / 2 - 4px)');
      else assert.equal(left, `${mobileLayouts[bots][seat][0]}%`);
    }
  }
});

test('La acción anticipada nunca convierte pasar en igualar ni acepta una subida nueva', () => {
  const betting = {
    status: 'playing', pending: [0, 1], actor: 1, bet: 0,
    players: [{ seat: 0, stack: 100, committed: 0, folded: false }, { seat: 1, stack: 100, committed: 0, folded: false }],
  };
  const check = preselectedAction('continue', betting, 0);
  const fold = preselectedAction('fold', betting, 0);
  assert.deepEqual(check, { kind: 'continue', street: 0, action: 'check', due: 0 });
  assert.deepEqual(fold, { kind: 'fold', street: 0 });
  assert.equal(validPreselection(check, betting, 0), check);
  betting.bet = 10;
  assert.equal(validPreselection(check, betting, 0), null, 'Una subida anula pasar');
  assert.equal(validPreselection(fold, betting, 0), fold, 'Retirarse sigue seleccionado');
  const call = preselectedAction('continue', betting, 0);
  assert.deepEqual(call, { kind: 'continue', street: 0, action: 'call', due: 10 });
  betting.bet = 20;
  assert.equal(validPreselection(call, betting, 0), null, 'Una resubida anula igualar');
  assert.equal(validPreselection(fold, betting, 1), fold, 'Retirarse sigue seleccionado al cambiar de calle');
  betting.pending = [1];
  betting.players[0].committed = 20;
  assert.equal(validPreselection(fold, betting, 0), fold, 'Se puede seleccionar después de haber actuado');
  const nextCheck = preselectedAction('continue', betting, 0);
  assert.deepEqual(nextCheck, { kind: 'continue', street: 0, action: 'check', due: 0 });
  betting.status = 'preflop-complete';
  betting.pending = [];
  assert.equal(validPreselection(nextCheck, betting, 0), nextCheck, 'El tic permanece durante la transición');
  betting.status = 'playing';
  betting.bet = 0;
  betting.players[0].committed = 0;
  betting.pending = [0, 1];
  assert.equal(validPreselection(nextCheck, betting, 1), nextCheck, 'Pasar sigue disponible en la calle siguiente');
  betting.bet = 10;
  assert.equal(validPreselection(nextCheck, betting, 1), null, 'Una apuesta en la calle siguiente anula pasar');
  betting.pending = [0, 1];
  betting.players[0].stack = 0;
  assert.equal(preselectedAction('fold', betting, 0), null, 'Un all-in no puede preseleccionar otra acción');
});

test('En móvil el mensaje dispone de dos líneas bajo las cartas y el bote queda encima', async () => {
  const [styles, table] = await Promise.all([
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(styles, /\.table-stage \.board\{--board-card-height:[^}]*display:grid;grid-template-rows:48px var\(--board-card-height\) 18px minmax\(2\.5em,auto\);top:calc\(var\(--board-card-center,49% \+ 28px\) - 48px - var\(--board-card-half\)\);transform:translateX\(-50%\)/, 'La fila de cartas se ancla a la mesa, no a la altura cambiante del mensaje');
  assert.match(styles, /\.game-shell\.reveal-active \.table-surface \.table-stage \.board\{top:calc\(var\(--board-card-center,49% \+ 28px\) - 48px - var\(--board-card-half\)\)\}/, 'Revelar las manos conserva el mismo anclaje de cartas');
  assert.match(styles, /\.table-stage \.pot\{grid-row:1;display:flex;flex-direction:column/);
  assert.match(styles, /\.table-stage \.community-slots\{grid-row:2\}/);
  assert.match(styles, /\.table-stage \.board h1\{grid-row:4;[^}]*min-height:2\.5em/);
  assert.match(styles, /max-height:620px\)[\s\S]*\.table-stage \.board\{--board-card-height:clamp\(58px,19vw,66px\);[^}]*top:calc\(var\(--board-card-center,48% \+ 28px\) - 48px - var\(--board-card-half\)\)/, 'El anclaje también se mantiene en pantallas bajas');
  assert.match(styles, /max-height:620px\)[\s\S]*\.game-shell\.reveal-active \.table-surface \.table-stage \.board\{top:calc\(var\(--board-card-center,48% \+ 28px\) - 48px - var\(--board-card-half\)\)\}/, 'El resultado tampoco desplaza las cartas en pantallas bajas');
  assert.match(styles, /\.table-stage:is\(\.seat-count-3,[^}]*\.board h1\{justify-self:center;width:calc\(100% - 2 \* var\(--mobile-seat-width\) - 16px\)/, 'Los mensajes largos ocupan el pasillo central, no los perfiles laterales');
  assert.match(table, /new ResizeObserver\(place\)/, 'La posición se recalcula si cambian los asientos o la pantalla');
  assert.match(table, /fitBoardCenter\(ideal,cardHeight,bounds,stageRect\.top\+stageRect\.height\/2\)/);
});

test('Las cartas caben entre perfiles laterales sin mover mesas que ya tienen espacio', () => {
  const seats = [{ top: 162, bottom: 216 }, { top: 296, bottom: 350 }];
  const center = fitBoardCenter(271, 63, seats, 250);
  assert.ok(center - 31.5 >= 216, 'No tapa el perfil superior');
  assert.ok(center + 31.5 <= 296, 'No tapa el perfil inferior');
  assert.equal(fitBoardCenter(256, 63, seats, 250), 256, 'No modifica una posición que ya cabe');
  assert.equal(fitBoardCenter(250, 63, [seats[0]], 250), 250, 'Heads-up sin fila inferior conserva el diseño');
});

test('Las dos casillas anticipadas están dentro de sus botones y subir permanece manual', async () => {
  const [table, styles] = await Promise.all([
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
  ]);
  assert.equal((table.match(/className="preselect-toggle"/g) || []).length, 2);
  assert.match(table, /aria-pressed=\{validQueuedAction\?\.kind==='fold'\}/);
  assert.match(table, /aria-pressed=\{validQueuedAction\?\.kind==='continue'\}/);
  assert.match(table, /if\(!canAct\|\|!validQueuedAction\|\|busy\.current\)return;[\s\S]*takeAction\(0,validQueuedAction\.kind==='fold'\?'fold':validQueuedAction\.action\)/);
  assert.match(table, /if\(seat===0\)\{[\s\S]*?setQueuedAction\(null\);\s*\}/, 'Las decisiones de los bots no borran el tic del jugador');
  assert.match(table, /<button className="action-raise"[\s\S]*?>Subir<\/button>/);
  assert.match(styles, /\.game-actions \.action-slot>\.preselect-toggle\{position:absolute;z-index:1;left:0;top:0/);
});

test('Las preferencias tienen valores seguros y conservan elecciones válidas', () => {
  assert.deepEqual(normalizeFeedbackSettings(null), defaultFeedbackSettings);
  assert.deepEqual(normalizeFeedbackSettings({ music: true, effects: false, vibration: false, musicVolume: 100, effectsVolume: 30 }), {
    music: true,
    effects: false,
    vibration: false,
    musicVolume: 100,
    effectsVolume: 30,
  });
  assert.deepEqual(normalizeFeedbackSettings({ music: 'sí' }), defaultFeedbackSettings);
  assert.equal(normalizeFeedbackSettings({ sounds: false }).effects, false, 'Los ajustes anteriores se conservan');
  assert.equal(normalizeVolume(150, 50), 100);
  assert.equal(normalizeVolume(-5, 50), 0);
  assert.equal(normalizeVolume(Number.NaN, 50), 50);
});

test('Los eventos hápticos son semánticos y cada uno usa un solo pulso', () => {
  assert.deepEqual(vibrationPatterns.GAME_START, [180]);
  assert.deepEqual(vibrationPatterns.TURN_START, [270]);
  assert.deepEqual(vibrationPatterns.ELIMINATED, [390]);
  for (const event of ['CHECK', 'CALL', 'RAISE', 'ALL_IN', 'WIN', 'TOURNAMENT_WIN', 'TEST']) {
    assert.ok(vibrationPatterns[event]?.length, `${event} tiene patrón`);
  }
  assert.ok(Object.values(vibrationPatterns).every(pattern => pattern.length === 1 && pattern[0] > 0 && pattern[0] < 650));
});

test('El servicio comprueba API, interacción, visibilidad, ajuste y resultado real', () => {
  const calls = [];
  const device = { userActivation: { hasBeenActive: true }, vibrate(pattern) { calls.push(pattern); return true; } };
  const page = { visibilityState: 'visible' };
  const service = new HapticsService(() => device, () => page);
  assert.deepEqual(service.emit('TURN_START', true), {
    apiAvailable: true, pageVisible: true, hasInteracted: true, enabled: true, called: true, returned: true,
  });
  assert.deepEqual(calls, [[270]]);
  assert.equal(service.emit('CHECK', false).called, false);
  page.visibilityState = 'hidden';
  assert.equal(service.emit('CALL', true).called, false);
  page.visibilityState = 'visible';
  device.userActivation.hasBeenActive = false;
  assert.equal(service.emit('RAISE', true).called, false);
  assert.equal(calls.length, 1, 'Ninguna condición fallida llama al motor');
  device.userActivation.hasBeenActive = true;
  device.vibrate = () => false;
  assert.equal(service.emit('TEST', true).returned, false, 'No confunde rechazo con vibración realizada');
  device.vibrate = () => { throw new Error('bloqueado'); };
  assert.equal(service.emit('TEST', true).returned, false, 'También informa de excepciones');
  device.vibrate = undefined;
  assert.deepEqual(service.emit('TEST', true), {
    apiAvailable: false, pageVisible: true, hasInteracted: true, enabled: true, called: false, returned: null,
  });
});

test('Sin userActivation se acepta únicamente una interacción de confianza registrada', () => {
  const calls = [];
  const service = new HapticsService(() => ({ vibrate(pattern) { calls.push(pattern); return true; } }), () => ({ visibilityState: 'visible' }));
  assert.equal(service.emit('TEST', true).hasInteracted, false);
  service.noteTrustedInteraction();
  assert.equal(service.emit('TEST', true).returned, true);
  assert.equal(calls.length, 1);
});

test('La app emite eventos del usuario y nunca vibra por decisiones de bots', async () => {
  const [app, table, animation, preferences] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/EliminationAnimation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/feedback.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal((app.match(/haptic\('GAME_START'\)/g) || []).length, 2, 'Mesa nueva y nuevo torneo');
  assert.match(table, /if\(canAct&&!wasHumanTurn\.current\)\{feedback\('turn'\);haptic\('TURN_START'\);\}/);
  const actionBlock = table.match(/const takeAction=useCallback\([\s\S]*?\},\[betting,feedback\]\);/)?.[0];
  assert.ok(actionBlock, 'Las acciones siguen gestionándose en la mesa');
  assert.match(actionBlock, /if\(seat===0\)\{\s*setQueuedAction\(null\);\s*\}/);
  assert.doesNotMatch(actionBlock, /haptic\(/, 'Pulsar un botón no añade otra vibración');
  assert.match(table, /if\(eliminationSeat===0\)haptic\('ELIMINATED'\)/);
  assert.match(table, /if\(terminalWinner===0\)haptic\('TOURNAMENT_WIN'\)/);
  assert.match(table, /haptic\('WIN'\)/, 'El aviso por ganar una mano se conserva');
  assert.match(animation, /feedback\('blast'\)/);
  assert.doesNotMatch(preferences, /playVibration/, 'No hay un segundo motor de vibración en la interfaz');
  assert.match(preferences, /Probar vibración/);
  assert.match(preferences, /onClick=\{\(\) => setVibrationReport\(haptic\('TEST'\)\)\}/, 'La pulsación llama directamente al servicio');
  assert.ok(preferences.includes('Solicitud aceptada; si no vibra, revisa el modo silencio y los ajustes del móvil.'), 'El consejo solo acompaña al resultado de la prueba');
  for (const label of ['API disponible:', 'Página visible:', 'Interacción previa:', 'Resultado de navigator.vibrate():']) {
    assert.ok(preferences.includes(label), label);
  }
});

test('El nivel conserva el reloj entre manos y solo lo pausa en los descansos', async () => {
  const [table, clock, setup] = await Promise.all([
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/useLevelClock.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(table, /scheduledBlindLevel\(\{number:1,small:props\.config\.small,big:props\.config\.big\},readElapsed\(\),duration,enabled,props\.config\.chips\*\(props\.config\.bots\+1\)\)/);
  assert.match(table, /stopped\|\|!!intermission/);
  assert.match(table, /useLevelClock\(duration,enabled,stopped\|\|!!intermission,breakLimit\)/);
  assert.match(table, /Descanso pendiente · \$\{nextLevelTime\}/);
  assert.doesNotMatch(table, /onEliminationActive|reset\(\)/, 'Ni la animación ni la mano nueva reinician el reloj');
  assert.match(table, /clockLevelNumber\(elapsedMs,duration,breakLimit\)/);
  assert.doesNotMatch(table, /Subida pendiente/, 'El número del nivel ya indica el avance del reloj');
  assert.match(clock, /Date\.now\(\)/, 'Cuenta también el tiempo mientras la página está oculta');
  assert.match(setup, /se pausa en los descansos/);
});

test('La configuración conserva ambas ciegas libres y explica su proporción', async () => {
  const app = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(app, /numeric\('small', 'Ciega pequeña'/);
  assert.match(app, /numeric\('big', 'Ciega grande'/);
  assert.match(app, /validStartingBlinds\(c\.small,c\.big\)/);
  assert.match(app, /disabled=\{step===2&&!blindsValid\}/);
  assert.match(app, /La ciega pequeña debe estar entre un tercio y dos tercios de la grande/);
  assert.doesNotMatch(app, /Las ciegas se duplican/);
});

test('La música se ordena por nombre y no exige canciones instaladas', async () => {
  assert.deepEqual(orderedMusicUrls({}), []);
  assert.deepEqual(orderedMusicUrls({
    './music/10-final.mp3': '/final.mp3',
    './music/02-segunda.mp3': '/segunda.mp3',
    './music/01-primera.mp3': '/primera.mp3',
  }), ['/primera.mp3', '/segunda.mp3', '/final.mp3']);
  const source = await readFile(new URL('../src/musicLibrary.ts', import.meta.url), 'utf8');
  assert.match(source, /import\.meta\.glob\('\.\/assets\/music\//);
});

test('Una canción se repite y varias avanzan y vuelven a empezar', () => {
  const previous = { Audio: globalThis.Audio, window: globalThis.window, document: globalThis.document };
  const players = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.handlers = {}; this.plays = 0; players.push(this); }
    addEventListener(name, callback) { this.handlers[name] = callback; }
    play() { this.plays++; return Promise.resolve(); }
    pause() {}
    end() { this.handlers.ended(); }
  }
  globalThis.Audio = FakeAudio;
  globalThis.window = { AudioContext: undefined };
  globalThis.document = { hidden: false };
  try {
    const one = new GameAudio(['/uno.mp3']);
    one.setMusic(true, 100);
    assert.equal(players.length, 0, 'Al reabrir no se crea audio antes del primer toque');
    one.unlockMusic();
    assert.equal(players[0].volume, 1);
    players[0].end();
    assert.equal(players[0].src, '/uno.mp3');
    one.dispose();

    const several = new GameAudio(['/uno.mp3', '/dos.mp3']);
    several.setMusic(true, 30);
    several.unlockMusic();
    assert.equal(players[1].volume, 0.3);
    players[1].end();
    assert.equal(players[1].src, '/dos.mp3');
    players[1].end();
    assert.equal(players[1].src, '/uno.mp3');
    several.unlockMusic();
    assert.ok(players[1].plays >= 4, 'Un toque posterior reintenta la reproducción si el navegador la bloqueó');
    several.setMusic(false, 30);
    several.dispose();
  } finally {
    globalThis.Audio = previous.Audio;
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  }
});

test('El menú usa engranaje, dos volúmenes y el nombre Efectos', async () => {
  const source = await readFile(new URL('../src/feedback.tsx', import.meta.url), 'utf8');
  assert.match(source, /⚙/);
  assert.match(source, /label: 'Efectos'/);
  assert.match(source, /musicVolume/);
  assert.match(source, /effectsVolume/);
  assert.match(source, /No disponible/);
  assert.match(source, /kind === 'navigate' && current\.music/);
  assert.match(source, /audio\.unlockMusic\(\)/);
});

test('Abandonar mesa está al final de los ajustes solo durante la partida', async () => {
  const [preferences, table, hub] = await Promise.all([
    readFile(new URL('../src/feedback.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/GameHub.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(table, /<AudioPreferences onLeave=\{onLeave\}\s*\/>/);
  assert.doesNotMatch(table, /className="leave"/);
  assert.match(preferences, /onLeave && <button className="audio-settings-leave"/);
  assert.match(preferences, /setOpen\(false\); onLeave\(\)/);
  assert.match(hub, /<AudioPreferences\s*\/>/);
});

test('El confeti desaparece al caer y el ganador permanece hasta salir o reiniciar', async () => {
  const [source, table, styles, audio] = await Promise.all([
    readFile(new URL('../src/Confetti.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/audioEngine.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /CELEBRATION_MS\s*=\s*5000/);
  assert.match(source, /duration: vanishingAt - delay/, 'Las piezas desaparecen en momentos distintos');
  assert.doesNotMatch(source, /pileDepth/, 'El confeti no se acumula');
  assert.match(source, /Ganador: \$\{winner\}/);
  assert.match(source, /<button onClick=\{onLeave\}>Volver al lobby<\/button>/);
  assert.match(source, /<button onClick=\{onRestart\}>Nuevo torneo<\/button>/);
  assert.doesNotMatch(source, /confetti-backdrop|victory-card|TORNEO FINALIZADO/, 'El texto no tiene panel ni fondo extra');
  assert.match(table, /terminalWinner===null\|\|eliminating/, 'Espera las eliminaciones previas');
  assert.match(table, /feedback\('win'\);if\(terminalWinner===0\)haptic\('TOURNAMENT_WIN'\)/, 'Suena para bots y humanos; vibra solo al ganar tú');
  assert.match(table, /celebrationCompleted\.current=true;/);
  assert.doesNotMatch(table, /setCelebrating\(false\)/, 'La frase no desaparece tras los cinco segundos');
  assert.doesNotMatch(table, /humanWonTournament/, 'La victoria no se limita al humano');
  assert.match(styles, /94%\{opacity:\.45/, 'Se desvanece cerca del borde inferior');
  assert.match(styles, /100%\{opacity:0;transform:translate3d\(var\(--confetti-x5\),calc\(100vh \+ 24px\)/, 'Desaparece al salir por abajo');
  assert.match(styles, /\.victory-message h2/, 'La frase aparece directamente sobre la mesa');
  assert.match(styles, /\.game-shell:has\(\.confetti-layer\) \.terminal-actions\{visibility:hidden\}/, 'No duplica los botones detrás de la celebración');
  assert.doesNotMatch(styles, /\.confetti-backdrop|\.victory-card/, 'No se reintroduce una tarjeta ni un velo');
  assert.match(audio, /playVictory\(context, scale\)/);
});

test('La app instalable usa rutas relativas compatibles con GitHub Pages', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.filter(icon => icon.type === 'image/png').map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons.filter(icon => icon.type === 'image/png')) {
    const png = await readFile(new URL(`../public/${icon.src.replace('./', '')}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /key\.startsWith\('pumpoker-shell-'\)/);
});

test('Blackjack permite elegir modo y jugar en mesa propia sin activar multijugador', async () => {
  const [hub,modes,solo,app] = await Promise.all([
    readFile(new URL('../src/GameHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/BlackjackModeHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(hub, /<button className="game-choice blackjack-choice" type="button" onClick=\{enterBlackjack\}>/);
  assert.match(hub, /<strong>Blackjack<\/strong><small>Juega contra la banca<\/small>/);
  assert.match(modes, /<strong>Multijugador<\/strong><small>Próximamente<\/small>/);
  assert.match(modes, /className="game-choice multiplayer-choice" aria-disabled="true"/);
  assert.match(modes, /<strong>1 jugador<\/strong><small>Juega contra la banca<\/small>/);
  assert.match(solo, /BLACKJACK · 1 JUGADOR/);
  assert.match(solo, /Entrar a la mesa/);
  assert.match(solo, /Apostar y repartir/);
  assert.match(app, /onBlackjack=\{\(\)=>setScreen\('blackjack-mode'\)\}/);
  assert.match(app, /<BlackjackModeHub onSolo=\{\(\)=>setScreen\('blackjack-solo'\)\}/);
  assert.match(app, /<BlackjackSoloHub playerName=\{displayedName\} onBack=\{\(\)=>setScreen\('blackjack-mode'\)\} onLobby=\{\(\)=>setScreen\('hub'\)\}/);
});

test('La pantalla inicial abre directamente Texas y Blackjack, con nombre e instalación', async () => {
  const [hub, modes, multiplayer, app] = await Promise.all([
    readFile(new URL('../src/GameHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/TexasModeHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/TexasMultiplayerHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /useState<'hub'\|'texas-mode'\|'texas-multiplayer'\|'texas'\|'blackjack-mode'\|'blackjack-solo'>\(\(\) => new URLSearchParams/);
  assert.match(app, /\? 'texas-multiplayer' : 'hub'/);
  assert.doesNotMatch(app, /HomeHub|setScreen\('home'\)/);
  assert.match(app, /<GameHub onTexas=\{\(\)=>setScreen\('texas-mode'\)\} onBlackjack=\{\(\)=>setScreen\('blackjack-mode'\)\} playerName=\{playerName\} onPlayerNameChange=\{setPlayerName\}/);
  assert.match(app, /<TexasModeHub onSolo=\{\(\)=>setScreen\('texas'\)\} onMultiplayer=\{\(\)=>setScreen\('texas-multiplayer'\)\} onBack=\{\(\)=>setScreen\('hub'\)\}/);
  assert.match(app, /<TexasMultiplayerHub playerName=\{displayedName\} onBack=\{\(\)=>setScreen\('texas-mode'\)\}/);
  assert.match(hub, /id="player-name"/);
  assert.match(hub, /<InstallApp\/>/, 'La instalación permanece en la pantalla inicial');
  assert.doesNotMatch(hub, /<strong>Casino<\/strong>|className="game-choice mesa-choice"|← Inicio/);
  assert.match(modes, /<strong>Multijugador<\/strong><small>Crear o buscar una mesa<\/small>/);
  assert.match(modes, /onMultiplayer\(\)/);
  assert.match(multiplayer, /<strong>Crear mesa<\/strong>/);
  assert.match(multiplayer, /<strong>Buscar mesa<\/strong>/);
  assert.match(multiplayer, /createRoom/);
  assert.match(multiplayer, /joinRoom/);
  assert.match(multiplayer, /roomSocketUrl/);
  assert.match(modes, /<strong>1 jugador<\/strong>/);
  assert.match(app, /setTableHand\(null\); setStep\(0\);/, 'Abandonar mesa conserva el regreso a normal o torneo');
});

test('Pedir carta mantiene las acciones visibles durante el reparto si el turno continúa', async () => {
  const solo = await readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8');
  assert.match(solo, /setKeepActionsDuringPlayback\(keepActions\)/);
  assert.match(solo, /showTransition\(next, next\.phase === 'playing' && next\.actor === 0\)/);
  assert.match(solo, /game\.phase === 'playing' && \(!playback \|\| keepActionsDuringPlayback\)/);
  assert.match(solo, /const controls = playback \? \[\] : availableActions\(game\)/);
});

test('El nombre es opcional, limitado, persistente y aparece en la mesa y en la victoria', async () => {
  assert.equal(displayPlayerName(''), 'Tú');
  assert.equal(normalizePlayerName('   Ana   María   '), 'Ana María');
  assert.equal(normalizePlayerName('abcdefghijklmnop'), 'abcdefghijkl');
  const previousWindow = globalThis.window;
  const saved = new Map();
  globalThis.window = { localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key),
  } };
  try {
    savePlayerName('  Lucía  ');
    assert.equal(readPlayerName(), 'Lucía');
    savePlayerName('');
    assert.equal(readPlayerName(), '');
  } finally { globalThis.window = previousWindow; }
  const [app, table] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /playerName=\{displayedName\}/);
  assert.match(table, /terminalWinner===0\?playerName/);
  assert.match(table, /const name=\(s:number\)=>s===0\?playerName/);
  assert.match(table, /className="human-name">\{playerName\}/);
});

test('Cada perfil revela sus propias cartas sin panel común ni navegación', async () => {
  const [table, reveal, styles] = await Promise.all([
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/SeatReveal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/seat-reveal.css', import.meta.url), 'utf8'),
  ]);
  assert.match(table, /const compareHands=revealActiveCards&&activeSeats\.length>=2/);
  assert.match(table, /compareHands&&reveal\?<SeatReveal/);
  assert.match(table, /revealLayouts\[config\.bots\]\[i\]/);
  assert.match(table, /<section ref=\{stageRef\} className=\{"table-stage/);
  assert.match(table, /<section className=\{"player-dock/);
  assert.match(reveal, /Cartas ampliadas de/);
  assert.match(reveal, /cards\.map\(card/);
  assert.doesNotMatch(reveal, /onSelect|mano siguiente|mano anterior/);
  assert.match(styles, /\.seat-reveal-window\{display:flex/);
  assert.doesNotMatch(styles, /\.table-stage\{display:none\}/);
});

test('El importe y el estado del resultado están encima de las cartas sin taparlas en móvil', async () => {
  const [styles, reveal] = await Promise.all([
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/SeatReveal.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(reveal, /payout \? 'COBRA' : allIn \? 'ALL-IN' : 'APUESTA'/);
  assert.match(styles, /\.game-shell\.reveal-active \.table-surface \.table-stage \.seat-reveal-cards\{order:2;flex:none\}/);
  assert.match(styles, /\.game-shell\.reveal-active \.table-surface \.table-stage \.seat-reveal-detail\{position:static;order:1;[^}]*flex-direction:column;[^}]*height:25px/);
  assert.match(styles, /\.seat-reveal-detail\.paid\{border-color:[^}]*background:/);
  assert.match(styles, /max-height:620px\)[\s\S]*\.seat-reveal-detail\{height:17px;padding:0 1px\}/);
  assert.doesNotMatch(styles, /\.seat-reveal-card\{padding-bottom:10px\}/);
});

test('Importes largos conservan el valor completo y el turno ilumina solo al asiento que decide', async () => {
  const [styles, reveal, table] = await Promise.all([
    readFile(new URL('../src/app-shell.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/SeatReveal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(reveal, /displayedAmount\.length > 9 \? ' long-amount'/);
  assert.match(reveal, /<strong>\{displayedAmount\}<\/strong>/);
  assert.match(styles, /\.seat-reveal-detail\.long-amount strong\{font-size:10px\}/);
  assert.match(table, /const deciding=frame\.done&&!dealingBoard&&!showingDecision&&betting\.status==='playing'\?betting\.actor:null/);
  assert.match(table, /deciding===seat\?" deciding"/);
  assert.match(table, /deciding===0\?" deciding"/);
  assert.match(styles, /\.bot-seat\.deciding\[data-hand-status=active\]\{border-color:[^}]*radial-gradient/);
  assert.match(styles, /\.player-dock\.deciding \.player-row\{border-color:[^}]*radial-gradient/);
  assert.match(styles, /\.player-dock\.deciding \.player-row\{[^}]*outline:1px solid #5cdb9577/);
  assert.match(styles, /\.player-dock\.deciding \.private-slots\{filter:drop-shadow\(0 0 2px #dbf48c55\)\}/);
});

test('Al completar una acción propia no reaparece el brillo antiguo de las cartas', async () => {
  const table = await readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8');
  assert.match(table, /showingDecision\?\(betting\.last\?\.seat===0\?null:betting\.last\?\.seat\):betting\.actor/);
  assert.match(table, /deciding=frame\.done&&!dealingBoard&&!showingDecision/);
});

test('Una victoria por retirada se expresa correctamente para la persona', async () => {
  const table = await readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8');
  assert.match(table, /betting\.winner===0\?'Ganas por retirada'/);
  assert.match(table, /betting\.status==='uncontested'\?uncontestedMessage/);
});
