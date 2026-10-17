'use client';

// El registro del móvil (registro.txt), legible.
//
// El fichero es una tira de vueltas, cada una empieza con
// "=== 2026-10-13 18:35:13 vuelta". Aquí se parte por vueltas, se enseña la
// más reciente arriba (es la que se viene a mirar) y cada línea que dice que
// algo ha ido mal se marca con su forma, no solo con color. Se puede buscar
// (resalta y cuenta las coincidencias) y quedarse solo con las vueltas que
// tienen fallos o que ejecutaron una orden.
//
// Monoespaciada a propósito: es salida de terminal y sus columnas y sangrías
// significan algo. Las líneas largas parten donde haga falta: nunca hay
// desplazamiento horizontal.

import { useDeferredValue, useMemo, useState } from 'react';
import Icono from './Icono.jsx';
import { Vacio } from './Piezas.jsx';

const CABECERA = /^===\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\s*(.*)$/;
const MAL = /❌|\bfallo\b|\berror\b|\b40[34]\b|\b5\d\d\b|cloudflare|bloquead|no se ha podido|timeout|abortad|sin red|killed/i;
const BIEN = /✅|VEREDICTO: FUNCIONA|recogida y publicada|resultado: (ok|bien)/i;
const RUTINA = /^(código al día|ya hay otra vuelta|recogiendo: no toca)/i;

function partir(texto) {
  const bloques = [];
  let actual = null;
  for (const linea of texto.replace(/\r/g, '').split('\n')) {
    const m = linea.match(CABECERA);
    if (m) {
      actual = { cuando: m[1], tipo: m[2] || '', lineas: [] };
      bloques.push(actual);
    } else if (actual) {
      actual.lineas.push(linea);
    } else if (linea.trim()) {
      actual = { cuando: null, tipo: 'antes de la primera vuelta', lineas: [linea] };
      bloques.push(actual);
    }
  }
  for (const b of bloques) {
    while (b.lineas.length && !b.lineas.at(-1).trim()) b.lineas.pop();
    b.mal = b.lineas.some((l) => MAL.test(l));
    b.orden = /orden/i.test(b.tipo) || b.lineas.some((l) => /ejecutando orden|^orden:/i.test(l));
  }
  return bloques.reverse();
}

function resaltar(linea, q) {
  if (!q) return linea;
  const partes = [];
  const bajo = linea.toLowerCase();
  let i = 0;
  for (;;) {
    const j = bajo.indexOf(q, i);
    if (j < 0) break;
    if (j > i) partes.push(linea.slice(i, j));
    partes.push(<mark key={j}>{linea.slice(j, j + q.length)}</mark>);
    i = j + q.length;
  }
  partes.push(linea.slice(i));
  return partes;
}

const POR_PAGINA = 10;

export default function Registro({ texto }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todo');
  const [cuantos, setCuantos] = useState(POR_PAGINA);
  const q = useDeferredValue(busca.trim().toLowerCase());

  const bloques = useMemo(() => (texto ? partir(texto) : []), [texto]);
  const { visibles, coincidencias } = useMemo(() => {
    let lista = bloques;
    if (filtro === 'fallos') lista = lista.filter((b) => b.mal);
    if (filtro === 'ordenes') lista = lista.filter((b) => b.orden);
    let n = 0;
    if (q) {
      lista = lista.filter((b) => {
        const k = b.lineas.reduce((s, l) => s + (l.toLowerCase().split(q).length - 1), 0) + ((b.tipo || '').toLowerCase().includes(q) ? 1 : 0);
        n += k;
        return k > 0;
      });
    }
    return { visibles: lista, coincidencias: n };
  }, [bloques, filtro, q]);

  if (!texto || !texto.trim()) {
    return <Vacio titulo="El registro está vacío">El móvil sube registro.txt en cada vuelta; aparecerá tras la próxima.</Vacio>;
  }

  const conFallos = bloques.filter((b) => b.mal).length;

  return (
    <div className="pn-registro">
      <div className="pn-registro-mandos">
        <label className="pn-buscar">
          <Icono nombre="lupa" className="pn-ico pn-buscar-ico" />
          <span className="sr">Buscar en el registro</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setCuantos(POR_PAGINA); }}
            placeholder="Buscar: cloudflare, orden, 403…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="pn-filtros" role="group" aria-label="Qué vueltas enseñar">
          <button type="button" className="pn-segmento" aria-pressed={filtro === 'todo'} onClick={() => setFiltro('todo')}>Todas</button>
          <button type="button" className="pn-segmento" aria-pressed={filtro === 'fallos'} onClick={() => setFiltro('fallos')}>Con fallos ({conFallos})</button>
          <button type="button" className="pn-segmento" aria-pressed={filtro === 'ordenes'} onClick={() => setFiltro('ordenes')}>Órdenes</button>
        </div>
      </div>
      <p className="pn-registro-cuenta" aria-live="polite">
        {q
          ? visibles.length ? `${coincidencias} ${coincidencias === 1 ? 'coincidencia' : 'coincidencias'} en ${visibles.length} ${visibles.length === 1 ? 'vuelta' : 'vueltas'}` : `Nada contiene «${busca.trim()}».`
          : `${visibles.length} ${visibles.length === 1 ? 'vuelta' : 'vueltas'}, la más reciente arriba`}
      </p>
      {visibles.length > 0 && (
        <ol className="pn-registro-lista">
          {visibles.slice(0, cuantos).map((b, i) => (
            <li key={`${b.cuando}-${i}`} className="pn-registro-bloque" data-mal={b.mal || undefined}>
              <p className="pn-registro-cab">
                {b.mal && <Icono nombre="fallo" className="pn-ico-peq pn-texto-fallo" titulo="con fallos" />}
                <span className="pn-mono">{b.cuando ?? '—'}</span>
                <span>{b.tipo}</span>
              </p>
              <pre className="pn-registro-pre">
                {b.lineas.length === 0 ? <span className="pn-tenue">(sin salida)</span> : b.lineas.map((l, k) => {
                  const clase = MAL.test(l) ? 'es-mal' : BIEN.test(l) ? 'es-bien' : RUTINA.test(l) ? 'es-rutina' : '';
                  return <span key={k} className={`pn-registro-linea ${clase}`}>{resaltar(l, q)}{'\n'}</span>;
                })}
              </pre>
            </li>
          ))}
        </ol>
      )}
      {visibles.length > cuantos && (
        <button type="button" className="pn-boton pn-mas" onClick={() => setCuantos((n) => n + POR_PAGINA)}>
          Ver {Math.min(POR_PAGINA, visibles.length - cuantos)} vueltas más antiguas
        </button>
      )}
    </div>
  );
}
