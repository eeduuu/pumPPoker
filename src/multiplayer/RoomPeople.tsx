import type { RoomSnapshot } from './client';

export function RoomPeople({ room, onClose }: { room: RoomSnapshot; onClose: () => void }) {
  const people = [...room.players, ...room.spectators];
  const connected = people.filter(person => person.connection === 'connected').length;
  return <div className="multiplayer-chat-backdrop" onClick={onClose}>
    <section className="multiplayer-people" role="dialog" aria-modal="true" aria-label="Personas de la mesa" onClick={event => event.stopPropagation()}>
      <header><strong>En la mesa · {connected} conectados</strong><button type="button" aria-label="Cerrar lista" onClick={onClose}>×</button></header>
      <div className="multiplayer-people-list">
        {room.players.map(person => <p key={person.id}><strong>{person.name}</strong><span>Jugador · {person.connection === 'connected' ? 'Conectado' : person.connection === 'reconnecting' ? 'Reconectando' : 'Desconectado'}</span></p>)}
        {Array.from({ length: room.botCount }, (_, index) => <p key={`bot-${index}`}><strong>Bot {index + 1}</strong><span>Bot</span></p>)}
        {room.spectators.map(person => <p key={person.id}><strong>{person.name}</strong><span>Espectador · {person.connection === 'connected' ? 'Conectado' : person.connection === 'reconnecting' ? 'Reconectando' : 'Desconectado'}</span></p>)}
      </div>
    </section>
  </div>;
}

export function peopleCount(room: RoomSnapshot) {
  return [...room.players, ...room.spectators].filter(person => person.connection === 'connected').length;
}
