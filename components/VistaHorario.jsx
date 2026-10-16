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

// Una fila del horario: hora grande, título, cine (color) e idioma/formato.
// Tocarla lleva a comprar; sin enlace, a la ficha.
const Fila = memo(function Fila({ fila, fecha, onAbrir }) {
  const { pelicula, cine, sesion } = fila;
  const { pasada, falta } = useEstadoSesion(sesion.minuto, fecha);
  const { etiquetas, sala } = detallesDeSesion(sesion);
  const estado = pasada ? 'pasada' : falta != null ? 'pronto' : undefined;

  const cuerpo = (
    <>
      <Hora className="fila-hora" texto={sesion.time} />
      <span className="fila-cuerpo" aria-hidden="true">
        <span className="fila-titulo">{pelicula.title}</span>
        <span className="fila-datos">
          <span className="punto" />
          <span className="fila-cine">{cine.short || cine.name}</span>
          {etiquetas.map((t) => <span key={t} className="fila-etiqueta">{t}</span>)}
          {sala && <span className="fila-sala">{sala}</span>}
        </span>
      </span>
      {falta != null && <span className="fila-falta" aria-hidden="true">{textoFalta(falta)}</span>}
    </>
  );

  const comun = { className: 'fila-boton', 'data-estado': estado };
  return (
    <li className="fila" data-cine={cine.id}>
      {sesion.buyUrl ? (
        <a
          {...comun}
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
          {...comun}
          onClick={() => onAbrir(pelicula)}
          aria-label={frasePara({ titulo: pelicula.title, sesion, cine, pasada, falta, accion: 'Abre la ficha' })}
        >
          {cuerpo}
        </button>
      )}
    </li>
  );
});

function Franjas({ filas, fecha, onAbrir, apagadas = false }) {
  const franjas = useMemo(() => franjasPorHora(filas), [filas]);
  return (
    <div className={`franjas${apagadas ? ' franjas-apagadas' : ''}`}>
      {franjas.map((f) => (
        <section className="franja" key={f.hora} aria-labelledby={`fr-${apagadas ? 'p' : ''}${f.hora}`}>
          <h2 className="franja-hora" id={`fr-${apagadas ? 'p' : ''}${f.hora}`}><Hora texto={f.etiqueta} /></h2>
          <ul className="filas">
            {f.filas.map((x, i) => (
              <Fila key={`${x.cine.id}-${x.pelicula.clave}-${x.sesion.time}-${i}`} fila={x} fecha={fecha} onAbrir={onAbrir} />
            ))}
          </ul>
        </section>
      ))}
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

// Vista "Horario": todas las sesiones del día por orden de hora, agrupadas en
// franjas de una hora. Hoy, las que ya han empezado se recogen tras un botón y
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
