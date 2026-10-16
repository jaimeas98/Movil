'use client';

import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sesionesEnOrden, franjasPorHora, huecosPorMinuto, detallesDeSesion } from '@/lib/cartelera.js';
import { nombreInterruptor } from '@/lib/rotulos.js';
import { useAhora } from '@/lib/reloj.js';
import { useEstadoSesion, textoFalta, frasePara, Hora } from './Entrada.jsx';

const dosCifras = (n) => String(n).padStart(2, '0');

// Jerarquía: la hora se escribe UNA vez por cada hora de inicio distinta, en
// grande a la izquierda, y a su derecha todas las películas que empiezan a esa
// hora. Antes cada franja ("19:00") llevaba su rótulo y además cada fila
// repetía "19:00" en grande y en ámbar: cuatro veces lo mismo seguido, y el
// ojo tenía que leer las horas para descubrir que no cambiaban. Ahora la
// columna de la izquierda solo cambia cuando cambia la hora, que es justo lo
// que se busca al bajar con el dedo ("¿qué empieza a las nueve y pico?").
// El "en 20 min" también va con la hora, una vez, y no en cada fila.
//
// Y dentro de cada hora, una fila por PELÍCULA: si la echan a la misma hora
// en tres cines, es un título con sus tres cines (cada uno, su enlace), no el
// mismo título tres veces seguidas (ver huecosPorMinuto en lib/cartelera.js).

const hhmm = (minuto) => `${dosCifras(Math.floor(minuto / 60) % 24)}:${dosCifras(minuto % 60)}`;

// Un cine dentro de la fila: su punto de color, su nombre corto y lo que
// distingue la sesión. Tocarlo lleva a comprar; sin enlace, a la ficha. La
// frase completa (con título y hora) va en el enlace: quien salta de enlace
// en enlace con un lector de pantalla no ve ni el título ni la columna de la
// izquierda.
function Pase({ pelicula, cine, sesion, onAbrir, pasada, falta }) {
  const { etiquetas, sala } = detallesDeSesion(sesion);
  const cuerpo = (
    <span className="fila-pase-cuerpo" aria-hidden="true">
      <span className="punto" />
      <span className="fila-cine">{nombreInterruptor(cine)}</span>
      {etiquetas.map((t) => <span key={t} className="fila-etiqueta">{t}</span>)}
      {sala && <span className="fila-sala">{sala}</span>}
    </span>
  );
  return sesion.buyUrl ? (
    <a
      className="fila-pase"
      href={sesion.buyUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={frasePara({ titulo: pelicula.title, sesion, cine, pasada, falta, accion: 'Comprar entrada, se abre en otra pestaña' })}
    >
      {cuerpo}
    </a>
  ) : (
    <button
      type="button"
      className="fila-pase"
      onClick={() => onAbrir(pelicula)}
      aria-label={frasePara({ titulo: pelicula.title, sesion, cine, pasada, falta, accion: 'Abre la ficha' })}
    >
      {cuerpo}
    </button>
  );
}

// Una película dentro de su hora: el título una vez y sus cines debajo. Con
// un solo cine, toda la fila es su enlace (como siempre: tocar la fila es
// comprar); con varios, cada cine el suyo.
const Fila = memo(function Fila({ grupo, onAbrir, pasada, falta }) {
  const { pelicula, pases } = grupo;
  return (
    <li className="fila" data-unica={pases.length === 1 ? '' : undefined}>
      <p className="fila-titulo" aria-hidden="true">{pelicula.title}</p>
      <ul className="fila-pases">
        {pases.map(({ cine, sesion }, i) => (
          <li key={`${cine.id}-${sesion.time}-${i}`} data-cine={cine.id}>
            <Pase pelicula={pelicula} cine={cine} sesion={sesion} onAbrir={onAbrir} pasada={pasada} falta={falta} />
          </li>
        ))}
      </ul>
    </li>
  );
});

// Las películas que empiezan al mismo minuto, bajo una sola hora. El estado
// (ya empezada, "en 20 min") es el mismo para todas: se calcula una vez.
const Hueco = memo(function Hueco({ hueco, fecha, onAbrir }) {
  const { pasada, falta } = useEstadoSesion(hueco.minuto, fecha);
  const estado = pasada ? 'pasada' : falta != null ? 'pronto' : undefined;
  return (
    <li className="hueco" data-estado={estado}>
      <p className="hueco-hora" aria-hidden="true">
        <Hora className="hueco-cifras" texto={hhmm(hueco.minuto)} />
        {falta != null && <span className="hueco-falta">{textoFalta(falta)}</span>}
      </p>
      <ul className="filas">
        {hueco.pelis.map((g) => (
          <Fila key={g.pelicula.clave} grupo={g} onAbrir={onAbrir} pasada={pasada} falta={falta} />
        ))}
      </ul>
    </li>
  );
});

// Franjas de una hora: en el móvil no se rotulan (la hora ya está en cada
// hueco), pero siguen ahí para dos cosas: en escritorio cada una es una
// columna, como un panel de salidas, y un lector de pantalla puede saltar de
// franja en franja por su encabezado.
function Franjas({ filas, fecha, onAbrir, apagadas = false }) {
  const franjas = useMemo(
    () => franjasPorHora(filas).map((f) => ({ ...f, huecos: huecosPorMinuto(f.filas) })),
    [filas]
  );
  return (
    <div className={`franjas${apagadas ? ' franjas-apagadas' : ''}`}>
      {franjas.map((f) => {
        const id = `fr-${apagadas ? 'p' : ''}${f.hora}`;
        return (
          <section className="franja" key={f.hora} aria-labelledby={id}>
            <h2 className="sr" id={id}>De las {f.etiqueta} a las {hhmm((f.hora + 1) * 60)}</h2>
            <ul className="huecos">
              {f.huecos.map((h) => (
                <Hueco key={h.minuto} hueco={h} fecha={fecha} onAbrir={onAbrir} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function contarAnteriores(filas, ahora) {
  let lo = 0, hi = filas.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (filas[mid].minuto < ahora) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// La línea del "ahora" lleva también el botón de las que ya han empezado: es
// la frontera entre lo pasado y lo que queda, y así no cuesta una fila
// entera de botón encima de la cartelera.
function LineaAhora({ pasadas, verPasadas, onVerPasadas, botonRef }) {
  const minuto = useAhora((a) => (a ? a.minuto : -1));
  if (minuto < 0) return null;
  const hora = `${dosCifras(Math.floor(minuto / 60))}:${dosCifras(minuto % 60)}`;
  return (
    <div className="ahora">
      <span className="ahora-texto" role="note">Ahora <span className="ahora-hora">{hora}</span></span>
      <span className="ahora-raya" aria-hidden="true" />
      {pasadas > 0 && (
        <button
          ref={botonRef}
          type="button"
          className="ahora-pasadas"
          aria-expanded={verPasadas}
          onClick={onVerPasadas}
        >
          {verPasadas ? 'Ocultar las empezadas' : `Ver ${pasadas === 1 ? 'la empezada' : `las ${pasadas} empezadas`}`}
        </button>
      )}
    </div>
  );
}

// Vista "Horario": todas las sesiones del día por orden de hora, agrupadas por
// hora de inicio (y, por debajo, en franjas de una hora). Hoy, las que ya han
// empezado se recogen tras un botón en la línea del "ahora".
export default function VistaHorario({ peliculas, fecha, onAbrir }) {
  const [verPasadas, setVerPasadas] = useState(false);
  const filas = useMemo(() => sesionesEnOrden(peliculas), [peliculas]);
  const corte = useAhora((a) => (a && a.fecha === fecha ? contarAnteriores(filas, a.minuto) : -1));
  const esHoy = corte >= 0;
  const pasadas = esHoy ? filas.slice(0, corte) : [];
  const resto = esHoy ? filas.slice(corte) : filas;

  // Las empezadas se despliegan ENCIMA del botón (van antes en el día). Sin
  // compensarlo, el botón y todo lo de debajo saltarían hacia abajo lo que
  // midan; así el botón se queda bajo el dedo y lo nuevo aparece por arriba.
  const botonRef = useRef(null);
  const antesRef = useRef(null);
  const alternar = () => {
    antesRef.current = botonRef.current?.getBoundingClientRect().top ?? null;
    setVerPasadas((v) => !v);
  };
  useLayoutEffect(() => {
    const antes = antesRef.current;
    antesRef.current = null;
    const ahora = botonRef.current?.getBoundingClientRect().top;
    if (antes == null || ahora == null) return;
    if (Math.abs(ahora - antes) > 1) window.scrollBy({ top: ahora - antes, behavior: 'instant' });
  }, [verPasadas]);

  return (
    <div className="horario">
      {verPasadas && pasadas.length > 0 && (
        <Franjas filas={pasadas} fecha={fecha} onAbrir={onAbrir} apagadas />
      )}

      {esHoy && (
        <LineaAhora pasadas={pasadas.length} verPasadas={verPasadas} onVerPasadas={alternar} botonRef={botonRef} />
      )}

      {resto.length > 0 ? (
        <Franjas filas={resto} fecha={fecha} onAbrir={onAbrir} />
      ) : (
        <div className="estado estado-compacto">
          <h2 className="estado-titulo">Por hoy ya ha empezado todo</h2>
          <p className="estado-texto">No queda ninguna sesión por empezar con estos filtros.</p>
        </div>
      )}
    </div>
  );
}
