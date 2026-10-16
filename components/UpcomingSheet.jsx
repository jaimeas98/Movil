'use client';

import { useMemo, useState } from 'react';
import { minutesToHuman } from '@/lib/normalize.js';
import { fechaCorta, mesDe } from '@/lib/proximas.js';
import { minutosDeSesion } from '@/lib/cartelera.js';
import Hoja from './Hoja.jsx';
import Icono from './Icono.jsx';
import Entrada from './Entrada.jsx';
import { Cartel } from './Pelicula.jsx';
import { Estado } from './Estados.jsx';

// Próximas: lo que los cines ya tienen en el calendario más allá de la tira de
// días (ciclos, reestrenos, óperas). Misma hoja y mismo gesto que la ficha,
// para que se aprenda una sola vez; los pases, con las mismas entradas.

// Los pases de cada mes juntos, con su rótulo: así un ciclo a dos meses vista
// no se mezcla con lo de la semana que viene.
function porMes(peliculas) {
  const meses = [];
  for (const p of peliculas) {
    const mes = mesDe(p.primeraFecha);
    const ultimo = meses.at(-1);
    if (ultimo?.mes === mes) ultimo.peliculas.push(p);
    else meses.push({ mes, peliculas: [p] });
  }
  return meses;
}

// Los pases de una película por DÍA y, dentro del día, por cine con sus
// entradas en la misma línea. Antes cada pase llevaba encima "vie 30 oct ·
// Cinesur" aunque solo tuviera una entrada: la cabecera pesaba más que lo que
// encabezaba.
function porDia(pases) {
  const dias = [];
  for (const pase of pases) {
    const ultimo = dias.at(-1);
    if (ultimo?.iso === pase.iso) ultimo.pases.push(pase);
    else dias.push({ iso: pase.iso, pases: [pase] });
  }
  return dias;
}

function Pase({ pase, titulo }) {
  const cine = { id: pase.cineId, short: pase.cineNombre, name: pase.cineNombre };
  const sesiones = pase.sesiones
    .map((s) => ({ ...s, minuto: minutosDeSesion(s.time) }))
    .filter((s) => s.minuto != null);
  return (
    <li className="prox-pase" data-cine={pase.cineId}>
      <span className="prox-pase-cine">
        <span className="punto" aria-hidden="true" />
        {pase.cineNombre}
      </span>
      <ul className="entradas">
        {sesiones.map((s, j) => (
          <li key={`${s.time}-${j}`}>
            <Entrada sesion={s} cine={cine} pelicula={{ title: titulo }} fecha={pase.iso} onAbrir={null} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function Pases({ pases, titulo }) {
  return (
    <ul className="prox-dias">
      {porDia(pases).map(({ iso, pases: delDia }) => (
        <li key={iso} className="prox-dia">
          <p className="prox-pase-dia">{fechaCorta(iso)}</p>
          <ul className="prox-pases">
            {delDia.map((pase, i) => (
              <Pase key={`${pase.cineId}-${i}`} pase={pase} titulo={titulo} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function UpcomingSheet({ peliculas, onClose }) {
  const [abierta, setAbierta] = useState(null); // clave de la película desplegada
  const meses = useMemo(() => porMes(peliculas), [peliculas]);

  return (
    <Hoja variante="proximas" etiquetadaPor="prox-titulo" onCerrar={onClose}>
      <div className="prox-head">
        <h2 className="prox-title" id="prox-titulo">Próximas</h2>
        <p className="prox-sub">
          Ciclos y reestrenos que los cines ya tienen en el calendario, más allá
          de los días de la cartelera.
        </p>
      </div>

      {peliculas.length === 0 ? (
        <Estado icono="calendario" titulo="Nada programado todavía">
          Cuando los cines anuncien ciclos o reestrenos, aparecerán aquí.
        </Estado>
      ) : (
        meses.map(({ mes, peliculas: lista }) => (
          <section className="prox-grupo" key={mes} aria-label={mes}>
            <h3 className="prox-mes">{mes}</h3>
            <ul className="prox-lista">
              {lista.map((p) => {
                const clave = p.id || p.title;
                const desplegada = abierta === clave;
                const duracion = minutesToHuman(p.durationMin);
                const id = `prox-${String(clave).replace(/[^\w-]/g, '')}`;
                return (
                  <li key={clave} className="prox-item" data-abierta={desplegada ? 'true' : undefined}>
                    <button
                      type="button"
                      className="prox-cabecera pulsable"
                      aria-expanded={desplegada}
                      aria-controls={id}
                      onClick={() => setAbierta(desplegada ? null : clave)}
                    >
                      <span className="prox-cartel" aria-hidden="true">
                        <Cartel pelicula={p} className="prox-cartel-img" />
                      </span>
                      <span className="prox-datos">
                        <span className="prox-nombre">{p.title}</span>
                        <span className="prox-meta">
                          {p.genre && <span>{p.genre}</span>}
                          {duracion && <span>{duracion}</span>}
                          <span>{p.pases.length} {p.pases.length === 1 ? 'pase' : 'pases'}</span>
                        </span>
                      </span>
                      {/* Lo primero que se quiere saber: cuándo cae */}
                      <span className="prox-cuando">
                        <span className="prox-fecha">{fechaCorta(p.primeraFecha)}</span>
                        <Icono nombre="abajo" className="ico prox-flecha" />
                      </span>
                    </button>

                    {desplegada && (
                      <div className="prox-detalle" id={id}>
                        {p.synopsis && <p className="prox-sinopsis">{p.synopsis}</p>}
                        <Pases pases={p.pases} titulo={p.title} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </Hoja>
  );
}
