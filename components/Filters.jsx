'use client';

import { useEffect, useRef } from 'react';
import { movimientoReducido } from '@/lib/gestos.js';

// Filtros de la cartelera.
//
// Chips que se pulsan, sin más. Hubo una versión con "ruleta" —el chip que
// quedaba en un punto de selección se aplicaba solo al dejar de deslizar— y se
// ha quitado a conciencia: ninguna aplicación de catálogo (Netflix, Spotify,
// YouTube, Instagram) filtra así. La rueda es para elegir un valor de una lista
// cerrada (una hora, una fecha), donde el gesto ES la elección. Al filtrar, en
// cambio, deslizas para MIRAR qué hay, y que eso aplique filtros de paso hace
// que la interfaz se sienta impredecible: tocas para elegir, deslizas para ver.
//
// Nada de emoji: iconos SVG de trazo que heredan el color con currentColor y
// por tanto funcionan igual en tema claro y oscuro.

function IconoLupa(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5 16.7 16.7" />
    </svg>
  );
}

function IconoAspa(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
         strokeLinecap="round" aria-hidden="true" focusable="false" {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Una fila de chips deslizable.
//
// `tabIndex` rotatorio: solo el chip activo entra en el recorrido del
// tabulador. Si todos fueran tabulables harían falta ~20 pulsaciones de Tab
// para cruzar los filtros; con esto son dos, y dentro de cada fila te mueves
// con las flechas.
//
// Que ← y → no cambien de día mientras navegas por los chips se resuelve en
// app/page.js (mira el comentario allí): en App Router React escucha en
// `document`, el mismo nodo que el atajo global, así que detener la
// propagación desde aquí no serviría de nada.
function FilaChips({ label, ariaLabel, valores, activo, children }) {
  const ref = useRef(null);

  // El chip elegido se trae a la vista si se había quedado fuera. Solo eso: no
  // reposicionamos la fila en cada gesto, que era lo que hacía que deslizar se
  // sintiera como una pelea contra la interfaz.
  useEffect(() => {
    const fila = ref.current;
    if (!fila || fila.scrollWidth <= fila.clientWidth + 4) return;
    const i = valores?.indexOf(activo) ?? -1;
    const chip = i > -1 ? fila.querySelectorAll('button')[i] : null;
    if (!chip) return;
    const izq = chip.offsetLeft - fila.scrollLeft;
    const der = izq + chip.offsetWidth;
    if (izq >= 0 && der <= fila.clientWidth) return;   // ya se ve entero
    fila.scrollTo({
      left: Math.max(0, chip.offsetLeft - (fila.clientWidth - chip.offsetWidth) / 2),
      behavior: movimientoReducido() ? 'auto' : 'smooth',
    });
  }, [activo, valores]);

  const onKeyDown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const chips = Array.from(ref.current?.querySelectorAll('button') ?? []);
    const i = chips.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 :
      e.key === 'End' ? chips.length - 1 :
      e.key === 'ArrowRight' ? (i + 1) % chips.length :
      (i - 1 + chips.length) % chips.length;
    chips[destino].focus();
    chips[destino].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div className="chip-group">
      {/* La etiqueta va SIEMPRE, también en móvil. Antes se ocultaba y se
          sustituía por un filete separador, y sin nombre no se distinguía qué
          filtraba cada fila: el filete decía "aquí acaba una" pero no "de qué
          va la otra". */}
      <span className="chip-group-label">{label}</span>
      <div className="chip-row" ref={ref} role="group" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      className="f-chip"
      aria-pressed={activo}
      tabIndex={activo ? 0 : -1}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function Filters({
  query,
  onQuery,
  genre,
  onGenre,
  cinema,
  onCinema,
  genres,
  cinemas,
}) {
  const activos = (query ? 1 : 0) + (genre ? 1 : 0) + (cinema ? 1 : 0);

  // La lista de géneros se recalcula por día. Si cambias de día y el género
  // elegido ya no existe, te quedarías con un filtro puesto y ningún chip
  // encendido con el que quitarlo, así que lo añadimos al principio.
  const listaGeneros = genre && !genres.includes(genre) ? [genre, ...genres] : genres;

  const limpiarTodo = () => {
    onQuery('');
    onGenre('');
    onCinema('');
  };

  return (
    <section className="filters" aria-label="Filtros de la cartelera">
      <div className="filters-top">
        <div className="search-field">
          <IconoLupa className="search-ic" />
          <input
            id="search-input"
            className="search-input"
            type="text"
            inputMode="search"
            autoComplete="off"
            placeholder="Buscar por título…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Buscar por título"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                onQuery('');
                document.getElementById('search-input')?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              <IconoAspa />
            </button>
          )}
        </div>

        {activos > 0 && (
          <button
            type="button"
            className="filters-clear"
            onClick={limpiarTodo}
            aria-label={`Quitar ${activos} ${activos === 1 ? 'filtro activo' : 'filtros activos'}`}
          >
            <span className="filters-count" aria-hidden="true">{activos}</span>
            <span className="fc-label">Limpiar</span>
            <IconoAspa className="fc-x" />
          </button>
        )}
      </div>

      {listaGeneros.length > 0 && (
        <FilaChips
          label="Género"
          ariaLabel="Filtrar por género"
          valores={['', ...listaGeneros]}
          activo={genre}
        >
          <Chip activo={!genre} onClick={() => onGenre('')}>Todos</Chip>
          {listaGeneros.map((g) => (
            <Chip key={g} activo={genre === g} onClick={() => onGenre(genre === g ? '' : g)}>
              {g}
            </Chip>
          ))}
        </FilaChips>
      )}

      <FilaChips
        label="Cine"
        ariaLabel="Filtrar por cine"
        valores={['', ...cinemas.map((c) => c.id)]}
        activo={cinema}
      >
        <Chip activo={!cinema} onClick={() => onCinema('')}>Todos</Chip>
        {cinemas.map((c) => (
          <Chip
            key={c.id}
            activo={cinema === c.id}
            onClick={() => onCinema(cinema === c.id ? '' : c.id)}
          >
            {/* El punto de color es el mismo recurso con el que la web ya
                identifica cada cine en las cabeceras de sección. */}
            <span className="f-dot" style={{ background: c.color }} aria-hidden="true" />
            {c.short}
          </Chip>
        ))}
      </FilaChips>
    </section>
  );
}
