'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  goma, crearVelocimetro, movimientoReducido, enScrollHorizontal, alTerminarTransicion,
} from '@/lib/gestos.js';
import { CINEMAS } from '@/lib/cinemas/config.js';
import { buildDayList, longLabel } from '@/lib/dates.js';
import { normalizaGenero } from '@/lib/normalize.js';
import { agruparPeliculas } from '@/lib/cartelera.js';
import { fechaMadrid } from '@/lib/reloj.js';
import ThemeToggle from '@/components/ThemeToggle.jsx';
import DayTimeline from '@/components/DayTimeline.jsx';
import Controles from '@/components/Controles.jsx';
import ListaPeliculas from '@/components/ListaPeliculas.jsx';
import VistaHorario from '@/components/VistaHorario.jsx';
import { Avisos, Esqueleto, Estado } from '@/components/Estados.jsx';
import Icono from '@/components/Icono.jsx';
import MovieModal from '@/components/MovieModal.jsx';
import UpcomingSheet from '@/components/UpcomingSheet.jsx';
import { calcularProximas } from '@/lib/proximas.js';

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

// ── Respaldo por cine, en el propio dispositivo ───────────────────────────────
// Yelmo bloquea a cualquier servidor, así que su cine puede llegar vacío en
// cualquier momento. El servidor guarda su última respuesta buena, pero vive en
// memoria y se pierde en cuanto la función se apaga. Este respaldo está en TU
// móvil: aguanta reinicios del servidor y funciona aunque no haya nada más.
//
// Los horarios ya publicados de un día no cambian, así que enseñarlos avisando
// de cuándo se obtuvieron es mucho mejor que dejar el cine en blanco. Nunca se
// presentan como información fresca.
const RESPALDO_KEY = 'cartelera_respaldo_v1';
// 7 días, como la instantánea de Yelmo: mejor una cartelera avisando de su
// fecha que un cine vacío, y los horarios ya publicados casi nunca cambian.
const RESPALDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function leerRespaldo() {
  try { return JSON.parse(localStorage.getItem(RESPALDO_KEY) || '{}'); }
  catch { return {}; }
}

function guardarRespaldo(cinemas) {
  try {
    const previo = leerRespaldo();
    const ahora = Date.now();
    for (const c of cinemas ?? []) {
      // Solo se guarda lo que vino en vivo: un respaldo nunca se respalda a sí
      // mismo, o acabaríamos arrastrando datos viejos indefinidamente.
      if (c.source === 'live' && Object.keys(c.byDate ?? {}).length) {
        previo[c.id] = { at: ahora, byDate: c.byDate };
      }
    }
    for (const [id, v] of Object.entries(previo)) {
      if (!v?.at || ahora - v.at > RESPALDO_TTL_MS) delete previo[id];
    }
    localStorage.setItem(RESPALDO_KEY, JSON.stringify(previo));
  } catch { /* cuota llena — el respaldo es un extra, no puede romper nada */ }
}

function aplicarRespaldo(data) {
  if (!data?.cinemas) return data;
  const respaldo = leerRespaldo();
  const ahora = Date.now();
  return {
    ...data,
    cinemas: data.cinemas.map((c) => {
      const tieneDatos = Object.keys(c.byDate ?? {}).length > 0;
      if (tieneDatos) return c;
      const r = respaldo[c.id];
      if (!r?.at || ahora - r.at > RESPALDO_TTL_MS) return c;
      return { ...c, byDate: r.byDate, source: 'stale', staleAt: r.at };
    }),
  };
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Sin red y sin caché vigente, todavía queda el respaldo por cine del propio
// dispositivo (hasta 7 días). Se monta una cartelera solo con eso, con cada
// cine marcado como datos guardados y su fecha, para que el aviso diga de
// cuándo son. Si no hay nada guardado, null: entonces sí es un error.
function carteleraDeRespaldo() {
  const respaldo = leerRespaldo();
  const ahora = Date.now();
  let alguno = false;
  const cinemas = CINEMAS.map((c) => {
    const r = respaldo[c.id];
    if (r?.at && ahora - r.at <= RESPALDO_TTL_MS && Object.keys(r.byDate ?? {}).length) {
      alguno = true;
      return { ...c, source: 'stale', staleAt: r.at, reason: 'sin conexión', liveDates: [], byDate: r.byDate };
    }
    return { ...c, source: 'error', reason: 'sin conexión', staleAt: null, liveDates: [], byDate: {} };
  });
  return alguno ? { generatedAt: null, mode: 'live', cinemas } : null;
}

const KBD_SHORTCUTS = [
  { key: '← →', action: 'Día anterior / siguiente' },
  { key: '/', action: 'Buscar película' },
  { key: 'V', action: 'Cambiar entre Películas y Horario' },
  { key: 'T', action: 'Cambiar tema' },
  { key: 'R', action: 'Actualizar cartelera' },
  { key: 'Esc', action: 'Cerrar / limpiar búsqueda' },
  { key: '?', action: 'Mostrar/ocultar esta ayuda' },
];

// "Hoy, viernes 16 de octubre": el título del día dice primero lo que importa.
function tituloDelDia(iso, dias) {
  const d = dias.find((x) => x.iso === iso);
  const largo = longLabel(iso);
  if (d?.isToday) return `Hoy, ${largo.charAt(0).toLowerCase()}${largo.slice(1)}`;
  if (d?.isTomorrow) return `Mañana, ${largo.charAt(0).toLowerCase()}${largo.slice(1)}`;
  return largo;
}

export default function Page() {
  const allDays = useMemo(() => buildDayList(14), []);
  const [selectedDate, setSelectedDate] = useState(allDays[0].iso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [ratings, setRatings] = useState({}); // { title: {imdb, rt, metacritic, average, genre} | null }

  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [genre, setGenre] = useState('');
  // Cines elegidos. Vacío = todos: es el estado normal, no un filtro.
  const [cinemaFilter, setCinemaFilter] = useState([]);
  const [vista, setVista] = useState('peliculas'); // 'peliculas' | 'horario'
  const [active, setActive] = useState(null); // película abierta en la ficha
  const [showKbd, setShowKbd] = useState(false);
  const [verProximas, setVerProximas] = useState(false);

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
  // ¿Hay ya una cartelera en pantalla? Lo necesita load() para no tirarla si
  // falla una actualización.
  const hayDatosRef = useRef(false);
  useEffect(() => { hayDatosRef.current = !!data; }, [data]);

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
          setSinConexion(false);
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
      // Primero guardamos lo bueno de esta respuesta, luego rellenamos los
      // cines que hayan venido vacíos con lo último que sí tuvimos.
      guardarRespaldo(merged.cinemas);
      const conRespaldo = aplicarRespaldo(merged);
      writeCache(conRespaldo);
      setData(conRespaldo);
      setSinConexion(false);
    } catch (e) {
      // Si ya había cartelera en pantalla, se queda: una actualización fallida
      // no tiene por qué dejarte sin nada. Si no la había, se tira del respaldo
      // del dispositivo; y solo si tampoco hay respaldo, es un error.
      if (hayDatosRef.current) {
        setSinConexion(true);
      } else {
        const respaldo = carteleraDeRespaldo();
        if (respaldo) {
          setData(respaldo);
          setSinConexion(true);
        } else {
          setError('No se pudo cargar la cartelera. Inténtalo de nuevo.');
          setData(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Al volver la conexión, se recarga sola si estábamos tirando de lo guardado.
  useEffect(() => {
    if (!sinConexion) return;
    const alVolver = () => load(false);
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [sinConexion, load]);

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

  // Películas ya programadas MÁS ALLÁ de los días de la tira: ciclos y
  // reestrenos que de otro modo solo verías si entras el día justo.
  const proximas = useMemo(
    () => (data ? calcularProximas(data.cinemas, days.at(-1)?.iso, ratings) : []),
    [data, days, ratings]
  );

  // Si el día seleccionado deja de estar en la lista (porque cambió data),
  // movemos la selección al primer día disponible.
  useEffect(() => {
    if (!days.length) return;
    if (!days.some((d) => d.iso === selectedDate)) {
      setSelectedDate(days[0].iso);
    }
  }, [days, selectedDate]);

  // Cartelera del día seleccionado (filtrado en memoria → instantáneo).
  // Aquí mezclamos cada película con sus valoraciones OMDB para que la ficha
  // muestre la nota media y el desglose. Si una película de mk2 no tiene
  // género (mk2 lo ha deshabilitado en su HTML), se usa el primero de OMDB
  // como fallback.
  const dayCinemas = useMemo(() => {
    if (!data) return [];
    return data.cinemas.map((c) => ({
      ...c,
      movies: ((c.byDate && c.byDate[selectedDate]) || []).map((m) => {
        const r = ratings[m.title] || null;
        const fallbackGenre = r?.genre ? r.genre.split(',')[0].trim() : null;
        return {
          ...m,
          // Normalizado aquí, que es el único punto por el que pasan todos:
          // el género del cine y el de respaldo de TMDB/OMDB.
          genre: normalizaGenero(m.genre || fallbackGenre),
          // El cartel de TMDB manda cuando existe: los cines los sirven a
          // tamaños muy dispares y mk2 los pide tan pequeños que se ven
          // borrosos en tablet y escritorio. Así toda la cartelera tiene la
          // misma calidad, no solo Arte Siete.
          posterUrl: r?.poster || m.posterUrl,
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

  // Cines que se ven: sin ninguno elegido, todos.
  const cinesVisibles = useMemo(
    () => (cinemaFilter.length ? dayCinemas.filter((c) => cinemaFilter.includes(c.id)) : dayCinemas),
    [dayCinemas, cinemaFilter]
  );

  // Una entrada por PELÍCULA, juntando la misma de varios cines (ver
  // lib/cartelera.js). Se junta antes de buscar para que un título escrito
  // distinto en cada cine no deje la película partida.
  const peliculasDelDia = useMemo(() => agruparPeliculas(cinesVisibles), [cinesVisibles]);

  const porTitulo = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return peliculasDelDia;
    return peliculasDelDia.filter((p) => p.titulos.some((t) => normalizeText(t).includes(q)));
  }, [peliculasDelDia, query]);

  // Cuántas películas hay de cada género con el resto de filtros puestos: el
  // panel lo enseña para no elegir un género y encontrarse la lista vacía.
  const generosConCuenta = useMemo(
    () => genres.map((g) => ({ nombre: g, cuenta: porTitulo.filter((p) => p.generos.includes(g)).length })),
    [genres, porTitulo]
  );

  const filtered = useMemo(
    () => (genre ? porTitulo.filter((p) => p.generos.includes(genre)) : porTitulo),
    [porTitulo, genre]
  );

  const totalMovies = filtered.length;
  const totalSesiones = useMemo(
    () => filtered.reduce((n, p) => n + p.cines.reduce((m, c) => m + c.sessions.length, 0), 0),
    [filtered]
  );

  // Cines que publican cartelera pero no tienen nada este día: se dice, para
  // que no parezca que se han perdido.
  const sinSesiones = useMemo(
    () => cinesVisibles.filter((c) => c.source === 'live' && c.movies.length === 0),
    [cinesVisibles]
  );

  const hasActiveFilters = !!(query || genre || cinemaFilter.length);
  const updatedTime = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null;

  const openMovie = useCallback((pelicula) => {
    setActive(pelicula);
  }, []);

  const quitarFiltros = useCallback(() => {
    setQuery('');
    setGenre('');
    setCinemaFilter([]);
    setBuscando(false);
  }, []);

  const indiceDia = days.findIndex((d) => d.iso === selectedDate);
  const diaSiguiente = indiceDia > -1 && indiceDia < days.length - 1 ? days[indiceDia + 1] : null;
  const irADiaSiguiente = useCallback(() => {
    if (diaSiguiente) setSelectedDate(diaSiguiente.iso);
  }, [diaSiguiente]);

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
      if (active || verProximas || isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Dentro de un grupo de botones que mueve el foco con las flechas (los
      // cines, la vista, el panel de géneros), ← y → son suyas y no deben
      // cambiar el día por detrás. Se comprueba aquí y no en el componente
      // porque en App Router React engancha los eventos en `document`, el
      // mismo nodo en el que escuchamos: detener la propagación desde el
      // componente no impediría que este manejador se ejecutase.
      const enChipsDeFiltro = document.activeElement?.closest?.('.chip-row, [data-flechas]');

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
        setBuscando(true);
        requestAnimationFrame(() => document.getElementById('search-input')?.focus());
        return;
      }
      if (e.key === 'v' || e.key === 'V') {
        setVista((v) => (v === 'peliculas' ? 'horario' : 'peliculas'));
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
  }, [active, verProximas, days, selectedDate, query, loading, load, showKbd]);

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
      // Paneles que se desplazan en vertical por dentro (el de géneros): ahí
      // un deslizamiento en diagonal es para leer la lista, no para cambiar de día.
      if (e.target.closest?.('[data-sin-gesto]')) { activo = false; return; }
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

  const diaTexto = useMemo(() => {
    const d = days.find((x) => x.iso === selectedDate);
    if (d?.isToday) return 'hoy';
    if (d?.isTomorrow) return 'mañana';
    return `el ${longLabel(selectedDate).toLowerCase()}`;
  }, [days, selectedDate]);

  const esHoy = selectedDate === fechaMadrid();

  let contenido;
  if (error) {
    contenido = (
      <Estado
        icono="alerta"
        titulo="No se pudo cargar la cartelera"
        acciones={
          <button type="button" className="boton boton-principal" onClick={() => load(true)}>
            <Icono nombre="actualizar" />Reintentar
          </button>
        }
      >
        Puede que no haya cobertura o que el servidor no conteste. Vuelve a intentarlo en un momento.
      </Estado>
    );
  } else if (loading && !data) {
    contenido = <Esqueleto />;
  } else if (totalMovies === 0) {
    contenido = query ? (
      <Estado
        icono="lupa"
        titulo={`Nada con «${query.trim()}»`}
        acciones={
          <>
            <button type="button" className="boton boton-principal" onClick={() => setQuery('')}>Borrar la búsqueda</button>
            {(genre || cinemaFilter.length > 0) && (
              <button type="button" className="boton" onClick={quitarFiltros}>Quitar todos los filtros</button>
            )}
          </>
        }
      >
        Ninguna película {diaTexto} tiene ese título{genre || cinemaFilter.length ? ' con los filtros puestos' : ''}.
      </Estado>
    ) : hasActiveFilters ? (
      <Estado
        icono="generos"
        titulo="Nada con estos filtros"
        acciones={<button type="button" className="boton boton-principal" onClick={quitarFiltros}>Quitar filtros</button>}
      >
        No hay películas {diaTexto}
        {genre ? ` de ${genre.toLowerCase()}` : ''}
        {cinemaFilter.length ? ` en ${cinemaFilter.length === 1 ? 'el cine elegido' : 'los cines elegidos'}` : ''}.
      </Estado>
    ) : (
      <Estado icono="calendario" titulo="Sin sesiones este día">
        Ningún cine ha publicado sesiones para {diaTexto}.
      </Estado>
    );
  } else if (vista === 'horario') {
    contenido = <VistaHorario key={selectedDate} peliculas={filtered} fecha={selectedDate} onAbrir={openMovie} />;
  } else {
    contenido = (
      <ListaPeliculas
        key={selectedDate}
        peliculas={filtered}
        fecha={selectedDate}
        onAbrir={openMovie}
        onDiaSiguiente={esHoy && diaSiguiente ? irADiaSiguiente : null}
      />
    );
  }

  return (
    <>
      <a className="saltar" href="#panel-dia">Saltar a la cartelera</a>

      {/* BARRA SUPERIOR: fina, solo marca y acciones */}
      <header className="barra">
        <div className="contenedor barra-dentro">
          <p className="marca" translate="no">
            Cartelera<span className="marca-lugar">Bahía de Cádiz</span>
          </p>
          <div className="header-actions">
            {/* Solo aparece si hay algo que enseñar: es una función de detalle
                y no debe ocupar sitio cuando no hay ciclos programados. */}
            {proximas.length > 0 && (
              <button
                type="button"
                className="boton-icono prox-btn"
                onClick={() => setVerProximas(true)}
                aria-label={`Próximas películas (${proximas.length})`}
                title="Próximas películas"
              >
                <Icono nombre="calendario" />
                <span className="prox-punto" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="boton-icono"
              onClick={() => load(true)}
              disabled={loading}
              aria-label={loading ? 'Actualizando la cartelera' : 'Actualizar la cartelera'}
              title="Actualizar (R)"
            >
              <Icono nombre="actualizar" className={`ico${loading ? ' girando' : ''}`} />
            </button>
            <button
              type="button"
              className="boton-icono kbd-btn"
              onClick={() => setShowKbd((v) => !v)}
              aria-label="Atajos de teclado"
              title="Atajos de teclado (?)"
            >
              <Icono nombre="teclado" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* TIRA DE DÍAS */}
      <DayTimeline days={days} selected={selectedDate} onSelect={setSelectedDate} />

      <main className="contenedor zona" ref={zonaRef}>
        <Controles
          vista={vista}
          onVista={setVista}
          query={query}
          onQuery={setQuery}
          buscando={buscando}
          onBuscando={setBuscando}
          genero={genre}
          generos={generosConCuenta}
          onGenero={setGenre}
          cines={CINEMAS}
          seleccion={cinemaFilter}
          onSeleccion={setCinemaFilter}
        />

        {/* aria-live: al deslizar, el día cambia sin que nadie haya pulsado
            nada, así que sin esto un lector de pantalla no anuncia el cambio. */}
        <h1 className="selected-day" ref={tituloRef} aria-live="polite">
          {tituloDelDia(selectedDate, days)}
        </h1>

        {/* La capa que se desliza. El role cierra el ARIA que la tira de días
            ya empezaba con role="tablist": unas pestañas sin panel al que
            apuntar quedaban incompletas. */}
        <div
          className="dia-panel"
          ref={panelRef}
          role="tabpanel"
          id="panel-dia"
          aria-labelledby={`tab-${selectedDate}`}
          tabIndex={-1}
        >
          {data && !error && (
            <p className="dia-resumen">
              {vista === 'horario'
                ? `${totalSesiones} ${totalSesiones === 1 ? 'sesión' : 'sesiones'}`
                : `${totalMovies} ${totalMovies === 1 ? 'película' : 'películas'}`}
              {hasActiveFilters ? ' con los filtros' : ''}
              {updatedTime && <span className="dia-act"> · act. {updatedTime}</span>}
            </p>
          )}
          {data && !error && (
            <Avisos
              cines={cinesVisibles}
              sinSesiones={sinSesiones}
              sinConexion={sinConexion}
              actualizado={updatedTime ? `act. ${updatedTime}` : null}
              onReintentar={() => load(true)}
            />
          )}
          {contenido}
        </div>
      </main>

      <footer className="pie">
        <div className="contenedor pie-dentro">
          <ul className="pie-cines" aria-label="Los cines">
            {CINEMAS.map((c) => (
              <li key={c.id} data-cine={c.id}>
                <a href={c.website} target="_blank" rel="noopener noreferrer">
                  <span className="punto" aria-hidden="true" />
                  {c.name}
                  <span className="sr"> (web del cine, se abre en otra pestaña)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="pie-nota">Los horarios pueden cambiar: confírmalos en la web del cine antes de ir.</p>
        </div>
      </footer>

      {active && (
        <MovieModal
          // La ficha de la fase anterior espera una película de UN cine: se le
          // da la del primero y, aparte, la lista completa de cines con sus
          // sesiones para que las enseñe todas.
          movie={{ ...active, sessions: active.cines[0]?.sessions ?? [] }}
          cinema={active.cines[0]?.cine ?? null}
          cines={active.cines}
          fecha={selectedDate}
          onClose={() => setActive(null)}
        />
      )}

      {verProximas && (
        <UpcomingSheet peliculas={proximas} onClose={() => setVerProximas(false)} />
      )}

      {/* Panel de atajos de teclado */}
      {showKbd && (
        <div className="kbd-panel" role="dialog" aria-label="Atajos de teclado">
          {/* Clic fuera para cerrar */}
          <div className="kbd-panel-backdrop" onClick={() => setShowKbd(false)} />
          <div className="kbd-panel-inner">
            <div className="kbd-panel-header">
              <h2 className="kbd-panel-titulo">Atajos de teclado</h2>
              <button
                type="button"
                className="boton-icono"
                onClick={() => setShowKbd(false)}
                aria-label="Cerrar"
              >
                <Icono nombre="aspa" />
              </button>
            </div>
            <dl className="kbd-grid">
              {KBD_SHORTCUTS.map(({ key, action }) => (
                <div key={key} className="kbd-row">
                  <dt><kbd className="kbd-key">{key}</kbd></dt>
                  <dd className="kbd-action">{action}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
