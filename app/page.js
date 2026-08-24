'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  goma, crearVelocimetro, movimientoReducido, enScrollHorizontal, alTerminarTransicion,
} from '@/lib/gestos.js';
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

  // ── Refs del gesto horizontal ───────────────────────────────────────────────
  // Todo el gesto vive en refs y en el DOM: si el estado del arrastre estuviera
  // en useState, cada píxel de dedo re-renderizaría la cartelera entera.
  const zonaRef = useRef(null);      // <main>
  const tituloRef = useRef(null);    // h1.selected-day
  const panelRef = useRef(null);     // contenedor de resultados
  const animandoRef = useRef(false);
  const entradaRef = useRef(0);      // dirección de la animación de entrada pendiente
  // Espejos del estado para que el listener táctil tenga dependencias vacías y
  // no se resuscriba en cada render, lo que perdería el gesto a medias.
  // Arrancan vacíos porque `days` se calcula más abajo; los efectos de sincronía
  // los rellenan antes de que ningún gesto pueda leerlos.
  const diasRef = useRef([]);
  const fechaRef = useRef(selectedDate);

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

  useEffect(() => { diasRef.current = days; }, [days]);
  useEffect(() => { fechaRef.current = selectedDate; }, [selectedDate]);

  // ── Deslizar en horizontal para cambiar de día ──────────────────────────────
  // Antes esto era un clasificador que se ejecutaba al soltar: nada leía la
  // posición del dedo mientras se movía, así que el contenido no podía
  // acompañarlo y el día cambiaba de golpe. De ahí la sensación de tosquedad.
  useEffect(() => {
    const zona = zonaRef.current;
    if (!zona) return;

    const reducido = movimientoReducido();
    const capas = () => [tituloRef.current, panelRef.current].filter(Boolean);

    let activo = false;
    let decidido = 0;   // 0 sin decidir, 1 nuestro (horizontal), -1 del scroll
    let x0 = 0, y0 = 0, x = 0;
    let raf = 0;
    const vel = crearVelocimetro();

    const pintar = () => {
      raf = 0;
      const w = zona.clientWidth || 1;
      const p = Math.min(1, Math.abs(x) / w);
      for (const c of capas()) {
        c.style.transform = `translate3d(${x}px, 0, 0)`;
        // Atenuar mientras se va es lo que hace legible que el contenido "se
        // marcha": sin ello parece que la lista se ha descolocado.
        c.style.opacity = String(1 - p * 0.55);
      }
    };

    const indiceActual = () => diasRef.current.findIndex((d) => d.iso === fechaRef.current);

    const alEmpezar = (e) => {
      if (animandoRef.current || e.touches.length !== 1) { activo = false; return; }
      // Regla que se mantiene: si el dedo empieza en una fila de chips, ese
      // deslizamiento es suyo y no cambia de día.
      if (enScrollHorizontal(e.target, zona)) { activo = false; return; }
      const t = e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { activo = false; return; }

      activo = true; decidido = 0; x = 0;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      vel.limpiar(); vel.anotar(0);
    };

    const alMover = (e) => {
      if (!activo) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;

      if (decidido === 0) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;  // aquí NO bloqueamos
        // Sesgo a favor del scroll: casi nadie desliza recto con el pulgar y,
        // sin este margen, bajar con algo de diagonal cambiaba de día sin
        // querer. Ese era medio problema del gesto.
        decidido = Math.abs(dx) > Math.abs(dy) * 1.3 ? 1 : -1;
        if (decidido === -1) { activo = false; return; }
        for (const c of capas()) {
          c.style.transition = 'none';
          c.style.willChange = 'transform, opacity';
        }
        zona.dataset.deslizando = '1';
      }

      e.preventDefault();   // ya es nuestro: nada de desplazarse en diagonal
      const dias = diasRef.current;
      const i = indiceActual();
      const hayDestino = dx < 0 ? i > -1 && i < dias.length - 1 : i > 0;
      const w = zona.clientWidth || 1;
      // En los extremos el contenido cede un poco y vuelve: es la forma de
      // decir "no hay más días" sin un bloqueo seco.
      x = hayDestino ? dx * 0.92 : goma(dx, w * 0.10);
      vel.anotar(x);
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    const volver = () => {
      for (const c of capas()) {
        c.style.transition = 'transform 340ms var(--ease-back), opacity 200ms var(--ease-out)';
        c.style.transform = 'translate3d(0,0,0)';
        c.style.opacity = '1';
      }
      alTerminarTransicion(capas()[0], 'transform', 340, () => {
        for (const c of capas()) { c.style.transition = ''; c.style.willChange = ''; }
        delete zona.dataset.deslizando;
      });
    };

    const salir = (dir, iso) => {
      animandoRef.current = true;
      entradaRef.current = dir;
      const w = zona.clientWidth || 1;
      for (const c of capas()) {
        c.style.transition = 'transform 150ms var(--ease-out), opacity 150ms linear';
        // Un 30% basta para que el contenido salga de la zona de atención.
        // Recorrer el ancho entero obliga a duraciones largas, y ahí es donde
        // una transición empieza a sentirse lenta.
        c.style.transform = `translate3d(${-dir * w * 0.3}px, 0, 0)`;
        c.style.opacity = '0';
      }
      alTerminarTransicion(capas()[0], 'transform', 150, () => setSelectedDate(iso));
    };

    const alSoltar = () => {
      if (!activo) return;
      activo = false;
      if (decidido !== 1) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }

      const w = zona.clientWidth || 1;
      const v = vel.valor();
      const dias = diasRef.current;
      const i = indiceActual();
      const dir = x < 0 ? 1 : -1;          // 1 = día siguiente
      const destino = i > -1 ? dias[i + dir] : null;
      // Distancia O velocidad: antes solo había distancia, así que un gesto
      // rápido y corto no hacía nada y uno lento y largo sí. De ahí que
      // pareciera que "a veces va y a veces no".
      const cambia = !!destino &&
        (Math.abs(x) > w * 0.22 || (Math.abs(v) > 0.45 && Math.abs(x) > 36));

      if (cambia) salir(dir, destino.iso); else volver();
    };

    // Con movimiento reducido, mismo gesto y mismos umbrales pero sin seguir al
    // dedo. La navegación no se pierde.
    const alMoverReducido = (e) => {
      if (!activo) return;
      const dx = e.touches[0].clientX - x0;
      const dy = e.touches[0].clientY - y0;
      if (decidido === 0) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        decidido = Math.abs(dx) > Math.abs(dy) * 1.3 ? 1 : -1;
        if (decidido === -1) { activo = false; return; }
      }
      x = dx;
    };
    const alSoltarReducido = () => {
      if (!activo) return;
      activo = false;
      if (decidido !== 1 || Math.abs(x) < 60) return;
      const dias = diasRef.current;
      const i = indiceActual();
      const destino = i > -1 ? dias[i + (x < 0 ? 1 : -1)] : null;
      if (destino) setSelectedDate(destino.iso);
    };

    const mover = reducido ? alMoverReducido : alMover;
    const soltar = reducido ? alSoltarReducido : alSoltar;

    zona.addEventListener('touchstart', alEmpezar, { passive: true });
    zona.addEventListener('touchmove', mover, { passive: false });
    zona.addEventListener('touchend', soltar, { passive: true });
    zona.addEventListener('touchcancel', soltar, { passive: true });

    return () => {
      zona.removeEventListener('touchstart', alEmpezar);
      zona.removeEventListener('touchmove', mover);
      zona.removeEventListener('touchend', soltar);
      zona.removeEventListener('touchcancel', soltar);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Animación de ENTRADA del día nuevo. Va en useLayoutEffect y no en el
  // manejador del gesto porque tiene que ejecutarse con el DOM nuevo ya montado
  // pero ANTES de pintar: en un useEffect normal se vería un fotograma del
  // contenido nuevo ya colocado en su sitio.
  useLayoutEffect(() => {
    const dir = entradaRef.current;
    if (!dir) return;
    entradaRef.current = 0;

    const zona = zonaRef.current;
    const capas = [tituloRef.current, panelRef.current].filter(Boolean);
    if (!zona || !capas.length) { animandoRef.current = false; return; }

    const w = zona.clientWidth || 1;

    // Si veníamos desplazados por la lista anterior, volvemos arriba AHORA, con
    // el contenido todavía invisible: un salto que nadie llega a ver.
    const barras = document.querySelector('.days')?.getBoundingClientRect().bottom ?? 0;
    const arriba = zona.getBoundingClientRect().top;
    if (arriba < barras - 4) window.scrollBy({ top: arriba - barras, behavior: 'instant' });

    if (movimientoReducido()) {
      for (const c of capas) { c.style.transition = ''; c.style.transform = ''; c.style.opacity = ''; }
      delete zona.dataset.deslizando;
      animandoRef.current = false;
      return;
    }

    for (const c of capas) {
      c.style.transition = 'none';
      c.style.transform = `translate3d(${dir * w * 0.3}px, 0, 0)`;
      c.style.opacity = '0';
    }
    // Lectura forzada de layout: obliga al navegador a "ver" el punto de
    // partida. Sin esto agruparía ambos estilos en el mismo recálculo y no
    // habría transición, solo un salto.
    void capas[0].offsetWidth;

    requestAnimationFrame(() => {
      for (const c of capas) {
        c.style.transition = 'transform 260ms var(--ease-out), opacity 190ms linear';
        c.style.transform = 'translate3d(0,0,0)';
        c.style.opacity = '1';
      }
      alTerminarTransicion(capas[0], 'transform', 260, () => {
        for (const c of capas) {
          c.style.transition = ''; c.style.willChange = '';
          c.style.transform = ''; c.style.opacity = '';
        }
        delete zona.dataset.deslizando;
        animandoRef.current = false;
      });
    });
  }, [selectedDate]);

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

      <main className="container" ref={zonaRef}>
        <div className="toolbar">
          {/* aria-live: al deslizar, el día cambia sin que nadie haya pulsado
              nada, así que sin esto un lector de pantalla no anuncia el cambio. */}
          <h1 className="selected-day" ref={tituloRef} aria-live="polite">
            {longLabel(selectedDate)}
          </h1>
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

        {/* La capa que se desliza. El role cierra el ARIA que la tira de días
            ya empezaba con role="tablist": unas pestañas sin panel al que
            apuntar quedaban incompletas. */}
        <div
          className="dia-panel"
          ref={panelRef}
          role="tabpanel"
          id="panel-dia"
          aria-labelledby={`tab-${selectedDate}`}
        >
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
        </div>
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
