import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';

export function BlackjackModeHub({ onSolo, onBack }: { onSolo: () => void; onBack: () => void }) {
  const { feedback } = useFeedback();
  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" onClick={() => { feedback('navigate'); onBack(); }}>← Juegos</button><AudioPreferences/></div></header>
    <section className="game-hub" aria-labelledby="blackjack-mode-title">
      <div className="hub-heading"><p>BLACKJACK</p><h1 id="blackjack-mode-title">¿Cómo quieres jugar?</h1></div>
      <div className="game-choices">
        <div className="game-choice multiplayer-choice" aria-disabled="true">
          <span className="game-choice-icon" aria-hidden="true">2+</span><span><strong>Multijugador</strong><small>Próximamente</small></span><i aria-hidden="true">·</i>
        </div>
        <button className="game-choice solo-choice" type="button" onClick={() => { feedback('navigate'); onSolo(); }}>
          <span className="game-choice-icon" aria-hidden="true">1</span><span><strong>1 jugador</strong><small>Juega contra la banca</small></span><i aria-hidden="true">→</i>
        </button>
      </div>
    </section>
    <div className="bottom">TODO EN UNA SOLA APP.<span>ELIGE Y JUEGA</span></div>
  </main>;
}
