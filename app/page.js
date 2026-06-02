'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CINEMAS } from '@/lib/cinemas/config.js';
import { buildDayList, longLabel } from '@/lib/dates.js';
import ThemeToggle from '@/components/ThemeToggle.jsx';
import DayTimeline from '@/components/DayTimeline.jsx';
import Filters from '@/components/Filters.jsx';
import CinemaSection from '@/components/CinemaSection.jsx';
import MovieModal from '@/components/MovieModal.jsx';

// ── Caché en localStorage ──────────────────────────────────────────────────────
// Los datos reales de cada cine se pueden perder si el API "now playing" no los
// incluye en consultas nocturnas. Guardamos el resultado completo durante todo
// el día de Madrid y lo servimos instantáneamente en las recargas.

const CACHE_KEY = 'cartelera_v1';

function madridDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function readCache() {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (!s) return null;
    const { day, data } = JSON.parse(s);
    return day === madridDate() ? data : null;
  } catch { return null; }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ day: madridDate(), data }));
  } catch { /* cuota llena — ignorar */ }
}

// Fusión inteligente: conserva sesiones reales (live) aunque el API fresco no las incluya.
// Útil cuando Yelmo/Arte Siete omiten hoy en consultas vespertinas.
function mergeWithCache(fresh, cached) {
  if (!cached?.cinemas || !fresh?.cinemas) return fresh;
  return {
    ...fresh,
    cinemas: fresh.cinemas.map((fc) => {
      const cc = cached.cinemas.find((c) => c.id === fc.id);
      if (!cc) return fc;
      const freshLive = new Set(fc.liveDates ?? []);
      const cachedLive = new Set(cc.liveDates ?? []);
      const mergedByDate = { ...(fc.byDate ?? {}) };
      const mergedLiveDates = [...freshLive];
      for (const iso of cachedLive) {
        if (!freshLive.has(iso) && cc.byDate?.[iso]?.length) {
          mergedByDate[iso] = cc.byDate[iso]; // conservar datos reales del caché
          mergedLiveDates.push(iso);
        }
      }
      return { ...fc, byDate: mergedByDate, liveDates: mergedLiveDates };
    }),
  };
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export default function Page() {
  const days = useMemo(() => buildDayList(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0].iso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [cinemaFilter, setCinemaFilter] = useState('');
  const [active, setActive] = useState(null); // película abierta en el modal

  // Carga ÚNICA: trae todos los días de una vez.
  // Sin refresh: sirve localStorage si existe (mismo día Madrid), luego fetch.
  // Con refresh: siempre fetch, fusiona con caché para no perder sesiones reales.
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      if (!refresh) {
        const cached = readCache();
        if (cached) {
          setData(cached);
          setLoading(false);
          return;
        }
      }
      const res = await fetch(`/api/showtimes${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      const cached = readCache();
      const merged = refresh && cached ? mergeWithCache(json, cached) : json;
      writeCache(merged);
      setData(merged);
    } catch (e) {
      setError('No se pudo cargar la cartelera. Inténtalo de nuevo.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Cartelera del día seleccionado (filtrado en memoria → instantáneo).
  const dayCinemas = useMemo(() => {
    if (!data) return [];
    return data.cinemas.map((c) => ({
      ...c,
      movies: (c.byDate && c.byDate[selectedDate]) || [],
    }));
  }, [data, selectedDate]);

  // Géneros disponibles ese día.
  const genres = useMemo(() => {
    const set = new Set();
    for (const c of dayCinemas) for (const m of c.movies) if (m.genre) set.add(m.genre);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [dayCinemas]);

  // Aplica filtros de búsqueda/género/cine.
  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    return dayCinemas
      .filter((c) => !cinemaFilter || c.id === cinemaFilter)
      .map((c) => ({
        ...c,
        movies: c.movies.filter((m) => {
          if (genre && m.genre !== genre) return false;
          if (q && !normalizeText(m.title).includes(q)) return false;
          return true;
        }),
      }));
  }, [dayCinemas, query, genre, cinemaFilter]);

  const totalMovies = useMemo(
    () => filtered.reduce((acc, c) => acc + c.movies.length, 0),
    [filtered]
  );

  const hasActiveFilters = query || genre || cinemaFilter;
  const updatedTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

  const openMovie = useCallback((movie, cinema) => {
    setActive({ movie, cinema });
  }, []);

  return (
    <>
      {/* CABECERA */}
      <header className="header">
        <div className="container header-inner">
          <div className="brand">
            <span className="brand-logo">🎬</span>
            <div className="brand-text">
              <span className="brand-title">Cartelera Cine Jaime</span>
              <span className="brand-sub">Cines de la Bahía de Cádiz · día a día</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => load(true)} disabled={loading}>
              <span className={loading ? 'spin' : ''}>↻</span>
              <span>{loading ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* TIRA DE DÍAS */}
      <DayTimeline days={days} selected={selectedDate} onSelect={setSelectedDate} />

      <main className="container">
        <div className="toolbar">
          <h1 className="selected-day">{longLabel(selectedDate)}</h1>
          <Filters
            query={query}
            onQuery={setQuery}
            genre={genre}
            onGenre={setGenre}
            cinema={cinemaFilter}
            onCinema={setCinemaFilter}
            genres={genres}
            cinemas={CINEMAS}
          />

          <div className="results-line">
            <span>
              {loading && !data
                ? 'Cargando cartelera…'
                : `${totalMovies} ${totalMovies === 1 ? 'película' : 'películas'} ${
                    hasActiveFilters ? 'tras el filtro' : 'en cartelera'
                  }`}
            </span>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              {data && (
                <span className={`mode-pill ${data.mode === 'sample' ? 'mode-sample' : 'mode-live'}`}>
                  <span className="dot" />
                  {data.mode === 'sample' ? 'datos de ejemplo' : 'datos en vivo'}
                </span>
              )}
              {updatedTime && <span style={{ fontSize: 12 }}>act. {updatedTime}</span>}
            </span>
          </div>
        </div>

        {error ? (
          <div className="empty">
            <div className="em-ic">⚠️</div>
            <h3>Vaya…</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => load(true)} style={{ marginTop: 12 }}>
              Reintentar
            </button>
          </div>
        ) : loading && !data ? (
          <SkeletonGrid />
        ) : totalMovies === 0 ? (
          <div className="empty">
            <div className="em-ic">🍿</div>
            <h3>Sin resultados</h3>
            <p>No hay películas con estos filtros para {longLabel(selectedDate).toLowerCase()}.</p>
          </div>
        ) : (
          filtered.map((c) => <CinemaSection key={c.id} cinema={c} onMovieClick={openMovie} />)
        )}
      </main>

      <footer className="footer">
        <div className="container">
          Cartelera unificada de{' '}
          <strong>Cinesur Bahía de Cádiz</strong>, <strong>Yelmo Bahía Sur</strong>,{' '}
          <strong>Yelmo Jerez</strong> y <strong>Arte Siete El Puerto</strong>.
          <br />
          Hecho con ❤️ para Jaime &amp; equipo · Los horarios pueden cambiar; confirma en la web del cine.
        </div>
      </footer>

      {active && (
        <MovieModal movie={active.movie} cinema={active.cinema} onClose={() => setActive(null)} />
      )}
    </>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ marginTop: 20 }}>
      {[0, 1].map((i) => (
        <section className="cinema" key={i}>
          <div className="cinema-head">
            <span className="cinema-bar" style={{ background: 'var(--border-strong)' }} />
            <div className="cinema-titles">
              <div className="skeleton" style={{ height: 18, width: 220, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: 160 }} />
            </div>
          </div>
          <div className="movies-grid">
            {[0, 1, 2, 3].map((j) => (
              <div className="skeleton sk-card" key={j} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
