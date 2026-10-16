'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { deCuando, comunesDelCine } from '@/lib/cartelera.js';
import { lugarCorto } from '@/lib/rotulos.js';
import { useAhora } from '@/lib/reloj.js';
import Entrada, { Empezadas } from './Entrada.jsx';
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

// `inmediato`: sin carga perezosa ni decodificación diferida. Lo usa la ficha,
// cuyo cartel fotografía la View Transition en cuanto se monta.
export function Cartel({ pelicula, className = 'peli-cartel-img', inmediato = false }) {
  const [fallo, setFallo] = useState(false);
  if (pelicula.posterUrl && !fallo) {
    return (
      <img
        className={className}
        src={pelicula.posterUrl}
        alt=""
        loading={inmediato ? 'eager' : 'lazy'}
        decoding={inmediato ? 'sync' : 'async'}
        onError={() => setFallo(true)}
      />
    );
  }
  return <span className={`${className} cartel-vacio`} style={{ '--tono': tonoDe(pelicula.title) }} />;
}

// Cuántas sesiones (ordenadas) han empezado ya, si `fecha` es hoy. Lo único
// del reloj que importa al grupo: se repinta cuando empieza una, no cada minuto.
function useCuantasEmpezadas(sesiones, fecha) {
  return useAhora((a) => {
    if (!a || a.fecha !== fecha) return 0;
    let n = 0;
    while (n < sesiones.length && sesiones[n].minuto < a.minuto) n++;
    return n;
  });
}

// Las horas de una película en UN cine: su nombre (con lo que comparten todas
// sus sesiones, escrito una vez), las ya empezadas en una línea discreta y
// las que quedan como entradas. Lo usan la cartelera y la ficha.
//   nivel    3 en la cartelera, 4 en la ficha (debajo de "Sesiones")
//   aviso    "datos del mar 13" si sus datos no son de ahora
export function GrupoCine({ cine, sessions, pelicula, fecha, onAbrir, aviso = null, nivel = 3 }) {
  const comunes = useMemo(() => comunesDelCine(sessions), [sessions]);
  const corte = useCuantasEmpezadas(sessions, fecha);
  const empezadas = corte ? sessions.slice(0, corte) : [];
  const quedan = corte ? sessions.slice(corte) : sessions;
  const Titulo = nivel === 4 ? 'h4' : 'h3';
  const hayComun = comunes.etiquetas.length > 0 || !!comunes.sala;
  return (
    <div className="peli-cine" data-cine={cine.id}>
      <Titulo className="peli-cine-nombre">
        <span className="punto" aria-hidden="true" />
        <span className="peli-cine-marca">{cine.short || cine.name}</span>
        <span className="peli-cine-lugar">{lugarCorto(cine)}</span>
        {hayComun && (
          <span className="peli-cine-comun">
            {comunes.etiquetas.map((t) => <span key={t} className="peli-cine-etiqueta">{t}</span>)}
            {comunes.sala && <span className="peli-cine-sala">{comunes.sala}</span>}
          </span>
        )}
        {aviso && <span className="peli-cine-aviso">{aviso}</span>}
      </Titulo>
      <Empezadas sesiones={empezadas} cine={cine} pelicula={pelicula} onAbrir={onAbrir} />
      {quedan.length > 0 && (
        <ul className="entradas">
          {quedan.map((s, i) => (
            <li key={`${s.time}-${i}`}>
              <Entrada sesion={s} cine={cine} pelicula={pelicula} fecha={fecha} onAbrir={onAbrir} comunes={hayComun ? comunes : null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Una película con todas sus horas por la bahía, agrupadas por cine.
function Pelicula({ pelicula, fecha, onAbrir }) {
  const duracion = minutesToHuman(pelicula.durationMin);
  const nota = notaMedia(pelicula.ratings);
  const cartelRef = useRef(null);
  const tituloRef = useRef(null);
  // Se abra desde donde se abra (cartel, título o una entrada sin venta), el
  // que vuela hasta la ficha es el cartel; y el foco, al cerrar, vuelve al
  // título, que es el botón que un lector de pantalla conoce.
  const abrir = useCallback(
    () => onAbrir(pelicula, { cartel: cartelRef.current, foco: tituloRef.current }),
    [onAbrir, pelicula]
  );

  return (
    <article className="peli" aria-labelledby={`t-${pelicula.clave}`}>
      {/* El cartel repite el botón del título: fuera del tabulador y del
          árbol de accesibilidad para no anunciar dos veces lo mismo. */}
      <button
        type="button"
        className="peli-cartel pulsable"
        ref={cartelRef}
        data-cartel={pelicula.clave}
        onClick={abrir}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Cartel pelicula={pelicula} />
      </button>

      <div className="peli-cabeza">
        <h2 className="peli-titulo" id={`t-${pelicula.clave}`}>
          <button type="button" className="peli-titulo-boton" ref={tituloRef} onClick={abrir}>
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
        {pelicula.cines.map(({ cine, sessions }) => (
          <GrupoCine
            key={cine.id}
            cine={cine}
            sessions={sessions}
            pelicula={pelicula}
            fecha={fecha}
            onAbrir={abrir}
            aviso={avisoDeCine(cine)}
          />
        ))}
      </div>
    </article>
  );
}

export default memo(Pelicula);
