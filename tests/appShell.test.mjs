import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultFeedbackSettings, normalizeFeedbackSettings, normalizeVolume } from '../src/preferences.ts';
import { orderedMusicUrls } from '../src/musicPlaylist.ts';
import { GameAudio } from '../src/audioEngine.ts';
import { playVibration, vibrationAvailable, vibrationPatterns } from '../src/vibration.ts';
import { mobileLayouts } from '../src/seats.ts';
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

test('Las eliminaciones se presentan de una en una durante tres segundos y pausan la mesa', async () => {
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
  assert.match(animation, /feedback\('blast', seat === 0\)/, 'Solo vibra si la explosión ocurre en tu asiento');
  assert.match(animation, /completeCallback\.current\(\)/);
  assert.match(table, /setEliminationIndex\(index=>index\+1\)/);
  assert.match(table, /\|\|eliminationActive\)/, 'El reloj se detiene');
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
  assert.match(table, /portrait\?\[50,97\]:\[50,98\]/, 'La carta propia vuela hasta el asiento inferior sin alterar el reparto de PC');
  assert.match(table, /<div className="table-surface">[\s\S]*<section className=\{"table-stage/);
  assert.match(table, /<section className=\{"player-dock"[\s\S]*<\/section>\s*<\/div>/);
  assert.match(table, /hand\.players\.filter\(p=>p\.cards\.length>0\)\.length\} JUGADORES/, 'El contador incluye a quien recibió cartas, no solo bots');
  assert.match(styles, /\.table-surface\{display:contents\}/, 'El escritorio conserva su estructura actual');
  assert.match(styles, /\.table-surface::before\{[^}]*border-radius:50% \/ 44%/, 'En móvil la mesa es ovalada');
  assert.match(styles, /\.table-surface \.player-dock \.player-row\{[^}]*width:min\(70%,260px\)/, 'Tu asiento se integra en el extremo inferior del óvalo');
  assert.match(styles, /\.table-surface \.player-dock \.raise-panel\{position:absolute;right:0;bottom:0;left:0;height:90px/, 'El panel de subida no añade scroll');
  assert.match(styles, /\.game-shell\.reveal-active \.table-surface \.player-dock \.human-equity\{position:absolute;top:17px;right:6px/, 'El porcentaje propio no queda tapado por las cartas');
  assert.match(styles, /\.seat-count-7,\.seat-count-8\) \.bot-seat\.reveal-showing\{height:58px/, 'Las cartas reveladas de perfiles vecinos no se pisan en móviles bajos');
  assert.match(table, /className="board-rank"/);
  assert.match(table, /className="board-suit"/);
  assert.match(styles, /--mobile-seat-width:clamp\(70px,22vw,90px\)/);
  assert.match(styles, /\.table-stage \.board,\.game-shell\.reveal-active \.table-stage \.board\{width:100%;max-width:none;top:48%/);
  assert.match(styles, /\.community-slots>span,\.game-shell\.reveal-active \.table-stage \.board \.community-slots>span\{flex:0 0 clamp\(54px,17\.5vw,68px\)/, 'La carta revelada gana la prioridad visual frente al diseño compacto anterior');
  assert.match(styles, /\.game-shell\.reveal-active \.table-stage \.board \.community-slots>span\{height:clamp\(62px,19vw,70px\)/, 'La altura también se conserva en móviles bajos');
  assert.match(styles, /\.community-slots \.board-rank,\.community-slots \.board-suit\{[^}]*border:0;[^}]*background:none/, 'Las letras interiores no heredan el marco de una carta completa');
  assert.doesNotMatch(revealStyles, /\.community-slots span\{/, 'El resultado no convierte rango y palo en cartas gigantes');
  assert.match(styles, /\.seat-stack\{font-size:clamp\(13px,3\.7vw,15px\)/);
  assert.match(styles, /\.seat-wager\{padding:1px 4px;font-size:clamp\(10px,3vw,12px\)/);
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

test('La vibración usa señales perceptibles y diferentes sin alargar la partida', () => {
  assert.deepEqual(vibrationPatterns.start, [110, 70, 170]);
  assert.deepEqual(vibrationPatterns.turn, [180, 90, 180]);
  assert.deepEqual(vibrationPatterns.eliminated, [300, 90, 190]);
  assert.ok(Object.values(vibrationPatterns).every(pattern => pattern.reduce((sum, time) => sum + time, 0) < 650));
  const sent = [];
  const device = { vibrate(pattern) { sent.push(pattern); return true; } };
  assert.equal(vibrationAvailable(device), true);
  assert.equal(playVibration('turn', device), true);
  assert.deepEqual(sent, [[180, 90, 180]]);
  assert.equal(playVibration('test', { vibrate: () => false }), false, 'No confirma una solicitud rechazada');
  assert.equal(vibrationAvailable({ vibrate: undefined }), false);
});

test('La app vibra al empezar, al llegar tu turno y solo por tu propia eliminación', async () => {
  const [app, table, animation, preferences] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/EliminationAnimation.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/feedback.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal((app.match(/feedback\('start',true\)/g) || []).length, 2, 'Mesa nueva y nuevo torneo');
  assert.match(table, /if\(canAct&&!wasHumanTurn\.current\)feedback\('turn',true\)/);
  assert.match(animation, /feedback\('blast', seat === 0\)/);
  assert.match(preferences, /kind === 'blast' \? 'eliminated'/);
  assert.match(preferences, /if \(cue\) playVibration\(cue\)/);
  assert.match(preferences, /Probar vibración/);
  assert.match(preferences, /El navegador rechazó la prueba/);
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
  assert.match(table, /feedback\('win',terminalWinner===0\)/, 'Suena para bots y humanos; vibra solo al ganar tú');
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

test('Blackjack queda visible pero bloqueado hasta definir su juego', async () => {
  const source = await readFile(new URL('../src/GameHub.tsx', import.meta.url), 'utf8');
  assert.match(source, /Blackjack/);
  assert.match(source, /Próximamente/);
  assert.match(source, /aria-disabled="true"/);
});

test('La pantalla inicial separa Casino y Mesa y conserva el recorrido a Texas', async () => {
  const [home, hub, modes, app] = await Promise.all([
    readFile(new URL('../src/HomeHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/GameHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/TexasModeHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /useState<'home'\|'hub'\|'texas-mode'\|'texas'>\('home'\)/);
  assert.match(app, /<HomeHub onCasino=\{\(\)=>setScreen\('hub'\)\}/);
  assert.match(app, /<GameHub onTexas=\{\(\)=>setScreen\('texas-mode'\)\} onBack=\{\(\)=>setScreen\('home'\)\}/);
  assert.match(app, /<TexasModeHub onSolo=\{\(\)=>setScreen\('texas'\)\} onBack=\{\(\)=>setScreen\('hub'\)\}/);
  assert.match(home, /<strong>Casino<\/strong>/);
  assert.match(home, /<small>Juegos de casino<\/small>/);
  assert.match(home, /id="player-name"/);
  assert.match(home, /className="game-choice mesa-choice" aria-disabled="true"/);
  assert.match(home, /<strong>Mesa<\/strong><small>Próximamente<\/small>/);
  assert.match(home, /<InstallApp\/>/, 'La instalación está en la pantalla inicial');
  assert.doesNotMatch(hub, /InstallApp/, 'La instalación no se repite dentro de Casino');
  assert.match(hub, /← Inicio/, 'Desde Casino se vuelve a la pantalla inicial');
  assert.match(modes, /<strong>Multijugador<\/strong><small>Próximamente<\/small>/);
  assert.match(modes, /className="game-choice multiplayer-choice" aria-disabled="true"/);
  assert.match(modes, /<strong>1 jugador<\/strong>/);
  assert.match(app, /setTableHand\(null\); setStep\(0\);/, 'Abandonar mesa conserva el regreso a normal o torneo');
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
  assert.match(table, /<section className=\{"table-stage/);
  assert.match(table, /<section className=\{"player-dock/);
  assert.match(reveal, /Cartas ampliadas de/);
  assert.match(reveal, /cards\.map\(card/);
  assert.doesNotMatch(reveal, /onSelect|mano siguiente|mano anterior/);
  assert.match(styles, /\.seat-reveal-window\{display:flex/);
  assert.doesNotMatch(styles, /\.table-stage\{display:none\}/);
});

test('Una victoria por retirada se expresa correctamente para la persona', async () => {
  const table = await readFile(new URL('../src/Table.tsx', import.meta.url), 'utf8');
  assert.match(table, /betting\.winner===0\?'Ganas por retirada'/);
  assert.match(table, /betting\.status==='uncontested'\?uncontestedMessage/);
});
