'use client';

import { memo, useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { deCuando } from '@/lib/cartelera.js';
import { lugarCorto } from '@/lib/rotulos.js';
import Entrada from './Entrada.jsx';
import Icono from './Icono.jsx';

// Tono estable a partir del título: el hueco del cartel mientras no hay
// imagen no es siempre el mismo bloque gris.
function tonoDe(titulo) {
  let h = 0;
  for (let i = 0; i < titulo.length; i++) h = (h * 31 + titulo.charCodeAt(i)) % 360;
  return h;
}

// Nota media con coma decimal, que es como se escribe en España.
export function notaMedia(ratings) {
  if (ratings?.average == null) return null;
  return (ratings.average / 10).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Lo que dice un cine de cómo de frescos son sus datos, pegado a sus horas:
// el aviso general de arriba se pierde al bajar, y estas horas pueden ser de
// otro día.
export function avisoDeCine(cine) {
  // Solo el día ("datos del mar 13"): la hora exacta ya está en el aviso de
  // arriba, y aquí acompaña a cada grupo de horas.
  if (cine.source === 'stale') return `datos ${deCuando(cine.staleAt).split(',')[0]}`;
  if (cine.source === 'sample') return 'datos de ejemplo';
  return null;
}

export function Cartel({ pelicula, className = 'peli-cartel-img' }) {
  const [fallo, setFallo] = useState(false);
  if (pelicula.posterUrl && !fallo) {
    return (
      <img
        className={className}
        src={pelicula.posterUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFallo(true)}
      />
    );
  }
  return <span className={`${className} cartel-vacio`} style={{ '--tono': tonoDe(pelicula.title) }} />;
}

// Una película con todas sus horas por la bahía, agrupadas por cine.
function Pelicula({ pelicula, fecha, onAbrir }) {
  const duracion = minutesToHuman(pelicula.durationMin);
  const nota = notaMedia(pelicula.ratings);
  const abrir = () => onAbrir(pelicula);

  return (
    <article className="peli" aria-labelledby={`t-${pelicula.clave}`}>
      {/* El cartel repite el botón del título: fuera del tabulador y del
          árbol de accesibilidad para no anunciar dos veces lo mismo. */}
      <button type="button" className="peli-cartel pulsable" onClick={abrir} tabIndex={-1} aria-hidden="true">
        <Cartel pelicula={pelicula} />
      </button>

      <div className="peli-cabeza">
        <h2 className="peli-titulo" id={`t-${pelicula.clave}`}>
          <button type="button" className="peli-titulo-boton" onClick={abrir}>
            {pelicula.title}
            <span className="sr">. Ver ficha</span>
          </button>
        </h2>
        <p className="peli-datos">
          {duracion && <span>{duracion}</span>}
          {pelicula.ageRating && <span className="peli-edad">{pelicula.ageRating}</span>}
          {nota && (
            <span className="peli-nota" title="Media de las valoraciones disponibles">
              <Icono nombre="estrella" className="ico ico-nota" />
              <span className="sr">Nota media </span>{nota}
            </span>
          )}
          {pelicula.genre && <span>{pelicula.genre}</span>}
          {pelicula.isNew && <span className="peli-estreno">Estreno</span>}
        </p>
      </div>

      <div className="peli-cines">
        {pelicula.cines.map(({ cine, sessions }) => {
          const aviso = avisoDeCine(cine);
          return (
            <div className="peli-cine" data-cine={cine.id} key={cine.id}>
              <h3 className="peli-cine-nombre">
                <span className="punto" aria-hidden="true" />
                <span className="peli-cine-marca">{cine.short || cine.name}</span>
                <span className="peli-cine-lugar">{lugarCorto(cine)}</span>
                {aviso && <span className="peli-cine-aviso">{aviso}</span>}
              </h3>
              <ul className="entradas">
                {sessions.map((s, i) => (
                  <li key={`${s.time}-${i}`}>
                    <Entrada sesion={s} cine={cine} pelicula={pelicula} fecha={fecha} onAbrir={onAbrir} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default memo(Pelicula);
