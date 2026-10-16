'use client';

import { memo } from 'react';
import { useAhora, estadoDeSesion } from '@/lib/reloj.js';
import { detallesDeSesion } from '@/lib/cartelera.js';

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
// da enlace, abre la ficha. Hoy, las que ya han empezado se apagan y las de la
// próxima hora se encienden en ámbar con "en 25 min".
function Entrada({ sesion, cine, pelicula, fecha, onAbrir }) {
  const titulo = pelicula.title;
  const { pasada, falta } = useEstadoSesion(sesion.minuto, fecha);
  const { etiquetas, sala } = detallesDeSesion(sesion);
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

  if (sesion.buyUrl) {
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
