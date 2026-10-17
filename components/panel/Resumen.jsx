'use client';

// Resumen: una pantalla que contesta "¿está todo bien?".
//
// Arriba, el veredicto en letra de marquesina (la única licencia de rótulo de
// esta pantalla). Debajo, una fila por cosa que puede ir mal, siempre en el
// mismo orden para que el ojo aprenda dónde está cada una: lo que está bien
// se queda en tinta tranquila y solo lo que falla se enciende. Cada fila lleva
// a su sección.

import Icono from './Icono.jsx';
import { Estado, Hora, PuntoCine } from './Piezas.jsx';
import { veredicto } from './datos.js';
import GraficaBateria from './GraficaBateria.jsx';

function Fila({ v, ir }) {
  return (
    <li>
      <button type="button" className="pn-fila pulsable" data-nivel={v.nivel} onClick={() => ir(v.seccion)}>
        <Estado nivel={v.nivel} compacto />
        <span className="pn-fila-cuerpo">
          <span className="pn-fila-linea">
            <span className="pn-fila-titulo">
              {v.cine && <PuntoCine id={v.cine} />}
              {v.titulo}
            </span>
            <span className="pn-fila-valor">{v.valor}</span>
          </span>
          {v.detalle && <span className="pn-fila-detalle">{v.detalle}</span>}
        </span>
        <span className="pn-fila-palabra" aria-hidden="true">{{ bien: 'Bien', aviso: 'Aviso', fallo: 'Fallo', nada: 'Sin datos' }[v.nivel]}</span>
      </button>
    </li>
  );
}

export default function Resumen({ datos, val, ahora, ir }) {
  const ver = veredicto(val);
  const pendientes = datos.movil?.ordenes.pendientes ?? [];
  const bat = datos.movil?.bateria;
  return (
    <div className="pn-resumen">
      <div className="pn-veredicto" data-nivel={ver.nivel} role="status">
        <Icono nombre={ver.nivel} className="pn-veredicto-ico" />
        <p>
          <span className="pn-veredicto-txt">{ver.texto}</span>
          {ver.sub && <span className="pn-veredicto-sub"> {ver.sub}</span>}
        </p>
      </div>

      <div className="pn-resumen-rejilla">
        <div className="pn-resumen-filas">
          <section aria-labelledby="r-movil">
            <h2 id="r-movil" className="pn-grupo">Móvil</h2>
            <ul className="pn-filas">{val.movil.map((v) => <Fila key={v.id} v={v} ir={ir} />)}</ul>
          </section>
          <section aria-labelledby="r-cines">
            <h2 id="r-cines" className="pn-grupo">Cines en la web</h2>
            <ul className="pn-filas">{val.cines.map((v) => <Fila key={v.id} v={v} ir={ir} />)}</ul>
          </section>
          <section aria-labelledby="r-avisos">
            <h2 id="r-avisos" className="pn-grupo">Vigilante</h2>
            <ul className="pn-filas"><Fila v={val.avisos} ir={ir} /></ul>
          </section>
        </div>

        <div className="pn-resumen-lado">
          {pendientes.length > 0 && (
            <section aria-labelledby="r-ordenes" className="pn-lado-bloque">
              <h2 id="r-ordenes" className="pn-grupo">Órdenes en camino</h2>
              <ul className="pn-mini-lista">
                {pendientes.map((o) => (
                  <li key={o.id}>
                    <button type="button" className="pn-enlace-fila" onClick={() => ir('acciones')}>
                      <Icono nombre="espera" className="pn-ico pn-ico-tenue" />
                      <span className="pn-mono">{o.accion}</span>
                      <span className="pn-apagada">pedida <Hora t={o.pedida} ahora={ahora} solo="relativa" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="r-bat" className="pn-lado-bloque">
            <h2 id="r-bat" className="pn-grupo">Batería, últimas 24 h</h2>
            {datos.movil?.historial?.length ? (
              <GraficaBateria historial={datos.movil.historial} bateria={bat} ahora={ahora} compacta />
            ) : (
              <p className="pn-apagada pn-pequeno">El móvil aún no ha mandado su historial de batería.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
