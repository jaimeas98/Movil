'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CINEMAS } from '@/lib/cinemas/config.js';
import { buildDayList, longLabel } from '@/lib/dates.js';
import ThemeToggle from '@/components/ThemeToggle.jsx';
import DayTimeline from '@/components/DayTimeline.jsx';
import Filters from '@/components/Filters.jsx';
import CinemaSection from '@/components/CinemaSection.jsx';

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

  const load = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/showtimes?date=${date}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError('No se pudo cargar la cartelera. Inténtalo de nuevo.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga automática al entrar y cada vez que cambia el día.
  useEffect(() => {
    load(selectedDate);
  }, [selectedDate, load]);

  // Lista de géneros disponibles en la cartelera actual.
  const genres = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    for (const c of data.cinemas) for (const m of c.movies) if (m.genre) set.add(m.genre);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [data]);

  // Aplica los filtros (título, género, cine) a los datos.
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = normalizeText(query.trim());
    return data.cinemas
      .filter((c) => !cinemaFilter || c.id === cinemaFilter)
      .map((c) => ({
        ...c,
        movies: c.movies.filter((m) => {
          if (genre && m.genre !== genre) return false;
          if (q && !normalizeText(m.title).includes(q)) return false;
          return true;
        }),
      }));
  }, [data, query, genre, cinemaFilter]);

  const totalMovies = useMemo(
    () => filtered.reduce((acc, c) => acc + c.movies.length, 0),
    [filtered]
  );

  const hasActiveFilters = query || genre || cinemaFilter;
  const updatedTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

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
            <button className="btn btn-primary" onClick={() => load(selectedDate)} disabled={loading}>
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
        {/* TÍTULO + FILTROS */}
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
              {loading
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

        {/* CONTENIDO */}
        {error ? (
          <div className="empty">
            <div className="em-ic">⚠️</div>
            <h3>Vaya…</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => load(selectedDate)} style={{ marginTop: 12 }}>
              Reintentar
            </button>
          </div>
        ) : loading && !data ? (
          <SkeletonGrid />
        ) : totalMovies === 0 ? (
          <div className="empty">
            <div className="em-ic">🍿</div>
            <h3>Sin resultados</h3>
            <p>No encontramos películas con estos filtros para {longLabel(selectedDate).toLowerCase()}.</p>
          </div>
        ) : (
          filtered.map((c) => <CinemaSection key={c.id} cinema={c} />)
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
