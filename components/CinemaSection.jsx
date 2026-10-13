import MovieCard from './MovieCard.jsx';

// "de 18:03" si es de hoy; "del lun 12, 18:03" si es de otro día, que con
// datos de hace días la hora sola engañaría.
function deCuando(ms) {
  if (!ms) return 'de antes';
  const d = new Date(ms);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  const dia = (x) => x.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  if (dia(d) === dia(new Date())) return `de ${hora}`;
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Madrid' });
  return `del ${fecha.replace('.', '')}, ${hora}`;
}

export default function CinemaSection({ cinema, onMovieClick }) {
  const movies = cinema.movies || [];
  return (
    <section className="cinema" id={cinema.id}>
      <div className="cinema-head">
        <span className="cinema-bar" style={{ background: cinema.color }} />
        <div className="cinema-titles">
          <div className="cinema-name">{cinema.name}</div>
          <div className="cinema-meta">
            <span>📍 {cinema.venue}, {cinema.city}</span>
            {cinema.source === 'error' && <span className="mode-pill mode-sample"><span className="dot" /> sin conexión</span>}
            {/* Nunca presentar datos guardados como si fueran de ahora mismo */}
            {cinema.source === 'stale' && (
              <span className="mode-pill mode-sample" title={cinema.reason || ''}>
                <span className="dot" /> datos {deCuando(cinema.staleAt)}
              </span>
            )}
            {cinema.source === 'live' && <span className="mode-pill mode-live"><span className="dot" /> en vivo</span>}
          </div>
        </div>
        <span className="cinema-count">
          {movies.length} {movies.length === 1 ? 'película' : 'películas'}
        </span>
      </div>

      {movies.length === 0 ? (
        <div className="cinema-empty">
          {/* Distinguir los tres casos importa: si el cine no responde, decir
              "no tiene sesiones" es mentir, y decir "no coincide con el filtro"
              manda a buscar el problema donde no está. */}
          {cinema.source === 'error'
            ? 'No hemos podido conectar con este cine. Consulta su web o vuelve a intentarlo más tarde.'
            : cinema.source === 'live'
              ? 'Este cine no tiene sesiones publicadas para este día.'
              : 'No hay películas que coincidan con el filtro en este cine.'}
        </div>
      ) : (
        <div className="movies-grid">
          {movies.map((m, i) => (
            <MovieCard key={m.id} movie={m} cinema={cinema} onOpen={onMovieClick} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
