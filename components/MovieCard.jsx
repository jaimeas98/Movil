'use client';

import { useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';

// Hue determinista a partir del título, para el póster generado.
function hueFromTitle(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

export default function MovieCard({ movie, cinema, onOpen }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = movie.posterUrl && !imgFailed;
  const hue = hueFromTitle(movie.title || '');
  const duration = minutesToHuman(movie.durationMin);

  const open = () => onOpen && onOpen(movie, cinema);

  return (
    <article className="card">
      <button className="card-open" onClick={open} aria-label={`Ver detalles de ${movie.title}`}>
        <div className="poster">
          {showImg ? (
            <img
              src={movie.posterUrl}
              alt={`Cartel de ${movie.title}`}
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="poster-ph" style={{ '--ph-hue': hue }} />
          )}
          {movie.ratings?.average != null && (
            <span className="poster-rating" title="Media IMDb · Rotten Tomatoes · Metacritic">
              ★ {(movie.ratings.average / 10).toFixed(1)}
            </span>
          )}
          {movie.isNew && <span className="poster-new">ESTRENO</span>}
        </div>
      </button>

      <div className="card-body">
        <button className="movie-title-btn" onClick={open}>
          <h3 className="movie-title">{movie.title}</h3>
        </button>

        <div className="badges">
          {movie.ratings?.average != null && (
            <span className="badge badge-rating" title="Media IMDb · Rotten Tomatoes · Metacritic">
              ★ {(movie.ratings.average / 10).toFixed(1)}
            </span>
          )}
          {movie.genre && <span className="badge badge-genre">{movie.genre}</span>}
          {duration && <span className="badge">⏱ {duration}</span>}
          {movie.ageRating && <span className="badge badge-age">{movie.ageRating}</span>}
        </div>

        <div className="showtimes">
          {movie.sessions.map((s, i) => {
            const isVose = s.language === 'VOSE';
            const fmt = s.format && s.format !== '2D' ? s.format : null;
            const tag = [fmt, isVose ? 'VOSE' : null].filter(Boolean).join(' · ');
            const inner = (
              <>
                <span className="st-time">{s.time}</span>
                {tag && <span className="st-tag">{tag}</span>}
              </>
            );
            const cls = `showtime${isVose ? ' vose' : ''}${s.room && /premium/i.test(s.room) ? ' premium' : ''}`;
            return s.buyUrl ? (
              <a key={i} className={cls} href={s.buyUrl} target="_blank" rel="noreferrer" title={s.room || 'Comprar entrada'}>
                {inner}
              </a>
            ) : (
              <span key={i} className={cls} title={s.room || ''}>
                {inner}
              </span>
            );
          })}
        </div>

        <button className="card-detail-link" onClick={open}>Ficha · Valoraciones ↗</button>
      </div>
    </article>
  );
}
