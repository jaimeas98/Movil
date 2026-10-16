'use client';

import { memo, useMemo, useState } from 'react';
import { sesionesEnOrden, franjasPorHora, detallesDeSesion } from '@/lib/cartelera.js';
import { useAhora } from '@/lib/reloj.js';
import { useEstadoSesion, textoFalta, frasePara, Hora } from './Entrada.jsx';

const dosCifras = (n) => String(n).padStart(2, '0');

function LineaAhora() {
  const minuto = useAhora((a) => (a ? a.minuto : -1));
  if (minuto < 0) return null;
  const hora = `${dosCifras(Math.floor(minuto / 60))}:${dosCifras(minuto % 60)}`;
  return (
    <div className="ahora" role="note">
      <span className="ahora-texto">Ahora <span className="ahora-hora">{hora}</span></span>
    </div>
  );
}

// Jerarquía: la hora se escribe UNA vez por cada hora de inicio distinta, en
// grande a la izquierda, y a su derecha todas las películas que empiezan a esa
// hora. Antes cada franja ("19:00") llevaba su rótulo y además cada fila
// repetía "19:00" en grande y en ámbar: cuatro veces lo mismo seguido, y el
// ojo tenía que leer las horas para descubrir que no cambiaban. Ahora la
// columna de la izquierda solo cambia cuando cambia la hora, que es justo lo
// que se busca al bajar con el dedo ("¿qué empieza a las nueve y pico?").
// El "en 20 min" también va con la hora, una vez, y no en cada fila.

const hhmm = (minuto) => `${dosCifras(Math.floor(minuto / 60) % 24)}:${dosCifras(minuto % 60)}`;

// Una película dentro de su hora: título, cine (color) e idioma/formato.
// Tocarla lleva a comprar; sin enlace, a la ficha.
const Fila = memo(function Fila({ fila, onAbrir, pasada, falta }) {
  const { pelicula, cine, sesion } = fila;
  const { etiquetas, sala } = detallesDeSesion(sesion);

  const cuerpo = (
    <span className="fila-cuerpo" aria-hidden="true">
      <span className="fila-titulo">{pelicula.title}</span>
      <span className="fila-datos">
        <span className="punto" />
        <span className="fila-cine">{cine.short || cine.name}</span>
        {etiquetas.map((t) => <span key={t} className="fila-etiqueta">{t}</span>)}
        {sala && <span className="fila-sala">{sala}</span>}
      </span>
    </span>
  );

  // La frase completa (con la hora) va en el enlace: quien salta de enlace en
  // enlace con un lector de pantalla no ve la columna de la izquierda.
  return (
    <li className="fila" data-cine={cine.id}>
      {sesion.buyUrl ? (
        <a
          className="fila-boton"
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
          className="fila-boton"
          onClick={() => onAbrir(pelicula)}
          aria-label={frasePara({ titulo: pelicula.title, sesion, cine, pasada, falta, accion: 'Abre la ficha' })}
        >
          {cuerpo}
        </button>
      )}
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
        {hueco.filas.map((x, i) => (
          <Fila
            key={`${x.cine.id}-${x.pelicula.clave}-${x.sesion.time}-${i}`}
            fila={x}
            onAbrir={onAbrir}
            pasada={pasada}
            falta={falta}
          />
        ))}
      </ul>
    </li>
  );
});

function porMinuto(filas) {
  const huecos = [];
  for (const f of filas) {
    const ultimo = huecos.at(-1);
    if (ultimo && ultimo.minuto === f.minuto) ultimo.filas.push(f);
    else huecos.push({ minuto: f.minuto, filas: [f] });
  }
  return huecos;
}

// Franjas de una hora: en el móvil no se rotulan (la hora ya está en cada
// hueco), pero siguen ahí para dos cosas: en escritorio cada una es una
// columna, como un panel de salidas, y un lector de pantalla puede saltar de
// franja en franja por su encabezado.
function Franjas({ filas, fecha, onAbrir, apagadas = false }) {
  const franjas = useMemo(
    () => franjasPorHora(filas).map((f) => ({ ...f, huecos: porMinuto(f.filas) })),
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

// Vista "Horario": todas las sesiones del día por orden de hora, agrupadas por
// hora de inicio (y, por debajo, en franjas de una hora). Hoy, las que ya han empezado se recogen tras un botón y
// una línea marca el "ahora".
export default function VistaHorario({ peliculas, fecha, onAbrir }) {
  const [verPasadas, setVerPasadas] = useState(false);
  const filas = useMemo(() => sesionesEnOrden(peliculas), [peliculas]);
  const corte = useAhora((a) => (a && a.fecha === fecha ? contarAnteriores(filas, a.minuto) : -1));
  const esHoy = corte >= 0;
  const pasadas = esHoy ? filas.slice(0, corte) : [];
  const resto = esHoy ? filas.slice(corte) : filas;

  return (
    <div className="horario">
      {pasadas.length > 0 && (
        <div className="empezadas empezadas-arriba">
          <button
            type="button"
            className="boton empezadas-boton"
            aria-expanded={verPasadas}
            onClick={() => setVerPasadas((v) => !v)}
          >
            {verPasadas
              ? 'Ocultar las que ya han empezado'
              : `Ver ${pasadas.length === 1 ? 'la sesión que ya ha empezado' : `las ${pasadas.length} sesiones que ya han empezado`}`}
          </button>
          {verPasadas && <Franjas filas={pasadas} fecha={fecha} onAbrir={onAbrir} apagadas />}
        </div>
      )}

      {esHoy && <LineaAhora />}

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
