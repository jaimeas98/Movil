'use client';

import { useEffect, useRef, useState } from 'react';
import Icono from './Icono.jsx';
import { nombreInterruptor } from '@/lib/rotulos.js';

// Fila de controles: buscar, cines, género y el cambio Películas / Horario.
//
// Antes eran dos filas de pastillas (género y cine) que ocupaban la primera
// pantalla del móvil entera y dejaban la cartelera bajo el pliegue. Ahora el
// género vive en un panel que se abre al pedirlo, la búsqueda es un icono que
// se despliega, y los cines son cuatro interruptores con su color.

// ← y → mueven el foco dentro de un grupo de botones. Que además no cambien de
// día por detrás se resuelve en app/page.js con el atributo data-flechas: en
// App Router React escucha en `document`, el mismo nodo que el atajo global,
// así que detener la propagación desde aquí no serviría de nada.
function moverConFlechas(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const botones = Array.from(e.currentTarget.querySelectorAll('button:not([disabled])'));
  const i = botones.indexOf(document.activeElement);
  if (i === -1) return;
  e.preventDefault();
  const destino =
    e.key === 'Home' ? 0 :
    e.key === 'End' ? botones.length - 1 :
    e.key === 'ArrowRight' ? Math.min(botones.length - 1, i + 1) : Math.max(0, i - 1);
  botones[destino].focus();
  botones[destino].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function PanelGeneros({ genero, generos, onGenero }) {
  const [abierto, setAbierto] = useState(false);
  const envoltorio = useRef(null);
  const disparador = useRef(null);
  const panel = useRef(null);

  // El género elegido puede no existir el día al que te has movido: entonces
  // se enseña igualmente para poder quitarlo.
  const lista = genero && !generos.some((g) => g.nombre === genero)
    ? [{ nombre: genero, cuenta: 0 }, ...generos]
    : generos;

  useEffect(() => {
    if (!abierto) return;
    // Al abrir, el foco va a la opción elegida: es por donde se sigue.
    const elegido = panel.current?.querySelector('[aria-checked="true"]') ?? panel.current?.querySelector('button');
    elegido?.focus({ preventScroll: true });
    elegido?.scrollIntoView?.({ block: 'nearest' });

    const fuera = (e) => {
      if (!envoltorio.current?.contains(e.target)) setAbierto(false);
    };
    // En captura y cortando la propagación: Escape aquí cierra el panel y no
    // debe llegar al atajo global, que borraría la búsqueda por detrás.
    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAbierto(false);
        disparador.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla, true);
    };
  }, [abierto]);

  const elegir = (g) => {
    onGenero(g);
    setAbierto(false);
    disparador.current?.focus();
  };

  const alTeclear = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const ops = Array.from(panel.current?.querySelectorAll('button') ?? []);
    const i = ops.indexOf(document.activeElement);
    e.preventDefault();
    const j = e.key === 'ArrowDown' ? Math.min(ops.length - 1, i + 1) : Math.max(0, i - 1);
    ops[j]?.focus();
  };

  return (
    <div className="control-genero" ref={envoltorio} data-flechas>
      <button
        ref={disparador}
        type="button"
        className="control-pastilla pulsable"
        data-activo={genero ? 'true' : undefined}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls="panel-generos"
        onClick={() => setAbierto((v) => !v)}
      >
        <Icono nombre="generos" />
        <span className="control-pastilla-texto">{genero || 'Género'}</span>
        <Icono nombre="abajo" className="ico ico-chevron" />
      </button>

      {abierto && (
        <div
          className="panel-generos"
          id="panel-generos"
          ref={panel}
          role="dialog"
          aria-label="Filtrar por género"
          data-sin-gesto
          onKeyDown={alTeclear}
        >
          <div role="radiogroup" aria-label="Género">
            {[{ nombre: '', cuenta: null }, ...lista].map((g) => {
              const marcado = genero === g.nombre;
              return (
                <button
                  key={g.nombre || 'todos'}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  className="genero-opcion"
                  onClick={() => elegir(g.nombre)}
                >
                  <span className="genero-marca" aria-hidden="true">
                    {marcado && <Icono nombre="marca" />}
                  </span>
                  <span className="genero-nombre">{g.nombre || 'Todos los géneros'}</span>
                  {g.cuenta != null && (
                    <span className="genero-cuenta">
                      {g.cuenta}<span className="sr"> {g.cuenta === 1 ? 'película' : 'películas'}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Controles({
  vista, onVista,
  query, onQuery, buscando, onBuscando,
  genero, generos, onGenero,
  cines, seleccion, onSeleccion,
}) {
  const entrada = useRef(null);
  const desplegada = buscando || !!query;

  // Al desplegar la búsqueda (icono o atajo "/") el foco entra en el campo.
  useEffect(() => {
    if (buscando) entrada.current?.focus();
  }, [buscando]);

  const alternarCine = (id) => {
    onSeleccion(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id]);
  };
  const ningunCine = seleccion.length === 0;

  return (
    <section className="controles" aria-label="Filtros y vista" data-buscando={desplegada ? 'true' : 'false'}>
      {/* Orden del DOM = orden en escritorio (vista, cines, género, buscar),
          que es donde se usa el tabulador. En el móvil la rejilla sube la
          búsqueda y el género a la fila de la vista. */}
      <div className="control-vista" role="group" aria-label="Vista" data-flechas onKeyDown={moverConFlechas}>
        {[
          ['peliculas', 'Películas'],
          ['horario', 'Horario'],
        ].map(([id, texto]) => (
          <button
            key={id}
            type="button"
            className="vista-opcion pulsable"
            aria-pressed={vista === id}
            onClick={() => onVista(id)}
          >
            {texto}
          </button>
        ))}
      </div>

      {/* Interruptores de cine: sin ninguno encendido se ven todos (y así se
          pinta: los cuatro con su color). Encender uno o varios deja solo
          esos; los demás se apagan. */}
      <div
        className="cines chip-row"
        role="group"
        aria-label="Cines (sin ninguno marcado, se ven todos)"
        data-todos={ningunCine ? 'true' : 'false'}
        data-flechas
        onKeyDown={moverConFlechas}
      >
        {cines.map((c) => {
          const on = seleccion.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className="cine-interruptor pulsable"
              data-cine={c.id}
              aria-pressed={on}
              title={`${c.name} · ${c.city}`}
              onClick={() => alternarCine(c.id)}
            >
              <span className="punto" aria-hidden="true">
                {on && <Icono nombre="marca" className="ico ico-marca" />}
              </span>
              <span className="sr">{c.name}</span>
              <span aria-hidden="true">{nombreInterruptor(c)}</span>
            </button>
          );
        })}
        {!ningunCine && (
          <button type="button" className="cines-todos pulsable" onClick={() => onSeleccion([])}>
            Todos
          </button>
        )}
      </div>

      <PanelGeneros genero={genero} generos={generos} onGenero={onGenero} />

      <div className="busqueda">
        <button
          type="button"
          className="busqueda-abrir boton-icono control-redondo"
          onClick={() => onBuscando(true)}
          aria-label="Buscar película"
          aria-expanded={desplegada}
          aria-controls="search-input"
        >
          <Icono nombre="lupa" />
        </button>
        <div className="busqueda-campo">
          <Icono nombre="lupa" className="ico busqueda-lupa" />
          <input
            ref={entrada}
            id="search-input"
            className="busqueda-entrada"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
            placeholder="Buscar película"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              // Con el campo vacío, Escape lo recoge; con texto, el atajo
              // global de la página ya lo borra.
              if (e.key === 'Escape' && !query) { onBuscando(false); e.currentTarget.blur(); }
            }}
            onBlur={(e) => {
              if (!query && !e.currentTarget.parentElement?.contains(e.relatedTarget)) onBuscando(false);
            }}
            aria-label="Buscar película por título"
          />
          {(query || buscando) && (
            <button
              type="button"
              className="busqueda-cerrar boton-icono"
              onClick={() => {
                if (query) { onQuery(''); entrada.current?.focus(); }
                else onBuscando(false);
              }}
              aria-label={query ? 'Borrar la búsqueda' : 'Cerrar la búsqueda'}
            >
              <Icono nombre="aspa" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
