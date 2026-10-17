'use client';

// Batería de las últimas 24 h.
//
// Una sola serie (el porcentaje), así que no lleva leyenda de series: el
// título ya dice qué es. Lo que sí lleva clave, porque no es la línea:
//  · las franjas en las que estaba enchufado (un paso de tinta de fondo, con
//    el rayo encima si caben), para ver de un vistazo si se carga cuando toca;
//  · los huecos: si el móvil se calla más de 45 min, la línea se corta en vez
//    de unir los dos puntos con una recta que nunca existió;
//  · la previsión: desenchufado, una línea a trazos (es una proyección, no un
//    dato) desde el último punto hasta el 15 % de reserva, con la hora a la
//    que llegaría. El ritmo es el que calcula el móvil (scripts/movil/
//    bateria.mjs); si no lo manda, se mide aquí con las últimas 2 h.
// Al pasar el dedo o el ratón, una raya vertical busca el punto más cercano y
// enseña su hora y su porcentaje; con el teclado, las flechas hacen lo mismo.
// Y los datos enteros están en una tabla debajo, para no depender del hover.

import { useEffect, useMemo, useRef, useState } from 'react';
import { absoluta, completa } from './tiempo.js';
import { RESERVA } from './datos.js';

const HORA = 3600e3;
const HUECO_MS = 45 * 60e3;
const MAX_FUTURO = 12 * HORA;

const fmtH = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false });

function ritmoLocal(historial) {
  const ultimo = historial.at(-1);
  if (!ultimo || ultimo.cargando) return null;
  let i = historial.length - 1;
  while (i > 0 && !historial[i - 1].cargando) i--;
  const tramo = historial.slice(i).filter((p) => ultimo.t - p.t <= 2 * HORA);
  if (tramo.length < 2 || ultimo.t - tramo[0].t < 20 * 60e3) return null;
  const r = (tramo[0].pct - ultimo.pct) / ((ultimo.t - tramo[0].t) / HORA);
  return r > 0 ? r : null;
}

export default function GraficaBateria({ historial, bateria, ahora, compacta = false }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(0);
  const [foco, setFoco] = useState(null); // índice del punto señalado

  useEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const puntos = useMemo(() => historial.filter((p) => ahora - p.t <= 24 * HORA + 30 * 60e3), [historial, ahora]);
  const ultimo = puntos.at(-1);

  // Previsión: solo desenchufado y con ritmo de bajada.
  const prevision = useMemo(() => {
    if (!ultimo || ultimo.cargando || bateria?.cargando) return null;
    const ritmo = bateria?.ritmoPorHora > 0 ? bateria.ritmoPorHora : ritmoLocal(puntos);
    if (!ritmo) return null;
    const horas = bateria?.horasHastaReserva ?? Math.max(0, (ultimo.pct - RESERVA) / ritmo);
    const llega = ultimo.t + horas * HORA;
    return { ritmo, llega, horas };
  }, [ultimo, bateria, puntos]);

  const alto = compacta ? 132 : 200;
  const m = { izq: 34, der: 12, arr: 14, aba: 24 };
  const w = Math.max(ancho, 200);
  const inicio = ahora - 24 * HORA;
  const fin = prevision ? Math.max(ahora, Math.min(prevision.llega, ahora + MAX_FUTURO)) + 20 * 60e3 : ahora;
  const x = (t) => m.izq + ((t - inicio) / (fin - inicio)) * (w - m.izq - m.der);
  const y = (pct) => m.arr + (1 - pct / 100) * (alto - m.arr - m.aba);

  // Tramos de línea (cortados en los huecos) y franjas de carga.
  const { tramos, franjas } = useMemo(() => {
    const tr = [];
    const fr = [];
    let actual = [];
    let franja = null;
    puntos.forEach((p, i) => {
      const prev = puntos[i - 1];
      if (prev && p.t - prev.t > HUECO_MS) { if (actual.length) tr.push(actual); actual = []; }
      actual.push(p);
      if (p.cargando && !franja) franja = { desde: p.t, hasta: p.t };
      if (franja) {
        // La franja llega hasta el punto siguiente (ahí ya se vio desenchufado),
        // salvo que haya un hueco: entonces no sabemos y se corta en este.
        const sig = puntos[i + 1];
        franja.hasta = sig && sig.t - p.t <= HUECO_MS ? sig.t : p.t;
        if (!p.cargando || !sig) { fr.push(franja); franja = null; }
        else if (sig && sig.t - p.t > HUECO_MS) { fr.push(franja); franja = null; }
      }
    });
    if (actual.length) tr.push(actual);
    return { tramos: tr, franjas: fr.filter((f) => f.hasta >= inicio) };
  }, [puntos, inicio]);

  const ticks = useMemo(() => {
    const t = [];
    let h = Math.ceil(inicio / HORA) * HORA;
    for (; h <= fin; h += HORA) if (Number(fmtH.format(new Date(h))) % 6 === 0) t.push(h);
    return t;
  }, [inicio, fin]);

  const listo = ancho > 0;
  const p = foco != null ? puntos[foco] : null;

  function buscar(clientX) {
    const r = caja.current.getBoundingClientRect();
    const px = clientX - r.left;
    let mejor = null, d = Infinity;
    puntos.forEach((q, i) => { const dd = Math.abs(x(q.t) - px); if (dd < d) { d = dd; mejor = i; } });
    setFoco(mejor);
  }
  function teclas(e) {
    if (!puntos.length) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setFoco((f) => {
        const base = f ?? puntos.length - 1;
        return Math.max(0, Math.min(puntos.length - 1, base + (e.key === 'ArrowLeft' ? -1 : 1)));
      });
    } else if (e.key === 'Home') { e.preventDefault(); setFoco(0); }
    else if (e.key === 'End') { e.preventDefault(); setFoco(puntos.length - 1); }
    else if (e.key === 'Escape') setFoco(null);
  }

  const resumen = ultimo
    ? `Batería al ${Math.round(ultimo.pct)} % ${absoluta(ultimo.t, ahora)}${ultimo.cargando ? ', cargando' : ''}.` +
      (prevision ? ` A este ritmo (${prevision.ritmo.toFixed(1).replace('.', ',')} %/h) llega al ${RESERVA} % hacia las ${absoluta(prevision.llega, ahora)}.` : '')
    : 'Sin datos de batería.';

  const ptsPath = (tr) => tr.map((q, i) => `${i ? 'L' : 'M'}${x(q.t).toFixed(1)},${y(q.pct).toFixed(1)}`).join('');
  const etiquetaLlega = prevision
    ? prevision.llega > ahora + MAX_FUTURO
      ? `${RESERVA} % en ~${Math.round(prevision.horas)} h`
      : prevision.llega < ahora
        ? `${RESERVA} % hacia ${absoluta(prevision.llega, ahora)}, ya pasado`
        : `${RESERVA} % hacia ${absoluta(prevision.llega, ahora)}`
    : null;
  // Si el móvil lleva callado más de un hueco, el tramo hasta ahora queda
  // vacío a propósito y se rotula: el silencio también es un dato.
  const callado = ultimo && ahora - ultimo.t > HUECO_MS ? { desde: ultimo.t } : null;

  return (
    <figure className={`pn-grafica${compacta ? ' es-compacta' : ''}`}>
      <div
        ref={caja}
        className="pn-grafica-caja"
        style={{ height: alto }}
        tabIndex={0}
        role="img"
        aria-label={resumen + ' Flechas izquierda y derecha para recorrer los puntos.'}
        onPointerMove={(e) => listo && buscar(e.clientX)}
        onPointerDown={(e) => listo && buscar(e.clientX)}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setFoco(null); }}
        onKeyDown={teclas}
        onBlur={() => setFoco(null)}
      >
        {listo && (
          <svg width={w} height={alto} className="pn-grafica-svg" aria-hidden="true">
            {/* Franjas de carga, por debajo de todo */}
            {franjas.map((f, i) => {
              const x1 = Math.max(x(f.desde), m.izq), x2 = Math.max(x(f.hasta), x1 + 2);
              return (
                <g key={`f${i}`}>
                  <rect x={x1} y={m.arr} width={x2 - x1} height={alto - m.arr - m.aba} className="pn-g-carga" />
                  {x2 - x1 > 18 && (
                    <path transform={`translate(${(x1 + x2) / 2 - 6},${m.arr + 3}) scale(0.5)`} d="M13 3 6 13.5h5L10.5 21 18 10.5h-5z" className="pn-g-rayo" />
                  )}
                </g>
              );
            })}
            {/* Rejilla y ejes: rayas finas, un paso fuera del fondo */}
            {/* El 0 no lleva cifra: la base se sobreentiende y su etiqueta
                chocaba con la del 15 % de reserva. */}
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1={m.izq} x2={w - m.der} y1={y(v)} y2={y(v)} className="pn-g-rejilla" />
                {v > 0 && <text x={m.izq - 6} y={y(v)} className="pn-g-eje" textAnchor="end" dominantBaseline="middle">{v}</text>}
              </g>
            ))}
            <line x1={m.izq} x2={w - m.der} y1={y(RESERVA)} y2={y(RESERVA)} className="pn-g-reserva" />
            <text x={m.izq - 6} y={y(RESERVA)} className="pn-g-eje pn-g-eje-reserva" textAnchor="end" dominantBaseline="middle">{RESERVA}</text>
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={alto - 6} className="pn-g-eje" textAnchor="middle">{absoluta(t, ahora).replace(/^ayer /, '')}</text>
            ))}
            {callado && x(ahora) - x(callado.desde) > 64 && (
              <text x={(x(callado.desde) + x(ahora)) / 2} y={m.arr + 12} className="pn-g-eje pn-g-callado" textAnchor="middle">sin informes</text>
            )}
            {/* Ahora */}
            {(prevision || callado) && <line x1={x(ahora)} x2={x(ahora)} y1={m.arr} y2={alto - m.aba} className="pn-g-ahora" />}
            {/* La previsión, a trazos, por debajo de la línea real. Su rótulo va
                bajo la raya del 15 %: encima tapaba el último punto. */}
            {prevision && ultimo && (
              <>
                <line
                  x1={x(ultimo.t)} y1={y(ultimo.pct)}
                  x2={x(Math.min(prevision.llega, fin))}
                  y2={y(prevision.llega > fin ? ultimo.pct - prevision.ritmo * ((fin - ultimo.t) / HORA) : RESERVA)}
                  className="pn-g-prevision"
                />
                {prevision.llega <= fin && <circle cx={x(prevision.llega)} cy={y(RESERVA)} r="3.5" className="pn-g-llega" />}
              </>
            )}
            {tramos.map((tr, i) => (tr.length > 1
              ? <path key={`t${i}`} d={ptsPath(tr)} className="pn-g-linea" />
              : <circle key={`t${i}`} cx={x(tr[0].t)} cy={y(tr[0].pct)} r="2.5" className="pn-g-suelto" />))}
            {ultimo && <circle cx={x(ultimo.t)} cy={y(ultimo.pct)} r="4" className="pn-g-ultimo" />}
            {p && (
              <>
                <line x1={x(p.t)} x2={x(p.t)} y1={m.arr} y2={alto - m.aba} className="pn-g-cruz" />
                <circle cx={x(p.t)} cy={y(p.pct)} r="4.5" className="pn-g-foco" />
              </>
            )}
          </svg>
        )}
        {listo && etiquetaLlega && (
          <span
            className="pn-g-etiqueta"
            style={{ left: Math.min(x(Math.min(prevision.llega, fin)), w - 8), top: y(RESERVA) + 3 }}
          >
            {etiquetaLlega}
          </span>
        )}
        {listo && p && (
          <div className="pn-g-tip" style={{ left: Math.min(Math.max(x(p.t), 60), w - 60), top: 0 }} aria-hidden="true">
            <strong>{Math.round(p.pct)} %</strong>
            <span>{absoluta(p.t, ahora)}{p.cargando ? ' · cargando' : ''}</span>
          </div>
        )}
      </div>
      <figcaption className="pn-grafica-pie">
        <span className="pn-clave"><span className="pn-clave-linea" aria-hidden="true" />Batería</span>
        <span className="pn-clave"><span className="pn-clave-carga" aria-hidden="true" />Enchufado</span>
        {prevision && <span className="pn-clave"><span className="pn-clave-prev" aria-hidden="true" />Previsión</span>}
        <span className="pn-clave"><span className="pn-clave-reserva" aria-hidden="true" />Reserva {RESERVA} %</span>
      </figcaption>
      {!compacta && (
        <details className="pn-detalles">
          <summary>Ver los {puntos.length} puntos en una tabla</summary>
          <div className="pn-tabla-caja">
            <table className="pn-tabla">
              <thead><tr><th scope="col">Hora</th><th scope="col" className="pn-num">Batería</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {[...puntos].reverse().map((q) => (
                  <tr key={q.t}>
                    <td><time dateTime={new Date(q.t).toISOString()} title={completa(q.t)}>{absoluta(q.t, ahora)}</time></td>
                    <td className="pn-num">{Math.round(q.pct)} %</td>
                    <td>{q.cargando ? 'Cargando' : 'Desenchufado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  );
}
