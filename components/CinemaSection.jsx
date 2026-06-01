import MovieCard from './MovieCard.jsx';

export default function CinemaSection({ cinema }) {
  const movies = cinema.movies || [];
  return (
    <section className="cinema" id={cinema.id}>
      <div className="cinema-head">
        <span className="cinema-bar" style={{ background: cinema.color }} />
        <div className="cinema-titles">
          <div className="cinema-name">{cinema.name}</div>
          <div className="cinema-meta">
            <span>📍 {cinema.venue}, {cinema.city}</span>
            {cinema.source === 'sample' && <span className="mode-pill mode-sample"><span className="dot" /> ejemplo</span>}
            {cinema.source === 'live' && <span className="mode-pill mode-live"><span className="dot" /> en vivo</span>}
          </div>
          {cinema.source === 'sample' && cinema.reason && (
            <div className="cinema-reason" title={cinema.reason}>
              ⚠️ {cinema.reason.length > 80 ? cinema.reason.slice(0, 80) + '…' : cinema.reason}
            </div>
          )}
        </div>
        <span className="cinema-count">
          {movies.length} {movies.length === 1 ? 'película' : 'películas'}
        </span>
      </div>

      {movies.length === 0 ? (
        <div className="cinema-empty">No hay películas que coincidan con el filtro en este cine.</div>
      ) : (
        <div className="movies-grid">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </div>
      )}
    </section>
  );
}
