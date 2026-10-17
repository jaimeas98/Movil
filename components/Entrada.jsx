'use client';

import { memo } from 'react';
import { useAhora, estadoDeSesion } from '@/lib/reloj.js';
import { detallesDeSesion, propiosDeSesion } from '@/lib/cartelera.js';

// Solo enlaces https: el servidor ya filtra los de compra (lib/cinemas/
// enlaces.js), pero un `javascript:` que llegara de una caché vieja no puede
// convertirse en un enlace que se ejecuta al tocarlo.
const esHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);

// Hora con cifras de ancho fijo. Big Shoulders no trae cifras tabulares (su
// "1" mide la mitad que el "0") y `font-variant-numeric: tabular-nums` no hace
// nada con ella: "11:15" y "20:00" no se alineaban en columna. Cada cifra va
// en una celda del ancho de la más ancha y el lector de pantalla oye la hora
// entera, no cinco trozos.
export function Hora({ texto, className }) {
  return (
    <span className={className}>
      <span className="hora-cifras" aria-hidden="true">
        {String(texto).split('').map((c, i) => (
          <span key={i} className={/\d/.test(c) ? 'cifra' : 'cifra-sep'}>{c}</span>
        ))}
      </span>
      <span className="sr">{texto}</span>
    </span>
  );
}

export function textoFalta(min) {
  return min <= 0 ? 'empieza ya' : `en ${min} min`;
}

// Lee del reloj compartido SOLO el estado de esta sesión. React compara el
// texto devuelto y no vuelve a pintar la entrada mientras no cambie: a las
// 18:41 solo se repintan las que están en su hora previa.
export function useEstadoSesion(minuto, fecha) {
  const estado = useAhora((a) => estadoDeSesion(minuto, a, fecha));
  return {
    pasada: estado === 'pasada',
    falta: estado.startsWith('pronto:') ? Number(estado.slice(7)) : null,
  };
}

// Lo que oye un lector de pantalla: la entrada entera en una frase, con la
// película delante, porque al saltar de enlace en enlace no se ve el título.
export function frasePara({ titulo, sesion, cine, pasada, falta, accion }) {
  const { etiquetas, sala } = detallesDeSesion(sesion);
  return [
    `${titulo}, ${sesion.time}`,
    cine?.short || cine?.name,
    etiquetas.join(', '),
    sala,
    pasada ? 'ya ha empezado' : falta != null ? textoFalta(falta) : '',
    accion,
  ].filter(Boolean).join('. ');
}

// La sesión como una entrada de cine: la hora en grande y, en pequeño, lo que
// cambia la decisión (VOSE, 3D, sala). Pulsarla lleva a comprar; si el cine no
// da enlace, abre la ficha. Hoy, las de la próxima hora se encienden en ámbar
// con "en 25 min" (las que ya han empezado no llegan aquí: ver Empezadas).
//   comunes   lo que comparten todas las sesiones de su cine (ya escrito junto
//             al nombre del cine): la entrada solo enseña lo que la distingue.
//             El lector de pantalla sigue oyendo la frase entera.
function Entrada({ sesion, cine, pelicula, fecha, onAbrir, comunes = null }) {
  const titulo = pelicula.title;
  const { pasada, falta } = useEstadoSesion(sesion.minuto, fecha);
  const { etiquetas, sala } = propiosDeSesion(sesion, comunes);
  const estado = pasada ? 'pasada' : falta != null ? 'pronto' : undefined;

  const contenido = (
    <>
      <Hora className="entrada-hora" texto={sesion.time} />
      <span className="entrada-datos" aria-hidden="true">
        {falta != null && <span className="entrada-falta">{textoFalta(falta)}</span>}
        {etiquetas.map((t) => <span key={t} className="entrada-etiqueta">{t}</span>)}
        {/* Con poco sitio, la sala cede ante "en 25 min", que es más urgente */}
        {sala && falta == null && <span className="entrada-sala">{sala}</span>}
      </span>
    </>
  );

  if (esHttps(sesion.buyUrl)) {
    return (
      <a
        className="entrada"
        data-estado={estado}
        href={sesion.buyUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={frasePara({ titulo, sesion, cine, pasada, falta, accion: 'Comprar entrada, se abre en otra pestaña' })}
      >
        {contenido}
      </a>
    );
  }
  // Sin enlace y sin ficha que abrir (ya estás en ella): solo información.
  if (!onAbrir) {
    return (
      <span className="entrada" data-estado={estado}>
        {contenido}
        <span className="sr">{frasePara({ titulo, sesion, cine, pasada, falta, accion: 'Sin venta en línea' })}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="entrada"
      data-estado={estado}
      onClick={() => onAbrir(pelicula)}
      aria-label={frasePara({ titulo, sesion, cine, pasada, falta, accion: 'Sin venta en línea; abre la ficha' })}
    >
      {contenido}
    </button>
  );
}

export default memo(Entrada);

// Las sesiones de hoy que ya han empezado, en una línea discreta delante de
// las entradas: "17:15 18:00 · ya empezadas". Como entradas de tamaño
// completo ocupaban los primeros huecos de cada cine (8 de las 23 de la
// primera película) y empujaban lo que todavía se puede ver fuera de la
// pantalla. Siguen siendo enlaces (a veces se entra con la sesión empezada,
// con los anuncios) y cada uno dice su frase completa.
export const Empezadas = memo(function Empezadas({ sesiones, cine, pelicula, onAbrir }) {
  if (!sesiones.length) return null;
  const titulo = pelicula.title;
  return (
    <p className="empezadas-linea">
      {sesiones.map((s, i) => {
        const clave = `${s.time}-${i}`;
        if (esHttps(s.buyUrl)) {
          return (
            <a
              key={clave}
              className="empezada"
              href={s.buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={frasePara({ titulo, sesion: s, cine, pasada: true, accion: 'Comprar entrada, se abre en otra pestaña' })}
            >
              {s.time}
            </a>
          );
        }
        if (onAbrir) {
          return (
            <button
              key={clave}
              type="button"
              className="empezada"
              onClick={() => onAbrir(pelicula)}
              aria-label={frasePara({ titulo, sesion: s, cine, pasada: true, accion: 'Sin venta en línea; abre la ficha' })}
            >
              {s.time}
            </button>
          );
        }
        return (
          <span key={clave} className="empezada">
            <span aria-hidden="true">{s.time}</span>
            <span className="sr">{frasePara({ titulo, sesion: s, cine, pasada: true, accion: 'Sin venta en línea' })}</span>
          </span>
        );
      })}
      <span className="empezadas-texto" aria-hidden="true">
        {sesiones.length === 1 ? 'ya empezada' : 'ya empezadas'}
      </span>
    </p>
  );
});
