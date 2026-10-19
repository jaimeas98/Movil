'use client';

// La línea del día: las últimas 24 h del móvil en tres carriles que comparten
// el mismo eje de tiempo, para contestar de un vistazo "¿ha estado bien?":
//  · Señal: las 96 franjas de 15 min, cada una con la peor vuelta que cayó
//    en ella. Una franja vacía es un informe que no llegó; tres o más
//    seguidas (45 min, lo mismo que el vigilante) se marcan como hueco con su
//    duración, que es lo que delata un apagón.
//  · Recogidas: cuándo recogió (07:00 y 18:00) y si salió bien.
//  · Batería: el porcentaje, con las franjas en las que estaba enchufado.
// Se recorre con el dedo, el ratón o las flechas: una raya vertical marca la
// franja y la línea de lectura de arriba dice qué pasó en ella. Esa línea es
// texto normal (aria-live), no un globo flotante: no tapa nada, no se sale de
// la pantalla en el móvil y el lector de pantalla la lee.

import { useMemo, useRef, useState } from 'react';
import { PALABRA, Vacio } from './Piezas.jsx';
import { RESERVA, cubierto, tramosCubiertos } from './datos.js';
import { absoluta, duracion, enMadrid, diaCorto, relativa } from './tiempo.js';

const HORA = 3600e3;
const FRANJA = 15 * 60e3;
const N = 96;
const HUECO_MIN = 3;            // franjas seguidas sin informe para hablar de hueco
const CORTE_BATERIA = 45 * 60e3;
const ALTO_BAT = 56;

const fmtHM = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
const hm = (t) => fmtHM.format(new Date(t));

export default function LineaDelDia({ movil, ahora }) {
  const [cursor, setCursor] = useState(null);   // índice de franja señalada
  const zona = useRef(null);

  // Las franjas acaban en la de ahora: la última es la que está en curso.
  const fin = Math.ceil(ahora / FRANJA) * FRANJA;
  const desde = fin - N * FRANJA;
  const pct = (t) => ((t - desde) / (N * FRANJA)) * 100;

  const d = useMemo(() => {
    const franjas = Array.from({ length: N }, (_, i) => ({ i, t: desde + i * FRANJA, nivel: null, vuelta: null, recogidas: [] }));
    for (const v of movil?.vueltas ?? []) {
      if (v.t < desde || v.t >= fin) continue;
      const f = franjas[Math.floor((v.t - desde) / FRANJA)];
      const peso = { fallo: 3, aviso: 2, bien: 1, nada: 0 };
      if (!f.vuelta || peso[v.nivel] > peso[f.nivel]) { f.vuelta = v; f.nivel = v.nivel; }
    }
    const recogidas = (movil?.recogidas ?? []).filter((r) => r.t >= desde && r.t < fin);
    for (const r of recogidas) franjas[Math.floor((r.t - desde) / FRANJA)].recogidas.push(r);

    // Una franja sin informe propio pero entre dos informes cercanos no es un
    // hueco: el bucle va cada ~15 min 40 s (ver tramosCubiertos en datos.js).
    const conSenal = tramosCubiertos(movil?.vueltas);
    for (const f of franjas) if (!f.vuelta && cubierto(conSenal, f.t, f.t + FRANJA)) f.nivel = 'cubierta';

    // Huecos: tramos de franjas sin señal, sin contar la de ahora (aún en
    // curso) ni lo anterior al primer apunte del historial.
    const primero = movil?.vueltas?.length ? movil.vueltas[movil.vueltas.length - 1].t : null;
    const huecos = [];
    let ini = null;
    const cerrar = (i) => { if (ini != null && i - ini >= HUECO_MIN) huecos.push({ ini, fin: i }); ini = null; };
    for (let i = 0; i < N - 1; i++) {
      const f = franjas[i];
      const antesDelHistorial = primero == null || f.t + FRANJA <= primero;
      if (!f.nivel && !antesDelHistorial) { if (ini == null) ini = i; } else cerrar(i);
    }
    cerrar(N - 1);

    // Batería: tramos cortados donde el móvil se calló, y franjas de carga.
    const puntos = (movil?.historial ?? []).filter((p) => p.t >= desde - FRANJA && p.t <= fin);
    const tramos = [];
    const cargas = [];
    let tramo = [];
    let carga = null;
    puntos.forEach((p, i) => {
      const previo = puntos[i - 1];
      if (previo && p.t - previo.t > CORTE_BATERIA) { if (tramo.length) tramos.push(tramo); tramo = []; }
      tramo.push(p);
      if (p.cargando) { if (!carga) carga = { desde: p.t, hasta: p.t }; else carga.hasta = p.t; }
      else if (carga) { carga.hasta = p.t; cargas.push(carga); carga = null; }
    });
    if (tramo.length) tramos.push(tramo);
    if (carga) cargas.push(carga);

    const llegadas = franjas.filter((f) => f.nivel).length;
    const fallos = franjas.filter((f) => f.nivel === 'fallo').length;
    return { franjas, recogidas, huecos, tramos, cargas, puntos, llegadas, fallos };
  }, [movil, desde, fin]);

  // Las horas redondas del eje (00, 06, 12, 18 de Madrid) y el cambio de día.
  const marcas = useMemo(() => {
    const out = [];
    for (let t = desde; t <= fin; t += FRANJA) {
      const p = enMadrid(t);
      if (p.minuto % 360 === 0) out.push({ t, texto: p.minuto === 0 ? diaCorto(p.dia) : `${String(p.minuto / 60).padStart(2, '0')}:00`, dia: p.minuto === 0 });
    }
    return out;
  }, [desde, fin]);

  const bateriaEn = (t) => {
    let mejor = null;
    for (const p of d.puntos) if (Math.abs(p.t - t) <= 20 * 60e3 && (!mejor || Math.abs(p.t - t) < Math.abs(mejor.t - t))) mejor = p;
    return mejor;
  };

  // ── Lectura ─────────────────────────────────────────────────────────────
  let lectura;
  if (cursor == null) {
    const prox = movil?.proximaRecogida;
    lectura = (
      <>
        Señal en <strong>{d.llegadas}</strong> de {N} franjas de 15 min
        {d.fallos ? <>, <strong className="pn-texto-fallo">{d.fallos === 1 ? '1 con fallo' : `${d.fallos} con fallo`}</strong></> : ''}
        {d.huecos.length ? <>; {d.huecos.length === 1 ? 'un hueco' : `${d.huecos.length} huecos`} sin informes</> : ', sin huecos'}
        {prox ? <>. Próxima recogida, <strong>{absoluta(prox, ahora)}</strong> ({relativa(prox, ahora)})</> : ''}.
      </>
    );
  } else {
    const f = d.franjas[cursor];
    const b = bateriaEn(f.t + FRANJA / 2);
    const hueco = d.huecos.find((h) => cursor >= h.ini && cursor < h.fin);
    lectura = (
      <>
        <strong className="pn-num-txt">{hm(f.t)}–{hm(f.t + FRANJA)}</strong>{' · '}
        {f.vuelta
          ? <span className={f.nivel === 'fallo' ? 'pn-texto-fallo' : undefined}>{f.vuelta.error || f.vuelta.resultado || PALABRA[f.nivel]}</span>
          : f.nivel === 'cubierta' ? <span className="pn-apagada">sin informe propio, pero con señal antes y después</span>
          : hueco ? <span>sin señal ({duracion((hueco.fin - hueco.ini) * FRANJA, { segundos: false })} seguidos)</span>
          : cursor === N - 1 ? <span>en curso</span> : <span className="pn-apagada">sin informe</span>}
        {f.recogidas.map((r) => <span key={r.t}> · recogida {hm(r.t)}: {r.error || r.resultado || PALABRA[r.nivel]}</span>)}
        {b && <span className="pn-apagada"> · batería {Math.round(b.pct)} %{b.cargando ? ', cargando' : ''}</span>}
      </>
    );
  }

  // ── Recorrerla ──────────────────────────────────────────────────────────
  const franjaEn = (clientX) => {
    const r = zona.current.getBoundingClientRect();
    return Math.max(0, Math.min(N - 1, Math.floor(((clientX - r.left) / r.width) * N)));
  };
  const alMover = (e) => setCursor(franjaEn(e.clientX));
  const alTeclear = (e) => {
    const paso = e.shiftKey ? 4 : 1;
    const actual = cursor ?? N - 1;
    let nuevo = null;
    if (e.key === 'ArrowLeft') nuevo = Math.max(0, actual - paso);
    else if (e.key === 'ArrowRight') nuevo = Math.min(N - 1, actual + paso);
    else if (e.key === 'Home') nuevo = 0;
    else if (e.key === 'End') nuevo = N - 1;
    else if (e.key === 'Escape') { setCursor(null); return; }
    if (nuevo != null) { e.preventDefault(); setCursor(nuevo); }
  };

  // 4 px de aire arriba y abajo: al 100 % la línea no se pega al carril de
  // las recogidas.
  const yBat = (p) => 4 + (1 - p / 100) * (ALTO_BAT - 8);

  // Sin informes del móvil (el servidor no ha podido leerlos), una línea
  // vacía diría "sin huecos": se dice lo que pasa.
  if (!movil || (movil.error && !movil.vueltas.length)) {
    return <Vacio titulo="No se han podido leer los informes del móvil">{movil?.error || 'El servidor no ha podido leer la rama estado-movil.'}</Vacio>;
  }
  const puntosSvg = (tramo) => tramo.map((p) => `${(pct(p.t) * 10).toFixed(1)},${yBat(p.pct).toFixed(1)}`).join(' ');

  return (
    <div className="pn-linea">
      {/* Región viva solo mientras se recorre: en reposo lleva "dentro de
          1 h 3 min", que cambia cada minuto y se volvería a leer sola. */}
      <p className="pn-linea-lectura" aria-live={cursor != null ? 'polite' : 'off'}>{lectura}</p>
      <div className="pn-linea-cuerpo">
        <div className="pn-linea-nombres" aria-hidden="true">
          <span style={{ height: 'var(--l-senal)' }}>Señal</span>
          <span style={{ height: 'var(--l-recogida)' }}>Recogidas</span>
          <span style={{ height: ALTO_BAT }}>Batería</span>
        </div>
        <div
          ref={zona}
          className="pn-linea-zona"
          role="group"
          tabIndex={0}
          aria-label="Las últimas 24 horas del móvil. Usa las flechas para recorrerlas por franjas de 15 minutos."
          onPointerMove={alMover}
          onPointerDown={alMover}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setCursor(null); }}
          onKeyDown={alTeclear}
          onBlur={() => setCursor(null)}
        >
          {/* Señal */}
          <div className="pn-linea-senal" aria-hidden="true">
            {d.franjas.map((f) => (
              <span key={f.i} className="pn-franja" data-nivel={f.nivel ?? (f.i === N - 1 ? 'curso' : 'vacia')} />
            ))}
            {d.huecos.map((h) => (
              <span key={h.ini} className="pn-hueco" style={{ left: `${(h.ini / N) * 100}%`, width: `${((h.fin - h.ini) / N) * 100}%` }}>
                {h.fin - h.ini >= 8 && <span>{duracion((h.fin - h.ini) * FRANJA, { segundos: false })} sin señal</span>}
              </span>
            ))}
          </div>

          {/* Recogidas */}
          <div className="pn-linea-recogidas" aria-hidden="true">
            {d.recogidas.map((r) => (
              <span key={r.t} className="pn-recogida-marca" data-nivel={r.nivel} data-izq={pct(r.t) > 88 ? '' : undefined} style={{ left: `${pct(r.t)}%` }}>
                <span className="pn-recogida-ficha" />
                <span className="pn-recogida-hora">{hm(r.t)}</span>
              </span>
            ))}
          </div>

          {/* Batería */}
          <svg className="pn-linea-bateria" viewBox={`0 0 1000 ${ALTO_BAT}`} preserveAspectRatio="none" height={ALTO_BAT} aria-hidden="true">
            {d.cargas.map((c) => (
              <rect key={c.desde} className="pn-l-carga" x={pct(c.desde) * 10} width={Math.max(2, (pct(c.hasta) - pct(c.desde)) * 10)} y="0" height={ALTO_BAT} />
            ))}
            <line className="pn-l-reserva" x1="0" x2="1000" y1={yBat(RESERVA)} y2={yBat(RESERVA)} vectorEffect="non-scaling-stroke" />
            {d.tramos.map((tr) => (tr.length > 1
              ? <polyline key={tr[0].t} className="pn-l-linea" points={puntosSvg(tr)} vectorEffect="non-scaling-stroke" />
              : null))}
          </svg>

          {marcas.map((m) => (
            <span key={m.t} className="pn-linea-guia" data-dia={m.dia ? '' : undefined} style={{ left: `${pct(m.t)}%` }} aria-hidden="true" />
          ))}
          {cursor != null && <span className="pn-linea-cursor" style={{ left: `${((cursor + 0.5) / N) * 100}%` }} aria-hidden="true" />}
        </div>
      </div>
      <div className="pn-linea-eje" aria-hidden="true">
        {/* Sin rótulos pegados a los bordes: a la derecha está "ahora" y a la
            izquierda se saldrían de la caja. */}
        {marcas.filter((m) => pct(m.t) > 3 && pct(m.t) < 93).map((m) => (
          <span key={m.t} data-dia={m.dia ? '' : undefined} style={{ left: `${pct(m.t)}%` }}>{m.texto}</span>
        ))}
        <span className="pn-linea-ahora" style={{ left: '100%' }}>ahora</span>
      </div>
    </div>
  );
}
