'use client';

// Móvil: todo lo que manda el recolector de casa.
// Orden de lectura: cómo está ahora (informe y batería), qué ha hecho (vueltas
// y recogidas) y, al final, el registro en bruto para cuando hay que
// entender un fallo concreto.

import { useMemo, useState } from 'react';
import Icono from './Icono.jsx';
import { Estado, Fallo, Hora, PuntoCine, Seccion, Vacio, cifra } from './Piezas.jsx';
import GraficaBateria from './GraficaBateria.jsx';
import Registro from './Registro.jsx';
import { ordenCines, valorarBateria, valorarLatido } from './datos.js';
import { duracion } from './tiempo.js';

function Dato({ k, children, ancho }) {
  return (
    <div className={`pn-dato${ancho ? ' es-ancho' : ''}`}>
      <dt>{k}</dt>
      <dd>{children ?? <span className="pn-tenue">—</span>}</dd>
    </div>
  );
}

function Informe({ movil, ahora }) {
  const i = movil.informe;
  const lat = valorarLatido(movil, ahora);
  const bat = valorarBateria(movil, ahora);
  if (!i) {
    return <Vacio titulo="Sin informe del móvil">El servidor no ha podido leer estado.json en la rama estado-movil.</Vacio>;
  }
  const b = movil.bateria;
  const disp = i.dispositivo ? [i.dispositivo.modelo, i.dispositivo.android && `Android ${i.dispositivo.android}`, i.dispositivo.node && `Node ${i.dispositivo.node}`].filter(Boolean).join(' · ') : null;
  return (
    <>
      <div className="pn-estado-grande">
        <div className="pn-cifra-estado" data-nivel={lat.nivel}>
          <Estado nivel={lat.nivel} />
          <p className="pn-cifra-valor">{lat.valor}</p>
          {lat.detalle && <p className="pn-cifra-detalle">{lat.detalle}</p>}
        </div>
        <div className="pn-cifra-estado" data-nivel={bat.nivel}>
          <Estado nivel={bat.nivel} />
          <p className="pn-cifra-valor">Batería {bat.valor}</p>
          {bat.detalle && <p className="pn-cifra-detalle">{bat.detalle}</p>}
        </div>
      </div>
      <dl className="pn-datos">
        <Dato k="Última vuelta"><Hora t={movil.latido} ahora={ahora} /></Dato>
        <Dato k="Resultado">{i.resultado}</Dato>
        {i.motivo && <Dato k="Motivo">{i.motivo}</Dato>}
        {i.error && <Dato k="Error" ancho><span className="pn-texto-fallo">{i.error}</span></Dato>}
        <Dato k="Última recogida"><Hora t={movil.ultimaRecogida} ahora={ahora} /></Dato>
        <Dato k="Próxima recogida"><Hora t={movil.proximaRecogida} ahora={ahora} /></Dato>
        <Dato k="Código">{i.codigo && <span className="pn-mono">{i.codigo}</span>}</Dato>
        <Dato k="Última orden">{i.ultimaOrden && <span className="pn-mono">{i.ultimaOrden}</span>}</Dato>
        {b && <Dato k="Batería">{[b.pct != null && `${Math.round(b.pct)} %`, b.cargando ? 'cargando' : 'sin cargar', b.estado && b.estado.toLowerCase() === 'good' ? 'salud buena' : b.estado, b.temperatura != null && `${cifra(b.temperatura, { decimales: 1 })} °C`].filter(Boolean).join(' · ')}</Dato>}
        {i.enchufe != null && <Dato k="Enchufe">{typeof i.enchufe === 'object' ? JSON.stringify(i.enchufe) : String(i.enchufe)}</Dato>}
        <Dato k="Dispositivo" ancho>{disp}</Dato>
      </dl>
    </>
  );
}

// ── Vueltas: una tira de 24 h (96 casillas de 15 min) y la lista ──────────
const CASILLA = 15 * 60e3;

function TiraVueltas({ vueltas, ahora }) {
  const { casillas, resumen } = useMemo(() => {
    const desde = ahora - 24 * 3600e3;
    const c = Array.from({ length: 96 }, (_, i) => ({ desde: desde + i * CASILLA, nivel: null, v: null }));
    let n = 0, fallos = 0;
    for (const v of vueltas) {
      if (v.t < desde) continue;
      n++;
      if (v.nivel === 'fallo') fallos++;
      const i = Math.min(95, Math.floor((v.t - desde) / CASILLA));
      const peso = { fallo: 3, aviso: 2, bien: 1, nada: 0 };
      if (!c[i].v || peso[v.nivel] > peso[c[i].nivel]) { c[i].nivel = v.nivel; c[i].v = v; }
    }
    // El hueco más largo sin informes: es lo que dice "estuvo apagado".
    let largo = 0, actual = 0, finHueco = null;
    c.forEach((x, i) => { if (!x.v) { actual++; if (actual > largo) { largo = actual; finHueco = i; } } else actual = 0; });
    const hueco = largo >= 3 ? { ms: largo * CASILLA, hasta: desde + (finHueco + 1) * CASILLA } : null;
    return { casillas: c, resumen: { n, fallos, hueco } };
  }, [vueltas, ahora]);

  return (
    <div className="pn-tira">
      <p className="pn-tira-resumen">
        {resumen.n === 0 ? 'Ninguna vuelta en las últimas 24 h.' : (
          <>
            <strong>{resumen.n}</strong> vueltas en 24 h
            {resumen.fallos ? <>, <strong className="pn-texto-fallo">{resumen.fallos === 1 ? '1 fallida' : `${resumen.fallos} fallidas`}</strong></> : ', ninguna fallida'}
            {resumen.hueco && <>; el hueco más largo, <strong>{duracion(resumen.hueco.ms, { segundos: false })}</strong> sin informes</>}.
          </>
        )}
      </p>
      <div className="pn-tira-casillas" aria-hidden="true">
        {casillas.map((x) => (
          <span
            key={x.desde}
            className="pn-casilla"
            data-nivel={x.nivel || 'vacia'}
            title={x.v ? `${new Date(x.v.t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })} · ${x.v.resultado || ''}` : undefined}
          />
        ))}
      </div>
      <div className="pn-tira-eje" aria-hidden="true"><span>hace 24 h</span><span>hace 12 h</span><span>ahora</span></div>
    </div>
  );
}

// Las vueltas rutinarias seguidas (mismo resultado, todo bien, sin orden ni
// hueco de más de 20 min entre ellas) se juntan en una línea: 30 filas de "no
// tocaba" esconden el único fallo que se viene a buscar.
function agrupar(lista) {
  const out = [];
  for (const v of lista) {
    const ult = out.at(-1);
    const rutinaria = v.nivel === 'bien' && !v.orden && !v.error;
    const base = ult;
    if (rutinaria && base && base.rutinaria && base.resultado === v.resultado && (base.desde ?? base.t) - v.t <= 20 * 60e3) {
      if (!base.grupo) {
        out[out.length - 1] = { grupo: true, rutinaria: true, t: base.t, desde: v.t, n: 2, resultado: v.resultado, batMin: null, batMax: null };
        for (const x of [base, v]) sumarBat(out.at(-1), x.bateria);
      } else {
        base.n++; base.desde = v.t; sumarBat(base, v.bateria);
      }
      continue;
    }
    out.push({ ...v, rutinaria });
  }
  return out;
}
function sumarBat(g, b) {
  if (b == null) return;
  const r = Math.round(b);
  g.batMin = g.batMin == null ? r : Math.min(g.batMin, r);
  g.batMax = g.batMax == null ? r : Math.max(g.batMax, r);
}

function Vueltas({ movil, ahora }) {
  const [soloFallos, setSoloFallos] = useState(false);
  const [cuantas, setCuantas] = useState(96);
  const todas = movil.vueltas;
  const lista = soloFallos ? todas.filter((v) => v.nivel === 'fallo' || v.nivel === 'aviso') : todas;
  if (!todas.length) {
    return (
      <Vacio titulo="Aún no hay historial de vueltas">
        {movil.ficheros?.['historial.jsonl'] === false
          ? 'El móvil todavía no publica historial.jsonl: lo hará cuando coja la versión nueva del recolector.'
          : 'Aparecerá aquí en cuanto el móvil dé su próxima vuelta.'}
      </Vacio>
    );
  }
  return (
    <>
      <TiraVueltas vueltas={todas} ahora={ahora} />
      <div className="pn-filtros" role="group" aria-label="Qué vueltas enseñar">
        <button type="button" className="pn-segmento" aria-pressed={!soloFallos} onClick={() => setSoloFallos(false)}>Todas</button>
        <button type="button" className="pn-segmento" aria-pressed={soloFallos} onClick={() => setSoloFallos(true)}>
          Solo fallos y avisos
        </button>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Ningún fallo en los últimos 7 días" />
      ) : (
        <ol className="pn-linea-tiempo">
          {agrupar(lista.slice(0, cuantas)).map((v) => (v.grupo ? (
            <li key={`g-${v.t}`} className="pn-vuelta es-grupo" data-nivel="bien">
              <span className="pn-vuelta-hora"><Hora t={v.t} ahora={ahora} solo="absoluta" /></span>
              <Estado nivel="bien" compacto />
              <div className="pn-vuelta-cuerpo">
                <p className="pn-vuelta-res">{v.resultado}</p>
                <p className="pn-vuelta-motivo">{v.n} vueltas seguidas igual, desde <Hora t={v.desde} ahora={ahora} solo="absoluta" /></p>
              </div>
              <span className="pn-vuelta-bat">{v.batMin != null ? (v.batMin === v.batMax ? `${v.batMin} %` : `${v.batMin}–${v.batMax} %`) : ''}</span>
            </li>
          ) : (
            <li key={`${v.t}-${v.resultado}`} className="pn-vuelta" data-nivel={v.nivel}>
              <Hora t={v.t} ahora={ahora} solo="absoluta" className="pn-vuelta-hora" />
              <Estado nivel={v.nivel} compacto />
              <div className="pn-vuelta-cuerpo">
                <p className="pn-vuelta-res">{v.resultado || 'Sin resultado'}{v.orden && <span className="pn-apagada"> · orden <span className="pn-mono">{v.orden}</span></span>}</p>
                {(v.error || v.motivo) && <p className={v.error ? 'pn-vuelta-error' : 'pn-vuelta-motivo'}>{v.error || v.motivo}</p>}
              </div>
              <span className="pn-vuelta-bat">{v.bateria != null ? `${Math.round(v.bateria)} %` : ''}{v.cargando ? <Icono nombre="rayo" className="pn-ico-peq" titulo="cargando" /> : null}</span>
            </li>
          )))}
        </ol>
      )}
      {lista.length > cuantas && (
        <button type="button" className="pn-boton pn-mas" onClick={() => setCuantas((n) => n + 96)}>
          Ver vueltas más antiguas (quedan {lista.length - cuantas})
        </button>
      )}
    </>
  );
}

function Recogidas({ movil, ahora }) {
  const lista = movil.recogidas;
  if (!lista.length) {
    return (
      <Vacio titulo="Aún no hay recogidas apuntadas">
        {movil.ficheros?.['recogidas.jsonl'] === false
          ? 'El móvil todavía no publica recogidas.jsonl: lo hará cuando coja la versión nueva del recolector.'
          : 'La primera aparecerá tras el próximo turno de recogida.'}
      </Vacio>
    );
  }
  // Una lista y no una tabla: en el móvil, cinco columnas de cifras obligaban
  // a desplazarse de lado. Cada recogida es una fila con sus cines en línea
  // (punto de color + nombre corto + cifras), que parten donde haga falta.
  return (
    <ol className="pn-recogidas">
      {lista.slice(0, 40).map((r) => (
        <li key={r.t} className="pn-recogida" data-nivel={r.nivel}>
          <div className="pn-recogida-cuando">
            <Hora t={r.t} ahora={ahora} solo="absoluta" />
            {r.motivo && <span className="pn-celda-sub">{r.motivo}</span>}
          </div>
          <div className="pn-recogida-cuerpo">
            <p className="pn-celda-res">
              <Estado nivel={r.nivel} compacto />
              <span>{r.error || r.resultado || '—'}</span>
            </p>
            <ul className="pn-recogida-cines">
              {ordenCines.map((id) => {
                const c = r.cines.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <li key={id} className="pn-chip-cine" data-mal={c.error ? 'si' : undefined}>
                    <PuntoCine id={id} />
                    <span className="pn-chip-nombre">{CORTO[id]}</span>
                    {c.error
                      ? <span className="pn-texto-fallo"><Icono nombre="fallo" className="pn-ico-peq" />{c.error}</span>
                      : <span><strong>{cifra(c.peliculas)}</strong> pelis · {cifra(c.dias)} días</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="pn-recogida-meta">
            {r.duracionMs != null && <span>{duracion(r.duracionMs)}</span>}
            {r.partes.length > 0 && <span className="pn-celda-sub">{r.partes.join(' + ')}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const CORTO = { 'cinesur-bahia-cadiz': 'Cinesur', 'yelmo-bahia-sur': 'Bahía Sur', 'yelmo-jerez': 'Área Sur', 'arte-siete-puerto': 'Arte Siete' };

export default function Movil({ datos, ahora }) {
  const movil = datos.movil;
  if (!movil) {
    return <Fallo titulo="No hay datos del móvil" error={{ message: 'El servidor no ha podido leer la rama estado-movil.' }} />;
  }
  return (
    <div className="pn-pila">
      {movil.error && (
        <Fallo titulo="Parte de los datos del móvil no se han podido leer" error={{ message: movil.error }} />
      )}
      <Seccion id="m-informe" titulo="Ahora">
        <Informe movil={movil} ahora={ahora} />
      </Seccion>
      <Seccion id="m-bateria" titulo="Batería, 24 h">
        {movil.historial.length ? (
          <GraficaBateria historial={movil.historial} bateria={movil.bateria} ahora={ahora} />
        ) : (
          <Vacio titulo="Sin historial de batería">
            {movil.ficheros?.['bateria-historial.json'] === false
              ? 'El móvil aún no publica bateria-historial.json.'
              : 'El móvil apunta un punto en cada vuelta; aparecerá en la próxima.'}
          </Vacio>
        )}
      </Seccion>
      <Seccion id="m-vueltas" titulo="Vueltas">
        <Vueltas movil={movil} ahora={ahora} />
      </Seccion>
      <Seccion id="m-recogidas" titulo="Recogidas">
        <Recogidas movil={movil} ahora={ahora} />
      </Seccion>
      <Seccion id="m-registro" titulo="Registro">
        <Registro texto={movil.registro} />
      </Seccion>
    </div>
  );
}
