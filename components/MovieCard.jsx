'use client';

import { useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';

// Hue determinista a partir del título, para el póster generado.
function hueFromTitle(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

export default function MovieCard({ movie, cinema, onOpen, index = 0 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = movie.posterUrl && !imgFailed;
  const hue = hueFromTitle(movie.title || '');
  const duration = minutesToHuman(movie.durationMin);

  const open = () => onOpen && onOpen(movie, cinema);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };

  return (
    <article className="card" style={{ '--card-i': Math.min(index, 8) }}>
      {/* Póster = área principal clicable. Usamos div con rol button
          (no <button>) para no anidar enlaces de compra dentro de un botón. */}
      <div
        className="poster"
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onKey}
        aria-label={`Ver detalles de ${movie.title}`}
      >
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
        {movie.isNew && <span className="poster-new">Estreno</span>}

        <div className="poster-grad" />

        {/* Siempre visible sobre el póster: título + datos breves */}
        <div className="poster-meta">
          <h3 className="movie-title">{movie.title}</h3>
          <div className="poster-tags">
            {movie.genre && <span className="pt-genre">{movie.genre}</span>}
            {movie.genre && duration && <span className="dot-sep">·</span>}
            {duration && <span>{duration}</span>}
            {movie.ageRating && <span className="dot-sep">·</span>}
            {movie.ageRating && <span>{movie.ageRating}</span>}
          </div>
        </div>
      </div>

      {/* Horarios + ficha. Hermano del póster:
          - escritorio: se superpone al pie del póster al pasar el ratón
          - táctil: fluye debajo del póster (siempre visible) */}
      <div className="poster-reveal">
        <div className="reveal-showtimes">
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
              <a
                key={i}
                className={cls}
                href={s.buyUrl}
                target="_blank"
                rel="noreferrer"
                title={s.room || 'Comprar entrada'}
              >
                {inner}
              </a>
            ) : (
              <span key={i} className={cls} title={s.room || ''}>
                {inner}
              </span>
            );
          })}
        </div>
        <button className="reveal-cta" onClick={open}>Ficha · Valoraciones ↗</button>
      </div>
    </article>
  );
}
