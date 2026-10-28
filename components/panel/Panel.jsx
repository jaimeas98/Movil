'use client';

// El armazón del panel: navegación, cabecera con "actualizado hace…", aviso
// de solo lectura y la sección que toque.
//
// Navegación: en el móvil, una barra de pestañas abajo (se alcanza con el
// pulgar sin soltar el móvil); desde 900 px, una barra arriba con las
// pestañas, que deja todo el ancho a la línea del día de la cabina (con la
// columna lateral de antes se quedaba en dos tercios). Las dos son la misma
// lista y llevan el estado de su sección (forma, no solo color), así que el
// fallo se ve desde cualquier pantalla. La sección va en el hash (#cines)
// para que atrás/adelante y recargar funcionen; la pestaña del navegador
// lleva la cuenta de fallos, para verlo sin entrar.

import { useCallback, useEffect, useMemo, useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle.jsx';
import Icono from './Icono.jsx';
import { Cargando, Fallo, Hora } from './Piezas.jsx';
import { usarAhora, usarEstado } from './usarEstado.js';
import { usarOrdenes } from './usarOrdenes.js';
import { valorar } from './datos.js';
import { salir } from './api.js';
import Resumen from './Resumen.jsx';
import Movil from './Movil.jsx';
import Cines from './Cines.jsx';
import Acciones from './Acciones.jsx';
import Enlaces from './Enlaces.jsx';
import Avisos from './Avisos.jsx';
import Lol from './Lol.jsx';

export const SECCIONES = [
  { id: 'resumen', nombre: 'Cabina', icono: 'cabina' },
  { id: 'movil', nombre: 'Móvil', icono: 'movil' },
  { id: 'cines', nombre: 'Cines', icono: 'cines' },
  { id: 'acciones', nombre: 'Acciones', icono: 'acciones' },
  { id: 'enlaces', nombre: 'Enlaces', largo: 'Enlaces de compra', icono: 'enlaces' },
  { id: 'avisos', nombre: 'Avisos', icono: 'avisos' },
  // El visor de LoL: otra web, el mismo panel (lib/panel/lol.js).
  { id: 'lol', nombre: 'LoL', largo: 'Visor de LoL', icono: 'lol' },
];
const IDS = new Set(SECCIONES.map((s) => s.id));

function seccionDelHash() {
  if (typeof window === 'undefined') return 'resumen';
  const h = window.location.hash.replace('#', '');
  return IDS.has(h) ? h : 'resumen';
}

function MarcaNav({ nivel, cuenta }) {
  if (cuenta) return <span className="pn-nav-cuenta" data-nivel={nivel}>{cuenta}</span>;
  if (nivel === 'fallo' || nivel === 'aviso') return <Icono nombre={nivel} className="pn-nav-marca" data-nivel={nivel} />;
  return null;
}

function Salir() {
  const [saliendo, setSaliendo] = useState(false);
  async function alSalir() {
    setSaliendo(true);
    try { await salir(); } catch { /* sin sesión ya da igual: se va igual */ }
    window.location.replace('/panel/entrar');
  }
  return (
    <button type="button" className="boton-icono" onClick={alSalir} disabled={saliendo} aria-label="Salir del panel" title="Salir">
      <Icono nombre="salir" />
    </button>
  );
}

function Actualizado({ recibido, error, cargando, ahora, refrescar }) {
  return (
    <div className="pn-actualizado" aria-live="polite">
      {error && recibido ? (
        <span className="pn-actualizado-mal">
          <Icono nombre="aviso" className="pn-ico-peq" />
          No se ha podido actualizar. Datos de <Hora t={recibido} ahora={ahora} solo="relativa" />.
        </span>
      ) : recibido ? (
        <span>Actualizado <Hora t={recibido} ahora={ahora} /></span>
      ) : error ? (
        <span className="pn-actualizado-mal">Sin datos todavía</span>
      ) : (
        <span>Cargando…</span>
      )}
      <button
        type="button"
        className="boton-icono pn-refrescar"
        onClick={refrescar}
        disabled={cargando}
        aria-label={cargando ? 'Actualizando' : 'Actualizar ahora'}
        title="Actualizar ahora"
      >
        <Icono nombre="actualizar" className={`pn-ico${cargando ? ' pn-girando' : ''}`} />
      </button>
    </div>
  );
}

export default function Panel() {
  const [seccion, setSeccion] = useState('resumen');
  const { datos, error, cargando, recibido, refrescar, parchear } = usarEstado();
  const ahora = usarAhora();
  const ordenesApi = usarOrdenes({ alTerminar: refrescar });
  const { seguir } = ordenesApi;

  useEffect(() => {
    setSeccion(seccionDelHash());
    const alCambiar = () => setSeccion(seccionDelHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  useEffect(() => { seguir(datos?.movil?.ordenes?.pendientes); }, [datos, seguir]);

  const ir = useCallback((id) => {
    if (!IDS.has(id)) return;
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
    setSeccion(id);
    // Al cambiar de sección se empieza arriba, y el foco va al título, que es
    // lo que un lector de pantalla tiene que oír.
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => document.getElementById('pn-titulo')?.focus({ preventScroll: true }));
  }, []);

  const val = useMemo(() => (datos ? valorar(datos, ahora) : null), [datos, ahora]);

  // "(2) Panel" en la pestaña con dos fallos: se ve sin cambiar de pestaña.
  const fallos = val?.fallos ?? 0;
  useEffect(() => { document.title = fallos ? `(${fallos}) Panel` : 'Panel'; }, [fallos]);
  const pendientes = useMemo(() => {
    const ids = new Set();
    for (const o of Object.values(ordenesApi.ordenes)) if (o.estado === 'pendiente' || o.estado === 'en-curso') ids.add(o.id);
    for (const o of datos?.movil?.ordenes?.pendientes ?? []) ids.add(o.id);
    return ids.size;
  }, [ordenesApi.ordenes, datos]);

  const actual = SECCIONES.find((s) => s.id === seccion) ?? SECCIONES[0];
  const soloLectura = datos && !datos.github.escritura;

  const marcas = {
    resumen: null,
    movil: val?.porSeccion.movil,
    cines: val?.porSeccion.cines,
    acciones: null,
    enlaces: null,
    avisos: val?.porSeccion.avisos,
    lol: val?.porSeccion.lol,
  };
  const cuentas = { acciones: pendientes || null, avisos: datos?.avisos.abiertos.length || null };

  const nav = (
    <ul className="pn-nav-lista">
      {SECCIONES.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="pn-nav-item"
            title={s.largo || s.nombre}
            aria-current={s.id === seccion ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); ir(s.id); }}
          >
            <span className="pn-nav-ico-caja">
              <Icono nombre={s.icono} className="pn-nav-ico" />
              <MarcaNav nivel={s.id === 'avisos' ? marcas.avisos : s.id === 'acciones' ? 'nada' : marcas[s.id]} cuenta={cuentas[s.id]} />
            </span>
            <span className="pn-nav-nombre">{s.nombre}</span>
            {(marcas[s.id] === 'fallo' || marcas[s.id] === 'aviso') && (
              <span className="sr">{marcas[s.id] === 'fallo' ? ' (hay un fallo)' : ' (hay un aviso)'}</span>
            )}
            {cuentas[s.id] ? <span className="sr"> ({cuentas[s.id]})</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );

  let cuerpo;
  if (!datos && error) {
    cuerpo = <Fallo titulo="No se ha podido leer el estado" error={error} alReintentar={refrescar} reintentando={cargando} />;
  } else if (!datos) {
    cuerpo = <Cargando texto="Leyendo el estado del móvil, de los cines y del visor de LoL…" />;
  } else {
    const comun = { datos, val, ahora, ir, refrescar, parchear, soloLectura, ordenesApi };
    cuerpo = {
      resumen: <Resumen {...comun} />,
      movil: <Movil {...comun} />,
      cines: <Cines {...comun} />,
      acciones: <Acciones {...comun} />,
      enlaces: <Enlaces {...comun} />,
      avisos: <Avisos {...comun} />,
      lol: <Lol {...comun} />,
    }[seccion];
  }

  return (
    <div className="pn">
      <a href="#pn-contenido" className="pn-saltar">Saltar al contenido</a>
      <header className="pn-barra">
        <p className="pn-marca">Panel</p>
        <nav className="pn-pestanas" aria-label="Secciones">{nav}</nav>
        <div className="pn-barra-der">
          <Actualizado recibido={recibido} error={error} cargando={cargando} ahora={ahora} refrescar={refrescar} />
          <ThemeToggle />
          <Salir />
        </div>
      </header>

      <div className="pn-principal">
        {/* Un div y no un header: el "banner" de la página ya es la barra de arriba. */}
        <div className="pn-cabecera">
          <h1 id="pn-titulo" className="pn-titulo" tabIndex={-1}>{actual.largo || actual.nombre}</h1>
          <div className="pn-cabecera-botones">
            <ThemeToggle />
            <Salir />
          </div>
          <div className="pn-cabecera-actualizado">
            <Actualizado recibido={recibido} error={error} cargando={cargando} ahora={ahora} refrescar={refrescar} />
          </div>
        </div>

        <main id="pn-contenido" className="pn-contenido" aria-busy={!datos && cargando}>
          {soloLectura && (
            <div className="pn-banda" role="note">
              <Icono nombre="candado" className="pn-ico" />
              <p>
                <strong>Solo lectura.</strong> Para mandar órdenes al móvil y guardar enlaces hace falta la variable
                {' '}<code>PANEL_GITHUB_TOKEN</code> en Vercel (token de este repositorio con permiso de escritura) y redesplegar.
              </p>
            </div>
          )}
          {/* El aviso del servidor sobre GitHub, salvo que repita lo de solo
              lectura, que ya está dicho arriba con cómo arreglarlo. */}
          {datos?.github.aviso && !(soloLectura && /PANEL_GITHUB_TOKEN|solo lectura/i.test(datos.github.aviso)) && (
            <div className="pn-banda" role="note">
              <Icono nombre="aviso" className="pn-ico" />
              <p>{datos.github.aviso}</p>
            </div>
          )}
          {cuerpo}
        </main>
      </div>

      <nav className="pn-abajo" aria-label="Secciones">{nav}</nav>
    </div>
  );
}
