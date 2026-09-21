import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';

export function GameHub({ onTexas, onBack }: { onTexas: () => void; onBack: () => void }) {
  const { feedback } = useFeedback();
  const enterTexas = () => { feedback('navigate', true); onTexas(); };
  const returnHome = () => { feedback('navigate', true); onBack(); };
  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" onClick={returnHome}>← Inicio</button><AudioPreferences/></div></header>
    <section className="game-hub" aria-labelledby="game-hub-title">
      <div className="eyebrow">PUMꟼPOKER · JUEGOS DE CARTAS</div>
      <div className="hub-heading"><p>ELIGE TU MESA</p><h1 id="game-hub-title">¿A qué jugamos?</h1></div>
      <div className="game-choices">
        <button className="game-choice texas-choice" type="button" onClick={enterTexas}>
          <span className="game-choice-icon" aria-hidden="true">♠</span><span><strong>Texas Hold’em</strong><small>Partida normal o torneo contra bots</small></span><i aria-hidden="true">→</i>
        </button>
        <div className="game-choice blackjack-choice" aria-disabled="true">
          <span className="game-choice-icon" aria-hidden="true">21</span><span><strong>Blackjack</strong><small>Próximamente</small></span><i aria-hidden="true">♣</i>
        </div>
      </div>
    </section>
    <div className="bottom">TODO EN UNA SOLA APP.<span>ELIGE Y JUEGA</span></div>
  </main>;
}
