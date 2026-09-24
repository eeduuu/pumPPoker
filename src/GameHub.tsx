import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';
import { InstallApp } from './InstallApp';
import { validPlayerName } from './playerProfile';

export function GameHub({ onTexas, onBlackjack, playerName, onPlayerNameChange }: { onTexas: () => void; onBlackjack: () => void; playerName: string; onPlayerNameChange: (name: string) => void }) {
  const { feedback } = useFeedback();
  const nameReady = validPlayerName(playerName);
  const enterTexas = () => { feedback('navigate'); onTexas(); };
  const enterBlackjack = () => { feedback('navigate'); onBlackjack(); };
  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><AudioPreferences/></header>
    <section className="game-hub" aria-labelledby="game-hub-title">
      <div className="eyebrow">PUMꟼPOKER · JUEGOS DE CARTAS</div>
      <div className="hub-heading"><p>ELIGE TU MESA</p><h1 id="game-hub-title">¿A qué jugamos?</h1></div>
      <label className="player-name-field" htmlFor="player-name">Tu nombre <span>Obligatorio · 2–12 caracteres</span><input id="player-name" type="text" autoComplete="nickname" minLength={2} maxLength={12} required aria-invalid={playerName.length > 0 && !nameReady} placeholder="Escribe tu nombre" value={playerName} onChange={event => onPlayerNameChange(event.target.value)}/></label>
      {!nameReady && <p className="player-name-hint">Escribe tu nombre para jugar. «Bot» está reservado para los bots.</p>}
      <div className="game-choices">
        <button className="game-choice texas-choice" type="button" disabled={!nameReady} onClick={enterTexas}>
          <span className="game-choice-icon" aria-hidden="true">♠</span><span><strong>Texas Hold’em</strong><small>Partida normal o torneo contra bots</small></span><i aria-hidden="true">→</i>
        </button>
        <button className="game-choice blackjack-choice" type="button" disabled={!nameReady} onClick={enterBlackjack}>
          <span className="game-choice-icon" aria-hidden="true">21</span><span><strong>Blackjack</strong><small>Juega contra la banca</small></span><i aria-hidden="true">→</i>
        </button>
      </div>
      <InstallApp/>
    </section>
    <div className="bottom">TODO EN UNA SOLA APP.<span>ELIGE Y JUEGA</span></div>
  </main>;
}
