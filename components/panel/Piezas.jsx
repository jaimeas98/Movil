'use client';

// Las piezas pequeñas que repite todo el panel: el estado (forma + palabra),
// la hora (relativa y absoluta), los esqueletos de carga, el error con su
// "Reintentar" y el vacío que explica por qué está vacío.

import Icono from './Icono.jsx';
import { absoluta, completa, relativa } from './tiempo.js';

export const PALABRA = { bien: 'Bien', aviso: 'Aviso', fallo: 'Fallo', nada: 'Sin datos' };

// El estado nunca va solo en color: cada nivel tiene su forma (círculo con
// marca, triángulo, octógono, círculo punteado) y su palabra.
export function Estado({ nivel = 'nada', texto, compacto = false }) {
  return (
    <span className="pn-estado" data-nivel={nivel}>
      <Icono nombre={nivel} className="pn-estado-ico" />
      <span className={compacto ? 'sr' : 'pn-estado-txt'}>{texto ?? PALABRA[nivel]}</span>
    </span>
  );
}

// "hace 3 min · 18:30". La absoluta siempre a la vista (en el móvil no hay
// ratón para el title), y la fecha entera en el title para el escritorio.
export function Hora({ t, ahora, solo = 'ambas', className = '' }) {
  if (t == null) return <span className={`pn-hora ${className}`}>—</span>;
  const iso = new Date(t).toISOString();
  const rel = relativa(t, ahora);
  const abs = absoluta(t, ahora);
  return (
    <time className={`pn-hora ${className}`} dateTime={iso} title={completa(t)}>
      {solo !== 'absoluta' && <span>{rel}</span>}
      {solo === 'ambas' && <span className="pn-hora-abs"> · {abs}</span>}
      {solo === 'absoluta' && <span>{abs}</span>}
    </time>
  );
}

export function Esqueleto({ lineas = 3, alto }) {
  return (
    <div className="pn-esqueleto" aria-hidden="true" style={alto ? { height: alto } : undefined}>
      {!alto && Array.from({ length: lineas }, (_, i) => <span key={i} style={{ width: `${92 - ((i * 23) % 40)}%` }} />)}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="pn-cargando" role="status">
      <span className="sr">{texto}</span>
      <Esqueleto lineas={4} />
    </div>
  );
}

const QUE_HACER = {
  red: 'Comprueba la conexión y vuelve a intentarlo.',
  tiempo: 'Puede que esté despertando; vuelve a intentarlo en unos segundos.',
  servidor: 'Vuelve a intentarlo; si sigue igual, mira el registro de Vercel.',
  'solo-lectura': 'Hace falta PANEL_GITHUB_TOKEN en Vercel para escribir en GitHub.',
  limite: null,
  datos: null,
};

export function Fallo({ titulo = 'No se ha podido cargar', error, alReintentar, reintentando = false }) {
  const mensaje = error?.message || String(error || '');
  const consejo = QUE_HACER[error?.tipo];
  return (
    <div className="pn-fallo" role="alert">
      <Icono nombre="fallo" className="pn-fallo-ico" />
      <div className="pn-fallo-txt">
        <p className="pn-fallo-titulo">{titulo}</p>
        {mensaje && <p className="pn-fallo-msg">{mensaje}</p>}
        {consejo && <p className="pn-fallo-msg">{consejo}</p>}
      </div>
      {alReintentar && (
        <button type="button" className="pn-boton" onClick={alReintentar} disabled={reintentando}>
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </div>
  );
}

export function Vacio({ titulo, children }) {
  return (
    <div className="pn-vacio">
      <p className="pn-vacio-titulo">{titulo}</p>
      {children && <p className="pn-vacio-txt">{children}</p>}
    </div>
  );
}

export function Seccion({ id, titulo, acciones, children, nota }) {
  return (
    <section className="pn-bloque" aria-labelledby={`${id}-t`}>
      <div className="pn-bloque-cab">
        <h2 id={`${id}-t`} className="pn-bloque-titulo">{titulo}</h2>
        {acciones && <div className="pn-bloque-acciones">{acciones}</div>}
      </div>
      {nota && <p className="pn-bloque-nota">{nota}</p>}
      {children}
    </section>
  );
}

export function PuntoCine({ id }) {
  return <span className="pn-punto" data-cine={id} aria-hidden="true" />;
}

// Una cifra con su unidad, para listas de datos: tabular, para que alineen.
export const cifra = (n, { decimales = 0 } = {}) =>
  n == null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
