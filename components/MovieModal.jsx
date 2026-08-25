'use client';

import { useEffect, useRef } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { goma, crearVelocimetro, movimientoReducido, alTerminarTransicion } from '@/lib/gestos.js';
import { bloquearScroll, desbloquearScroll } from '@/lib/bloqueoScroll.js';

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

// ── Parámetros del gesto de cerrar ────────────────────────────────────────────
const HOLGURA = 3;              // px por debajo de los cuales aún no decidimos
const UMBRAL_FRACCION = 0.26;   // 26% del alto de pantalla
const UMBRAL_VELOCIDAD = 0.55;  // px/ms ≈ 550 px/s: un lanzamiento claro
const RECORRIDO_MINIMO = 40;    // un lanzamiento tiene que haber recorrido algo

export default function MovieModal({ movie, cinema, onClose }) {
  // El padre (Page) ya enriqueció `movie.ratings` desde /api/ratings.
  // Aquí solo presentamos. Si por algún motivo no hay ratings se muestran
  // los enlaces externos sin notas, como antes.
  const ratings = movie.ratings ?? null;

  const capaRef = useRef(null);   // .modal-overlay — es el que hace scroll
  const hojaRef = useRef(null);   // .modal — es el que se mueve

  // onClose llega como función nueva en cada render del padre. Guardarlo en un
  // ref permite que los efectos de abajo tengan dependencias vacías y no se
  // resuscriban solos (lo que, con el bloqueo de scroll dentro, provocaría
  // desbloquear y rebloquear el documento a cada rato).
  const cerrarRef = useRef(onClose);
  useEffect(() => { cerrarRef.current = onClose; });

  // ── Teclado, foco y bloqueo del documento ───────────────────────────────────
  useEffect(() => {
    const hoja = hojaRef.current;
    const anterior = document.activeElement;

    bloquearScroll();
    // Sin esto el foco se quedaba en el póster de detrás y el tabulador
    // paseaba por una página que ya no se ve.
    hoja?.focus({ preventScroll: true });

    const alTeclear = (e) => {
      if (e.key === 'Escape') { cerrarRef.current?.(); return; }
      if (e.key !== 'Tab' || !hoja) return;
      const focos = hoja.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };

    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      desbloquearScroll();                          // primero devolver el scroll…
      anterior?.focus?.({ preventScroll: true });   // …y luego el foco
    };
  }, []);

  // ── Arrastrar para cerrar ───────────────────────────────────────────────────
  useEffect(() => {
    const hoja = hojaRef.current;
    const capa = capaRef.current;
    if (!hoja || !capa) return;

    const reducido = movimientoReducido();

    let activo = false;
    let decidido = 0;   // 0 sin decidir, 1 el gesto es nuestro, -1 es del scroll
    let y0 = 0, x0 = 0, y = 0;
    let raf = 0;
    let cerrando = false;
    let finArrastre = 0;
    const vel = crearVelocimetro();

    // Un solo escritor de estilos, dentro de rAF: escribir el transform en cada
    // touchmove encola varios estilos por frame y el navegador acaba
    // componiendo con retraso.
    // La hoja SOLO se desplaza; lo que se atenúa es el velo. Es como se
    // comportan las hojas de las apps: escalar o difuminar la propia hoja la
    // despega del dedo y delata que es una animación en vez de un objeto.
    const pintar = () => {
      raf = 0;
      const p = Math.min(1, Math.abs(y) / (hoja.offsetHeight || window.innerHeight));
      hoja.style.transform = `translate3d(0, ${y}px, 0)`;
      capa.style.opacity = String(1 - p * 0.6);
    };

    const limpiarEstilos = () => {
      hoja.style.transition = '';
      hoja.style.willChange = '';
      hoja.style.overflowY = '';
    };

    const volverASitio = () => {
      // Rebote muy contenido a propósito: con el muelle del proyecto (que se
      // pasa un 56%) la ficha se salía por arriba y parecía un error.
      hoja.style.transition = 'transform 380ms var(--ease-back)';
      hoja.style.transform = 'translate3d(0,0,0)';
      capa.style.transition = 'opacity 220ms var(--ease-out)';
      capa.style.opacity = '1';
      alTerminarTransicion(hoja, 'transform', 380, () => {
        limpiarEstilos();
        capa.style.transition = '';
      });
    };

    const salir = (desde, v) => {
      cerrando = true;
      hoja.style.overflowY = 'hidden';
      const restante = Math.max(1, (hoja.offsetHeight || window.innerHeight) - desde);
      // La duración sale de la velocidad REAL del dedo, no de una constante: si
      // lo lanzas sale disparada, si lo empujas justo hasta el umbral se va
      // despacio. Eso es lo que se percibe como que acompaña.
      const ms = Math.round(Math.min(320, Math.max(130, restante / Math.max(0.7, v))));
      hoja.style.transition = `transform ${ms}ms var(--ease-out)`;
      hoja.style.transform = `translate3d(0, ${hoja.offsetHeight || window.innerHeight}px, 0)`;
      capa.style.transition = `opacity ${ms}ms linear`;
      capa.style.opacity = '0';
      alTerminarTransicion(hoja, 'transform', ms, () => cerrarRef.current?.());
    };

    const alEmpezar = (e) => {
      if (cerrando || e.touches.length !== 1) { activo = false; return; }
      const enTirador = !!e.target.closest?.('[data-tirador]');
      // Desde el tirador siempre se puede arrastrar. Desde el cuerpo, solo si
      // ya estás arriba del todo: si vas por la mitad, bajar el dedo significa
      // "sigue leyendo hacia arriba". Es la regla de cualquier hoja inferior.
      if (!enTirador && hoja.scrollTop > 0) { activo = false; return; }

      activo = true; decidido = 0; y = 0;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      vel.limpiar(); vel.anotar(0);

      hoja.style.transition = 'none';
      // La animación de entrada también anima transform y, mientras sigue viva,
      // gana a cualquier estilo en línea: sin apagarla, agarrar la ficha en los
      // primeros instantes no la movería.
      hoja.style.animation = 'none';
      // will-change solo durante el gesto: dejarlo en el CSS mantendría una
      // capa de composición reservada de forma permanente.
      hoja.style.willChange = 'transform, opacity';
    };

    const alMover = (e) => {
      if (!activo) return;
      const dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;

      if (decidido === 0) {
        if (Math.abs(dy) < HOLGURA && Math.abs(dx) < HOLGURA) {
          // Bloqueamos estos primeros píxeles mientras decidimos. Aquí no se
          // pierde nada porque la capa ya está arriba del todo, y es justo la
          // ventana en la que iOS se compromete con el "tirar para recargar".
          e.preventDefault();
          return;
        }
        decidido = (dy > 0 && Math.abs(dy) > Math.abs(dx)) ? 1 : -1;
        if (decidido === -1) {
          // No es nuestro: nos apartamos y no volvemos a llamar a
          // preventDefault en este gesto, así el scroll interno queda intacto.
          activo = false;
          limpiarEstilos();
          return;
        }
        hoja.style.overflowY = 'hidden';
      }

      e.preventDefault();   // la garantía real contra el "tirar para recargar"
      y = dy > 0 ? dy : goma(dy, window.innerHeight * 0.22);
      vel.anotar(y);
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    const alSoltar = () => {
      if (!activo) return;
      activo = false;
      hoja.style.overflowY = '';
      if (decidido !== 1) { limpiarEstilos(); return; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }

      finArrastre = performance.now();
      const v = vel.valor();
      // Distancia O velocidad: solo distancia obliga a arrastrar media pantalla
      // y se siente pesado; solo velocidad impide cerrar despacio a propósito.
      const cerrar =
        y > window.innerHeight * UMBRAL_FRACCION ||
        (v > UMBRAL_VELOCIDAD && y > RECORRIDO_MINIMO);

      if (cerrar) salir(y, v); else volverASitio();
    };

    // Si ha habido arrastre, el toque no debe contar como clic: sin esto,
    // soltar sobre una sesión abría la web del cine y soltar sobre el velo
    // disparaba el cierre por segunda vez.
    const alClic = (e) => {
      if (performance.now() - finArrastre < 350) {
        e.stopPropagation();
        e.preventDefault();
        finArrastre = 0;
      }
    };

    // Con movimiento reducido el gesto sigue existiendo (no le quitamos a nadie
    // una forma de cerrar) pero sin seguir al dedo. El preventDefault se
    // mantiene: la recarga accidental no es una cuestión de estética.
    const alMoverReducido = (e) => {
      if (!activo) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) { e.preventDefault(); y = dy; }
    };
    const alSoltarReducido = () => {
      if (!activo) return;
      activo = false;
      if (y > 90) cerrarRef.current?.();
      y = 0;
    };

    const mover = reducido ? alMoverReducido : alMover;
    const soltar = reducido ? alSoltarReducido : alSoltar;

    // passive:false SOLO en touchmove, que es el único donde llamamos a
    // preventDefault. React registra sus manejadores de touchmove como pasivos,
    // así que un onTouchMove en el JSX no podría hacerlo: tiene que ser aquí.
    hoja.addEventListener('touchstart', alEmpezar, { passive: true });
    hoja.addEventListener('touchmove', mover, { passive: false });
    hoja.addEventListener('touchend', soltar, { passive: true });
    hoja.addEventListener('touchcancel', soltar, { passive: true });
    document.addEventListener('click', alClic, true);

    return () => {
      hoja.removeEventListener('touchstart', alEmpezar);
      hoja.removeEventListener('touchmove', mover);
      hoja.removeEventListener('touchend', soltar);
      hoja.removeEventListener('touchcancel', soltar);
      document.removeEventListener('click', alClic, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const duration = minutesToHuman(movie.durationMin);
  const hue = hueFromTitle(movie.title || '');
  const sources = ratingSources(movie.title, ratings);
  const trailerUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' tráiler oficial')}`;

  return (
    // Los roles van en la hoja, no en el velo: el velo solo es el fondo oscuro
    // y anunciarlo como diálogo describía como tal a un elemento cuyo único
    // cometido es cerrar al tocarlo.
    <div className="modal-overlay" ref={capaRef} onClick={onClose}>
      <div
        className="modal"
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-label={movie.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Único punto con touch-action fijo: nunca hace scroll, así que
            garantiza el arrastre aunque la ficha esté desplazada. */}
        <div className="modal-tirador" data-tirador aria-hidden="true" />

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
