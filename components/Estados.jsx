'use client';

import Icono from './Icono.jsx';
import { deCuando } from '@/lib/cartelera.js';

// Une nombres como se dice: "A", "A y B", "A, B y C".
function enumerar(nombres) {
  if (nombres.length <= 1) return nombres;
  const r = [];
  nombres.forEach((n, i) => {
    if (i > 0) r.push(i === nombres.length - 1 ? ' y ' : ', ');
    r.push(n);
  });
  return r;
}

const nombre = (c) => <strong key={c.id}>{c.short || c.name}</strong>;

// Avisos sobre los datos: qué cine no responde, cuál enseña datos guardados y
// de cuándo, y si estamos sin conexión. Distinguir los casos importa: si un
// cine no responde, decir "no tiene sesiones" es mentir.
export function Avisos({ cines, sinSesiones = [], sinConexion, actualizado, onReintentar }) {
  const avisos = [];

  if (sinConexion) {
    avisos.push({
      clave: 'sin-conexion',
      icono: 'sinConexion',
      texto: (
        <>
          Sin conexión. Enseñamos lo último que se cargó en este dispositivo
          {actualizado ? ` (${actualizado})` : ''}.{' '}
          <button type="button" className="aviso-accion" onClick={onReintentar}>Reintentar</button>
        </>
      ),
    });
  }

  // Los cines sin datos van en una sola línea, cada nombre enlazado a la web
  // de su cine, que es donde se pueden mirar los horarios mientras tanto.
  const caidos = cines.filter((x) => x.source === 'error');
  if (caidos.length) {
    const enlaces = caidos.map((c) => (c.website ? (
      <a key={c.id} className="aviso-cine" href={c.website} target="_blank" rel="noopener noreferrer">
        {c.short || c.name}<Icono nombre="externo" className="ico ico-enlinea" />
        <span className="sr"> (su web, se abre en otra pestaña)</span>
      </a>
    ) : nombre(c)));
    avisos.push({
      clave: 'sin-datos',
      icono: 'sinConexion',
      texto: sinConexion
        ? <>No hay nada guardado de {enumerar(enlaces)}: mira sus horarios en {caidos.length === 1 ? 'su web' : 'sus webs'}.</>
        : <>Sin conexión con {enumerar(enlaces)}: sus horarios no se ven aquí; mira {caidos.length === 1 ? 'su web' : 'sus webs'}.</>,
    });
  }

  // Los que sirven datos guardados, juntos si son de la misma fecha.
  const porFecha = new Map();
  for (const c of cines.filter((x) => x.source === 'stale')) {
    const k = deCuando(c.staleAt);
    porFecha.set(k, [...(porFecha.get(k) ?? []), c]);
  }
  for (const [cuando, lista] of porFecha) {
    avisos.push({
      clave: `stale-${cuando}`,
      icono: 'reloj',
      texto: <>{enumerar(lista.map(nombre))}: datos guardados {cuando}; pueden haber cambiado.</>,
    });
  }

  const ejemplo = cines.filter((x) => x.source === 'sample');
  if (ejemplo.length) {
    avisos.push({
      clave: 'ejemplo',
      icono: 'alerta',
      texto: <>{enumerar(ejemplo.map(nombre))}: datos de ejemplo, no horarios reales.</>,
    });
  }

  if (sinSesiones.length) {
    avisos.push({
      clave: 'sin-sesiones',
      icono: 'calendario',
      texto: <>{enumerar(sinSesiones.map(nombre))} no {sinSesiones.length === 1 ? 'tiene' : 'tienen'} sesiones publicadas para este día.</>,
    });
  }

  if (!avisos.length) return null;
  return (
    <ul className="avisos" aria-label="Avisos sobre los datos">
      {avisos.map((a) => (
        <li key={a.clave} className="aviso">
          <Icono nombre={a.icono} className="ico aviso-icono" />
          <span>{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}

// Esqueleto con la forma real de una película: cartel, título, datos y dos
// cines con sus entradas. Así la carga no cambia de sitio las cosas.
export function Esqueleto() {
  return (
    <div className="esqueleto">
      <p className="sr" role="status">Cargando la cartelera…</p>
      <ul className="pelis" aria-hidden="true">
        {[5, 3, 4, 6].map((n, i) => (
          <li key={i}>
            <div className="peli">
              <span className="peli-cartel esq" />
              <div className="peli-cabeza">
                <span className="esq esq-titulo" style={{ width: `${62 + ((i * 17) % 30)}%` }} />
                <span className="esq esq-linea" />
              </div>
              <div className="peli-cines">
                {[n, Math.max(2, n - 2)].map((m, j) => (
                  <div className="peli-cine" key={j}>
                    <span className="esq esq-cine" />
                    <ul className="entradas">
                      {Array.from({ length: m }, (_, k) => <li key={k}><span className="esq esq-entrada" /></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Estado({ icono, titulo, children, acciones }) {
  return (
    <div className="estado">
      {icono && <Icono nombre={icono} className="ico estado-icono" />}
      <h2 className="estado-titulo">{titulo}</h2>
      {children && <p className="estado-texto">{children}</p>}
      {acciones && <div className="estado-acciones">{acciones}</div>}
    </div>
  );
}
