'use client';

import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { movimientoReducido } from '@/lib/gestos.js';

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

function FilaChips({ label, ariaLabel, valores, onElegir, activo, children }) {
  const ref = useRef(null);
  const [candidato, setCandidato] = useState(null);
  const temporizador = useRef(null);

  // Ruleta con selección AL CENTRO, como los selectores de las apps: hay un
  // punto fijo de selección, los chips encajan en él y los de los lados se
  // encogen y apagan según se alejan. La versión anterior seleccionaba en el
  // borde izquierdo —invisible— y no reposicionaba nada, por eso se leía como
  // un scroll cualquiera que además cambiaba el filtro.
  useEffect(() => {
    const fila = ref.current;
    if (!fila || !onElegir) return;

    const cancelar = () => clearTimeout(temporizador.current);
    const esRuleta = () => fila.scrollWidth > fila.clientWidth + 4;

    const chips = () => Array.from(fila.querySelectorAll('button'));

    // Devuelve el índice del chip más cercano al centro y, de paso, pinta el
    // escalado progresivo. Es lo que hace que se lea como una ruleta y no como
    // una lista: sin el degradado de tamaño no hay sensación de rueda.
    let raf = 0;
    const medir = () => {
      raf = 0;
      const caja = fila.getBoundingClientRect();
      const centro = caja.left + caja.width / 2;
      let mejor = null, mejorDist = Infinity;
      chips().forEach((chip, i) => {
        const c = chip.getBoundingClientRect();
        const d = Math.abs(c.left + c.width / 2 - centro);
        // Normalizado a media anchura: 0 en el centro, 1 en los extremos.
        const t = Math.min(1, d / (caja.width / 2 || 1));
        chip.style.setProperty('--esc', String(1 - t * 0.14));
        chip.style.setProperty('--op', String(1 - t * 0.45));
        if (d < mejorDist) { mejorDist = d; mejor = i; }
      });
      return mejor;
    };

    const alParar = () => {
      if (!esRuleta()) return;
      const mejor = medir();
      if (mejor == null) return;
      const valor = valores[mejor];
      if (valor === activo) { setCandidato(null); return; }   // ya aplicado
      setCandidato(mejor);
      cancelar();
      temporizador.current = setTimeout(() => {
        setCandidato(null);
        onElegir(valor);
      }, ESPERA_RULETA);
    };

    const soportaScrollEnd = 'onscrollend' in window;
    let debounce;
    const alDeslizar = () => {
      cancelar();
      setCandidato(null);
      if (!raf) raf = requestAnimationFrame(medir);
      if (soportaScrollEnd) return;
      clearTimeout(debounce);
      debounce = setTimeout(alParar, 140);
    };

    // Pintado inicial para que el degradado esté puesto antes de tocar nada.
    if (esRuleta()) medir();

    fila.addEventListener('scroll', alDeslizar, { passive: true });
    if (soportaScrollEnd) fila.addEventListener('scrollend', alParar);
    // Tocar cancela lo pendiente: si vas a pulsar un chip manda tu pulsación.
    fila.addEventListener('pointerdown', cancelar);

    return () => {
      fila.removeEventListener('scroll', alDeslizar);
      if (soportaScrollEnd) fila.removeEventListener('scrollend', alParar);
      fila.removeEventListener('pointerdown', cancelar);
      cancelar();
      clearTimeout(debounce);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [valores, onElegir, activo]);

  // Al aplicarse un filtro (por pulsación o por ruleta) el chip elegido se
  // coloca en el punto de selección. Sin esto la posición no se ajustaba nunca
  // y la rueda parecía no tener efecto.
  useEffect(() => {
    const fila = ref.current;
    if (!fila || fila.scrollWidth <= fila.clientWidth + 4) return;
    const i = valores.indexOf(activo);
    const chip = i > -1 ? fila.querySelectorAll('button')[i] : null;
    if (!chip) return;
    fila.scrollTo({
      left: chip.offsetLeft - (fila.clientWidth - chip.offsetWidth) / 2,
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
          activo={genre}
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
        activo={cinema}
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
