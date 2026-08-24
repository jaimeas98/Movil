'use client';

import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';

// Filtros de la cartelera.
//
// Hablan el mismo idioma que la tira de días: un chip apagado que se enciende
// en oro al seleccionarlo. Antes esto era un panel con emojis y dos <select>
// nativos, que el sistema operativo dibujaba a su manera y rompían el diseño.
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

// Una fila de chips con navegación por flechas.
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
// Milisegundos que el chip permanece resaltado antes de aplicarse. Es la
// "confirmación visual": da tiempo a ver qué va a pasar y a seguir deslizando
// si te has pasado, sin que se apliquen filtros de paso mientras buscas.
const ESPERA_RULETA = 420;

function FilaChips({ label, ariaLabel, valores, onElegir, children }) {
  const ref = useRef(null);
  const [candidato, setCandidato] = useState(null);
  const temporizador = useRef(null);

  // Ruleta: al dejar de deslizar, el chip que queda en la zona de selección
  // (el borde izquierdo de la fila) se resalta y, si sigues sin tocar nada, se
  // aplica solo. Únicamente tiene sentido cuando la fila se desliza, es decir
  // en móvil: en escritorio los chips van en varias líneas y no hay scroll.
  useEffect(() => {
    const fila = ref.current;
    if (!fila || !onElegir) return;

    const cancelar = () => clearTimeout(temporizador.current);

    const alParar = () => {
      // Sin scroll horizontal no hay ruleta (escritorio, o pocos chips).
      if (fila.scrollWidth <= fila.clientWidth + 4) return;

      const chips = Array.from(fila.querySelectorAll('button'));
      const refX = fila.getBoundingClientRect().left + 2;
      let mejor = null;
      let mejorDist = Infinity;
      chips.forEach((chip, i) => {
        const d = Math.abs(chip.getBoundingClientRect().left - refX);
        if (d < mejorDist) { mejorDist = d; mejor = i; }
      });
      if (mejor == null) return;

      const valor = valores[mejor];
      setCandidato(mejor);
      cancelar();
      temporizador.current = setTimeout(() => {
        setCandidato(null);
        onElegir(valor);
      }, ESPERA_RULETA);
    };

    // scrollend existe en Chrome/Firefox modernos; donde no, lo emulamos.
    const soportaScrollEnd = 'onscrollend' in window;
    let debounce;
    const alDeslizar = () => {
      cancelar();
      setCandidato(null);
      if (soportaScrollEnd) return;
      clearTimeout(debounce);
      debounce = setTimeout(alParar, 140);
    };

    fila.addEventListener('scroll', alDeslizar, { passive: true });
    if (soportaScrollEnd) fila.addEventListener('scrollend', alParar);
    // Tocar la fila cancela la aplicación pendiente: si vas a pulsar un chip,
    // manda tu pulsación, no lo que hubiera quedado en la zona de selección.
    fila.addEventListener('pointerdown', cancelar);

    return () => {
      fila.removeEventListener('scroll', alDeslizar);
      if (soportaScrollEnd) fila.removeEventListener('scrollend', alParar);
      fila.removeEventListener('pointerdown', cancelar);
      cancelar();
      clearTimeout(debounce);
    };
  }, [valores, onElegir]);

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
      <span className="chip-group-label" aria-hidden="true">{label}</span>
      <div className="chip-row" ref={ref} role="group" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        {Children.map(children, (hijo, i) =>
          isValidElement(hijo) ? cloneElement(hijo, { candidato: candidato === i }) : hijo
        )}
      </div>
    </div>
  );
}

function Chip({ activo, candidato, onClick, children }) {
  return (
    <button
      type="button"
      className={`f-chip${candidato ? ' is-candidato' : ''}`}
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
          onElegir={onGenre}
        >
          <Chip activo={!genre} onClick={() => onGenre('')}>Todos los géneros</Chip>
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
        onElegir={onCinema}
      >
        <Chip activo={!cinema} onClick={() => onCinema('')}>Todos los cines</Chip>
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
