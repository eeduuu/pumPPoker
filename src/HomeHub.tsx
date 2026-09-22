import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';
import { InstallApp } from './InstallApp';

export function HomeHub({ onCasino, playerName, onPlayerNameChange }: { onCasino: () => void; playerName: string; onPlayerNameChange: (name: string) => void }) {
  const { feedback } = useFeedback();
  const enterCasino = () => { feedback('navigate'); onCasino(); };

  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><AudioPreferences/></header>
    <section className="game-hub" aria-labelledby="category-hub-title">
      <div className="hub-heading"><p>ELIGE UNA CATEGORÍA</p><h1 id="category-hub-title">¿Dónde jugamos?</h1></div>
      <label className="player-name-field" htmlFor="player-name">Tu nombre <span>Opcional · máximo 12 caracteres</span><input id="player-name" type="text" autoComplete="nickname" maxLength={12} placeholder="Tú" value={playerName} onChange={event => onPlayerNameChange(event.target.value)}/></label>
      <div className="game-choices">
        <button className="game-choice casino-choice" type="button" onClick={enterCasino}>
          <span className="game-choice-icon" aria-hidden="true">♠</span><span><strong>Casino</strong><small>Juegos de casino</small></span><i aria-hidden="true">→</i>
        </button>
        <div className="game-choice mesa-choice" aria-disabled="true">
          <span className="game-choice-icon" aria-hidden="true">▦</span><span><strong>Mesa</strong><small>Próximamente</small></span><i aria-hidden="true">·</i>
        </div>
      </div>
      <InstallApp/>
    </section>
    <div className="bottom">TODO EN UNA SOLA APP.<span>ELIGE Y JUEGA</span></div>
  </main>;
}
