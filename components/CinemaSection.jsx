import MovieCard from './MovieCard.jsx';

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
            {cinema.source === 'live' && <span className="mode-pill mode-live"><span className="dot" /> en vivo</span>}
          </div>
        </div>
        <span className="cinema-count">
          {movies.length} {movies.length === 1 ? 'película' : 'películas'}
        </span>
      </div>

      {movies.length === 0 ? (
        <div className="cinema-empty">
          {cinema.source === 'live'
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
