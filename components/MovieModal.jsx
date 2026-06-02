'use client';

import { useEffect } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';

function hueFromTitle(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

function searchQuery(title) {
  return encodeURIComponent(String(title || '').replace(/\(.*?\)/g, '').trim());
}

function ratingLinks(title, ratings) {
  const q = searchQuery(title);
  return [
    {
      key: 'fa',
      label: 'FilmAffinity',
      color: '#0f4c81',
      url: `https://www.filmaffinity.com/es/search.php?stext=${q}`,
      score: null,
    },
    {
      key: 'imdb',
      label: 'IMDb',
      color: '#f5c518',
      dark: true,
      url: `https://www.imdb.com/find/?q=${q}&s=tt`,
      score: ratings?.imdb ? `${ratings.imdb}/10` : null,
    },
    {
      key: 'rt',
      label: 'Rotten Tomatoes',
      color: '#fa320a',
      url: `https://www.rottentomatoes.com/search?search=${q}`,
      score: ratings?.rt ?? null,
    },
    {
      key: 'mc',
      label: 'Metacritic',
      color: '#ffcc33',
      dark: true,
      url: `https://www.metacritic.com/search/${q}/`,
      score: ratings?.metacritic ? `${ratings.metacritic}/100` : null,
    },
  ];
}

export default function MovieModal({ movie, cinema, onClose }) {
  // El padre (Page) ya enriqueció `movie.ratings` desde /api/ratings.
  // Aquí solo presentamos. Si por algún motivo no hay ratings se muestran
  // los enlaces externos sin notas, como antes.
  const ratings = movie.ratings ?? null;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const duration = minutesToHuman(movie.durationMin);
  const hue = hueFromTitle(movie.title || '');
  const links = ratingLinks(movie.title, ratings);
  const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' tráiler oficial')}`;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={movie.title}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="modal-hero">
          <div className="modal-poster">
            {movie.posterUrl ? (
              <img src={movie.posterUrl} alt={`Cartel de ${movie.title}`} />
            ) : (
              <div className="poster-ph" style={{ '--ph-hue': hue }}>
                <span className="ph-title">{movie.title}</span>
              </div>
            )}
          </div>

          <div className="modal-head">
            <h2 className="modal-title">{movie.title}</h2>
            <div className="badges">
              {ratings?.average != null && (
                <span className="badge badge-rating" title="Media IMDb · Rotten Tomatoes · Metacritic">
                  ★ {(ratings.average / 10).toFixed(1)}
                </span>
              )}
              {movie.genre && <span className="badge badge-genre">{movie.genre}</span>}
              {duration && <span className="badge">⏱ {duration}</span>}
              {movie.ageRating && <span className="badge badge-age">{movie.ageRating}</span>}
            </div>
            {cinema && (
              <div className="modal-cinema">
                <span className="cinema-bar" style={{ background: cinema.color }} />
                {cinema.name}
              </div>
            )}
          </div>
        </div>

        {movie.synopsis ? (
          <p className="modal-synopsis">{movie.synopsis}</p>
        ) : (
          <p className="modal-synopsis muted">Sinopsis no disponible. Consulta las valoraciones para saber más.</p>
        )}

        <div className="modal-section">
          <h4 className="modal-h4">Valoraciones</h4>
          <div className="rating-links">
            {links.map((l) => (
              <a
                key={l.key}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="rating-link"
                style={{ '--rl-bg': l.color, '--rl-fg': l.dark ? '#1a1a1a' : '#fff' }}
              >
                {l.score && <span className="rl-score">{l.score}</span>}
                <span className="rl-label">{l.label} ↗</span>
              </a>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h4 className="modal-h4">Sesiones</h4>
          <div className="showtimes">
            {movie.sessions.map((s, i) => {
              const isVose = s.language === 'VOSE';
              const tag = [s.format && s.format !== '2D' ? s.format : null, isVose ? 'VOSE' : null]
                .filter(Boolean)
                .join(' · ');
              const inner = (
                <>
                  <span>{s.time}</span>
                  {tag && <span className="st-tag">{tag}</span>}
                  {s.room && <span className="st-room">{s.room}</span>}
                </>
              );
              const cls = `showtime${isVose ? ' vose' : ''}${s.room && /premium/i.test(s.room) ? ' premium' : ''}`;
              return s.buyUrl ? (
                <a key={i} className={cls} href={s.buyUrl} target="_blank" rel="noreferrer">{inner}</a>
              ) : (
                <span key={i} className={cls}>{inner}</span>
              );
            })}
          </div>
        </div>

        <div className="modal-section">
          <h4 className="modal-h4">Tráiler</h4>
          <a href={trailerUrl} target="_blank" rel="noreferrer" className="trailer-link">
            ▶ Buscar tráiler en YouTube
          </a>
        </div>
      </div>
    </div>
  );
}
