'use client';

import { useEffect, useRef } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';

function hueFromTitle(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

function searchQuery(title) {
  return encodeURIComponent(String(title || '').replace(/\(.*?\)/g, '').trim());
}

// Desglose por fuente. Todo se normaliza a 0-100 (`pct`) para que los tres
// medidores sean comparables aunque IMDb puntúe sobre 10, Rotten en % y
// Metacritic sobre 100. Ojo con esa comparación: el % de Rotten es la
// proporción de críticos que aprueban la película, no una nota media, así que
// escribimos siempre la escala junto a la cifra para no dar gato por liebre.
function ratingSources(title, ratings) {
  const q = searchQuery(title);
  // Las notas llegan como cadenas ("7.4", "85%") y cualquiera puede faltar.
  const num = (v) => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(',', '.').replace('%', ''));
    return Number.isFinite(n) ? n : null;
  };
  const imdb = num(ratings?.imdb);
  const rt   = num(ratings?.rt);
  const mc   = num(ratings?.metacritic);
  const tmdb = num(ratings?.tmdb);

  // El color es el de cada web, y va SOLO en la franja lateral de la ficha:
  // identifica la fuente de un vistazo sin que la marca ajena invada el
  // interior, que se queda con la tipografía y la paleta de la casa.
  return [
    {
      key: 'imdb', label: 'IMDb', scale: '/10', color: '#F5C518',
      value: imdb, display: imdb != null ? imdb.toFixed(1) : null,
      pct: imdb != null ? imdb * 10 : null,
      url: `https://www.imdb.com/find/?q=${q}&s=tt`,
    },
    {
      key: 'rt', label: 'Rotten Tomatoes', scale: '%', color: '#FA320A',
      value: rt, display: rt != null ? String(Math.round(rt)) : null,
      pct: rt,
      url: `https://www.rottentomatoes.com/search?search=${q}`,
    },
    {
      key: 'mc', label: 'Metacritic', scale: '/100', color: '#00CE7A',
      value: mc, display: mc != null ? String(Math.round(mc)) : null,
      pct: mc,
      url: `https://www.metacritic.com/search/${q}/`,
    },
    // TMDB solo aparece cuando ninguna de las tres anteriores tiene nota: es
    // el voto de su comunidad y antes se presentaba como si fuera de IMDb.
    {
      key: 'tmdb', label: 'TMDB', scale: '/10', color: '#01B4E4',
      value: imdb == null && rt == null && mc == null ? tmdb : null,
      display: tmdb != null ? tmdb.toFixed(1) : null,
      pct: tmdb != null ? tmdb * 10 : null,
      url: `https://www.themoviedb.org/search?query=${q}`,
    },
  ].filter((s) => s.value != null);
}

export default function MovieModal({ movie, cinema, onClose }) {
  // El padre (Page) ya enriqueció `movie.ratings` desde /api/ratings.
  // Aquí solo presentamos. Si por algún motivo no hay ratings se muestran
  // los enlaces externos sin notas, como antes.
  const ratings = movie.ratings ?? null;
  const touchStartY = useRef(null);
  const touchStartX = useRef(null);

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

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
    touchStartY.current = null;
    touchStartX.current = null;
    // Close only on downward swipe > 90px that is predominantly vertical
    if (dy > 90 && dy > dx) onClose();
  };

  const duration = minutesToHuman(movie.durationMin);
  const hue = hueFromTitle(movie.title || '');
  const sources = ratingSources(movie.title, ratings);
  const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' tráiler oficial')}`;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={movie.title}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="modal-hero">
          <div className="modal-poster">
            {movie.posterUrl ? (
              <img src={movie.posterUrl} alt={`Cartel de ${movie.title}`} />
            ) : (
              <div className="poster-ph" style={{ '--ph-hue': hue }} />
            )}
          </div>

          <div className="modal-head">
            <h2 className="modal-title">{movie.title}</h2>
            <div className="badges">
              {ratings?.average != null && (
                <span className="badge badge-rating" title="Media de las fuentes disponibles">
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

        {/* La sección entera desaparece si no hay nada que enseñar: antes la
            cabecera "Valoraciones" presidía una rejilla vacía. */}
        {(sources.length > 0 || ratings?.average != null) && (
          <div className="modal-section">
            <div className="ratings-head">
              <h4 className="modal-h4">Valoraciones</h4>
              {ratings?.average != null && (
                <span className="ratings-avg" title="Media de las fuentes disponibles">
                  <span className="ra-label">Media</span>
                  <span className="ra-num">{(ratings.average / 10).toFixed(1)}</span>
                </span>
              )}
            </div>

            {sources.length > 0 && (
              <div className="rating-grid">
                {sources.map((s) => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rsrc"
                    style={{ '--src-color': s.color }}
                    aria-label={`${s.label}: ${s.display}${s.scale}. Abrir en ${s.label}`}
                  >
                    <span className="rsrc-label">{s.label}</span>
                    <span className="rsrc-score">
                      <span className="rsrc-num">{s.display}</span>
                      <span className="rsrc-scale">{s.scale}</span>
                    </span>
                    {/* aria-hidden: el medidor repite en gráfico lo que el
                        aria-label del enlace ya dice con palabras. */}
                    <span className="rsrc-meter" aria-hidden="true">
                      <span
                        className="rsrc-fill"
                        style={{ width: `${Math.max(0, Math.min(100, s.pct))}%` }}
                      />
                    </span>
                  </a>
                ))}
              </div>
            )}

            {/* FilmAffinity no publica nota por API, así que no puede tener
                ficha; pero para público español sigue siendo la referencia. */}
            <a
              className="ratings-more"
              href={`https://www.filmaffinity.com/es/search.php?stext=${searchQuery(movie.title)}`}
              target="_blank"
              rel="noreferrer"
            >
              Ver en FilmAffinity ↗
            </a>
          </div>
        )}

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
                  <span className="st-time">{s.time}</span>
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
            <span className="tl-play" aria-hidden="true">▶</span>
            Buscar tráiler en YouTube
          </a>
        </div>
      </div>
    </div>
  );
}
