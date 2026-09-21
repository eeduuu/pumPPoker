import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';

export function TexasModeHub({ onSolo, onBack }: { onSolo: () => void; onBack: () => void }) {
  const { feedback } = useFeedback();
  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" onClick={() => { feedback('navigate', true); onBack(); }}>← Juegos</button><AudioPreferences/></div></header>
    <section className="game-hub" aria-labelledby="texas-mode-title">
      <div className="hub-heading"><p>TEXAS HOLD’EM</p><h1 id="texas-mode-title">¿Cómo quieres jugar?</h1></div>
      <div className="game-choices">
        <div className="game-choice multiplayer-choice" aria-disabled="true">
          <span className="game-choice-icon" aria-hidden="true">♠</span><span><strong>Multijugador</strong><small>Próximamente</small></span><i aria-hidden="true">·</i>
        </div>
        <button className="game-choice solo-choice" type="button" onClick={() => { feedback('navigate', true); onSolo(); }}>
          <span className="game-choice-icon" aria-hidden="true">1</span><span><strong>1 jugador</strong><small>Partida normal o torneo contra bots</small></span><i aria-hidden="true">→</i>
        </button>
      </div>
    </section>
    <div className="bottom">TODO EN UNA SOLA APP.<span>ELIGE Y JUEGA</span></div>
  </main>;
}
