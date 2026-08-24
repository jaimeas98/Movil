'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CINEMAS } from '@/lib/cinemas/config.js';
import { buildDayList, longLabel } from '@/lib/dates.js';
import ThemeToggle from '@/components/ThemeToggle.jsx';
import DayTimeline from '@/components/DayTimeline.jsx';
import Filters from '@/components/Filters.jsx';
import CinemaSection from '@/components/CinemaSection.jsx';
import MovieModal from '@/components/MovieModal.jsx';

// ── Caché en localStorage ──────────────────────────────────────────────────────
// Guardamos la respuesta completa de /api/showtimes para que recargas
// inmediatas sean instantáneas. TTL corto (15 min) para que un redeploy con
// adaptadores corregidos se vea sin tener que pulsar "Actualizar" — antes el
// caché era válido todo el día Madrid y cristalizaba estados defectuosos.
// Bumped la versión de clave (v2) para invalidar caches anteriores con la
// vida útil larga; los usuarios verán datos frescos en su próxima recarga.

const CACHE_KEY = 'cartelera_v3';
const CACHE_TTL_MS = 15 * 60 * 1000;

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
    const { day, at, data } = JSON.parse(s);
    if (day !== madridDate()) return null;
    if (typeof at !== 'number' || Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch { return null; }
}

function writeCache(data) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ day: madridDate(), at: Date.now(), data })
    );
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

const KBD_SHORTCUTS = [
  { key: '← →', action: 'Día anterior / siguiente' },
  { key: '/', action: 'Buscar película' },
  { key: 'T', action: 'Cambiar tema' },
  { key: 'R', action: 'Actualizar cartelera' },
  { key: 'Esc', action: 'Cerrar / limpiar búsqueda' },
  { key: '?', action: 'Mostrar/ocultar esta ayuda' },
];

export default function Page() {
  const allDays = useMemo(() => buildDayList(14), []);
  const [selectedDate, setSelectedDate] = useState(allDays[0].iso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ratings, setRatings] = useState({}); // { title: {imdb, rt, metacritic, average, genre} | null }

  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [cinemaFilter, setCinemaFilter] = useState('');
  const [active, setActive] = useState(null); // película abierta en el modal
  const [showKbd, setShowKbd] = useState(false);

  // Refs for swipe tracking on <main>
  const swipeTouchStartX = useRef(null);
  const swipeTouchStartY = useRef(null);

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
      const res = await fetch(`/api/showtimes${refresh ? '?refresh=1' : ''}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
      });
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

  // Cuando llega data, pedimos las valoraciones en lote (un solo POST con
  // todos los títulos únicos). OMDB tiene cache 24h en el server, así que
  // las recargas posteriores no consumen cuota.
  useEffect(() => {
    if (!data) return;
    const titles = new Set();
    for (const c of data.cinemas) {
      for (const iso of Object.keys(c.byDate || {})) {
        for (const m of c.byDate[iso] || []) if (m.title) titles.add(m.title);
      }
    }
    if (!titles.size) return;
    fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: [...titles] }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.ratings && setRatings(d.ratings))
      .catch(() => {});
  }, [data]);

  // Días con AL MENOS una película en ALGÚN cine. Los días vacíos
  // (típicamente más allá de la ventana de programación de los cines) se
  // ocultan del selector para que no quepa dudas — antes pasaba que
  // aparecían días con datos de muestra falsos y ahora simplemente no
  // existen en la línea de tiempo.
  const days = useMemo(() => {
    if (!data) return allDays;
    return allDays.filter((d) =>
      data.cinemas.some((c) => (c.byDate?.[d.iso]?.length ?? 0) > 0)
    );
  }, [data, allDays]);

  // Si el día seleccionado deja de estar en la lista (porque cambió data),
  // movemos la selección al primer día disponible.
  useEffect(() => {
    if (!days.length) return;
    if (!days.some((d) => d.iso === selectedDate)) {
      setSelectedDate(days[0].iso);
    }
  }, [days, selectedDate]);

  // Cartelera del día seleccionado (filtrado en memoria → instantáneo).
  // Aquí mezclamos cada película con sus valoraciones OMDB para que la card
  // muestre la nota media y el modal el desglose. Si una película de mk2 no
  // tiene género (mk2 lo ha deshabilitado en su HTML), se usa el primero de
  // OMDB como fallback.
  const dayCinemas = useMemo(() => {
    if (!data) return [];
    return data.cinemas.map((c) => ({
      ...c,
      movies: ((c.byDate && c.byDate[selectedDate]) || []).map((m) => {
        const r = ratings[m.title] || null;
        const fallbackGenre = r?.genre ? r.genre.split(',')[0].trim() : null;
        return {
          ...m,
          genre: m.genre || fallbackGenre,
          ratings: r,
        };
      }),
    }));
  }, [data, selectedDate, ratings]);

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

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // Don't fire when user is typing in an input or select
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      // Escape is always allowed (modal handles its own, we handle query clear)
      if (e.key === 'Escape') {
        if (showKbd) { setShowKbd(false); return; }
        if (!active && query) { setQuery(''); }
        return;
      }

      // All other shortcuts: skip when modal is open or user is typing
      if (active || isTyping) return;

      // Dentro de una fila de chips de filtro, ← y → mueven el foco de un chip
      // a otro; no deben cambiar el día por detrás. Se comprueba aquí y no en
      // Filters.jsx porque en App Router React engancha los eventos en
      // `document`, el mismo nodo en el que escuchamos: detener la propagación
      // desde el componente no impediría que este manejador se ejecutase.
      const enChipsDeFiltro = document.activeElement?.closest?.('.chip-row');

      if (e.key === 'ArrowLeft') {
        if (enChipsDeFiltro) return;
        const idx = days.findIndex((d) => d.iso === selectedDate);
        if (idx > 0) setSelectedDate(days[idx - 1].iso);
        return;
      }
      if (e.key === 'ArrowRight') {
        if (enChipsDeFiltro) return;
        const idx = days.findIndex((d) => d.iso === selectedDate);
        if (idx < days.length - 1) setSelectedDate(days[idx + 1].iso);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
        return;
      }
      if (e.key === 't' || e.key === 'T') {
        const root = document.documentElement;
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch {}
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (!loading) load(true);
        return;
      }
      if (e.key === '?') {
        setShowKbd((v) => !v);
        return;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, days, selectedDate, query, loading, load, showKbd]);

  // ── Horizontal swipe on <main> to change day ───────────────────────────────
  const handleMainTouchStart = (e) => {
    swipeTouchStartX.current = e.touches[0].clientX;
    swipeTouchStartY.current = e.touches[0].clientY;
  };

  const handleMainTouchEnd = (e) => {
    if (swipeTouchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeTouchStartY.current);
    swipeTouchStartX.current = null;
    swipeTouchStartY.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > dy) {
      const idx = days.findIndex((d) => d.iso === selectedDate);
      if (dx < 0 && idx < days.length - 1) setSelectedDate(days[idx + 1].iso); // swipe left → next
      if (dx > 0 && idx > 0) setSelectedDate(days[idx - 1].iso);               // swipe right → prev
    }
  };

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
              <span className="btn-label">{loading ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
            <button
              className="btn btn-icon kbd-btn"
              onClick={() => setShowKbd((v) => !v)}
              aria-label="Atajos de teclado"
              title="Atajos de teclado (?)"
            >
              ?
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* TIRA DE DÍAS */}
      <DayTimeline days={days} selected={selectedDate} onSelect={setSelectedDate} />

      <main
        className="container"
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
      >
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
          <strong>Yelmo Área Sur</strong> y <strong>Arte Siete El Puerto</strong>.
          <br />
          Hecho por Jaime · Los horarios pueden cambiar; confirma en la web del cine.
        </div>
      </footer>

      {active && (
        <MovieModal movie={active.movie} cinema={active.cinema} onClose={() => setActive(null)} />
      )}

      {/* Keyboard shortcuts panel */}
      {showKbd && (
        <div className="kbd-panel" role="dialog" aria-label="Atajos de teclado">
          {/* Click outside overlay */}
          <div className="kbd-panel-backdrop" onClick={() => setShowKbd(false)} />
          <div className="kbd-panel-inner">
            <div className="kbd-panel-header">
              <span>Atajos de teclado</span>
              <button
                className="modal-close"
                style={{ position: 'static', width: 28, height: 28, fontSize: 11 }}
                onClick={() => setShowKbd(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="kbd-grid">
              {KBD_SHORTCUTS.map(({ key, action }) => (
                <div key={key} className="kbd-row">
                  <kbd className="kbd-key">{key}</kbd>
                  <span className="kbd-action">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
