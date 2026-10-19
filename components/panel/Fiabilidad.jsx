'use client';

// Fiabilidad de los últimos 7 días: una fila por día con sus 96 franjas de
// 15 min (como la señal de la línea del día, en pequeño), qué parte de los
// informes llegaron y cómo fueron las recogidas. Debajo, qué cine falla más
// en las recogidas del móvil. Contesta "¿esto es de fiar?", que la línea de
// 24 h no puede: un apagón de anoche se ve, uno del martes, no.

import { useMemo } from 'react';
import { FRANJAS_DIA, fiabilidad, fallosPorCine, ordenCines, nombreCine } from './datos.js';
import { PuntoCine, Vacio, cifra } from './Piezas.jsx';

const porcentaje = (p) => (p == null ? '—' : `${cifra(Math.floor(p * 1000) / 10, { decimales: p < 1 ? 1 : 0 })} %`);
// Por debajo del 95 % (más de una hora sin informes en un día) ya es de mirar.
const nivelPct = (p) => (p == null ? 'nada' : p >= 0.95 ? 'bien' : p >= 0.8 ? 'aviso' : 'fallo');

export default function Fiabilidad({ movil, ahora }) {
  const f = useMemo(() => fiabilidad(movil, ahora), [movil, ahora]);
  const cines = useMemo(() => fallosPorCine(movil, ahora), [movil, ahora]);
  if (!movil) {
    return <Vacio titulo="No se ha podido leer el estado del móvil">Sin sus informes no se puede saber cómo han ido estos días.</Vacio>;
  }
  if (!f || f.pct == null) {
    return <Vacio titulo="Aún no hay historial">El móvil apunta cada vuelta en historial.jsonl; en cuanto haya unas cuantas, saldrán aquí.</Vacio>;
  }
  return (
    <div className="pn-fia">
      <p className="pn-fia-resumen">
        Llegó el <strong>{porcentaje(f.pct)}</strong> de los informes;
        {' '}{f.fallos ? <strong className="pn-texto-fallo">{f.fallos === 1 ? '1 vuelta fallida' : `${f.fallos} vueltas fallidas`}</strong> : 'ninguna vuelta fallida'};
        {' '}{f.recogidas === 1 ? '1 recogida' : `${f.recogidas} recogidas`}
        {f.recogidasMal ? <>, <strong className="pn-texto-fallo">{f.recogidasMal} con problemas</strong></> : ', todas bien'}.
        {f.desdeHistorial && <span className="pn-apagada"> El historial empieza el {f.desdeHistorial}.</span>}
      </p>
      <table className="pn-fia-tabla">
        <caption className="sr">Señal y recogidas por día, los últimos 7 días</caption>
        <thead>
          <tr>
            <th scope="col">Día</th>
            <th scope="col"><span className="sr">Franjas de 15 minutos</span></th>
            <th scope="col" className="pn-num">Señal</th>
            <th scope="col" className="pn-num">Recogidas</th>
          </tr>
        </thead>
        <tbody>
          {f.filas.map((d) => (
            <tr key={d.dia} data-hoy={d.hoy ? '' : undefined}>
              <th scope="row" className="pn-fia-dia">{d.hoy ? 'hoy' : d.etiqueta}</th>
              <td className="pn-fia-franjas" aria-hidden="true">
                {d.sinHistorial ? <span className="pn-fia-sin">sin historial</span> : (
                  <span className="pn-fia-tira">
                    {Array.from({ length: FRANJAS_DIA }, (_, i) => {
                      // Fuera: antes del historial, una hora que ese día no
                      // existe (cambio de hora) u hoy, lo que aún no se puede
                      // juzgar (en curso, no perdido).
                      const nivel = i < d.desde || i >= d.hasta || !d.existe[i] ? 'fuera'
                        : d.franjas[i] ?? (d.cubiertas[i] ? 'bien' : 'vacia');
                      return <span key={i} data-nivel={nivel} />;
                    })}
                  </span>
                )}
              </td>
              <td className="pn-num" data-nivel={nivelPct(d.pct)}>
                <span className="pn-fia-pct">{d.sinHistorial ? '—' : porcentaje(d.pct)}</span>
              </td>
              <td className="pn-num">
                {d.recogidas === 0 ? <span className="pn-tenue">—</span>
                  : d.recogidasMal ? <span className="pn-texto-fallo">{d.recogidasMal} de {d.recogidas} mal</span>
                  : <span>{d.recogidas} bien</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="pn-fia-cines" aria-label="Fallos por cine en las recogidas del móvil, 7 días">
        {ordenCines.map((id) => {
          const c = cines[id];
          return (
            <li key={id} data-mal={c.mal ? '' : undefined}>
              <PuntoCine id={id} />
              <span className="pn-fia-cine">{nombreCine(id)}</span>
              {c.recogidas === 0 ? <span className="pn-tenue">sin recogidas</span>
                : c.mal ? <span className="pn-texto-fallo">{c.mal} de {c.recogidas} con fallo</span>
                : <span className="pn-apagada">{c.recogidas} de {c.recogidas} bien</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
