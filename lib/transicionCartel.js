'use client';

// La interacción firma: el cartel de la lista crece hasta su sitio en la ficha
// y, al cerrar, vuelve por el mismo camino (apple-design §7: lo que se va por
// un lado tiene que volver por ese mismo lado).
//
// Se hace con la View Transitions API: el navegador fotografía el estado de
// antes y el de después y anima entre los dos los elementos que comparten un
// `view-transition-name`. Lo que ve el usuario es UN cartel que viaja, aunque
// en el DOM sean dos <img> distintas (la de la lista y la de la ficha).
//
// Reglas que esto garantiza:
//  · Un nombre lo lleva UN solo elemento en cada fotografía. El cartel de la
//    lista lo recibe en línea justo antes de la foto y lo pierde dentro de la
//    actualización; el de la ficha lo lleva solo mientras <html data-vt> está
//    puesto (ver hojas.css). Dos elementos con el mismo nombre abortarían la
//    transición entera.
//  · Corta: ~320 ms al abrir y ~260 ms al cerrar (salir es más rápido que
//    entrar). Más allá de ~350 ms deja de leerse como respuesta al toque.
//  · No bloquea: mientras dura, el navegador manda los toques al documento y
//    no a la página, así que el primer toque SALTA la transición al estado
//    final y la hoja queda lista para agarrarla.
//  · Movimiento reducido: no hay vuelo. La hoja entra con un fundido (lo hace
//    components/Hoja.jsx), que es lo que pide quien no quiere desplazamientos.
//  · Sin la API (Firefox antiguo, Safari < 18): la hoja sube con su muelle y
//    el cartel llega con ella. Nada se rompe; solo se pierde el vuelo.

import { flushSync } from 'react-dom';
import { movimientoReducido } from './gestos.js';
import { curvaCSS } from './muelle.js';

export const MS_ABRIR = 320;
export const MS_CERRAR = 260;

// Críticamente amortiguado (sin rebote: no hubo gesto con inercia que lo
// justifique) y respuesta corta. La misma curva mueve el cartel y la hoja, así
// que llegan a la vez y se leen como una sola pieza.
const MUELLE_VT = { amortiguamiento: 1, respuesta: 0.3 };
const MUELLE_VT_CIERRE = { amortiguamiento: 1, respuesta: 0.24 };

let curvasPuestas = false;
function ponerCurvas() {
  if (curvasPuestas) return;
  curvasPuestas = true;
  const raiz = document.documentElement.style;
  raiz.setProperty('--vt-abrir', curvaCSS(MUELLE_VT, MS_ABRIR));
  raiz.setProperty('--vt-cerrar', curvaCSS(MUELLE_VT_CIERRE, MS_CERRAR));
  raiz.setProperty('--vt-ms-abrir', `${MS_ABRIR}ms`);
  raiz.setProperty('--vt-ms-cerrar', `${MS_CERRAR}ms`);
}

export function hayTransicion() {
  return typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !movimientoReducido();
}

// ¿Se ve el cartel lo bastante como para volar desde (o hasta) él? Uno medio
// tapado por la tira de días aterrizaría por encima de ella y luego se
// escondería de golpe; uno fuera de pantalla volaría desde la nada.
function aLaVista(el) {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const tira = document.querySelector('.days')?.getBoundingClientRect().bottom ?? 0;
  return r.top >= tira - 4 && r.bottom <= window.innerHeight + r.height * 0.25 &&
    r.right > 0 && r.left < window.innerWidth;
}

// Cada transición se apunta un turno: si se lanza otra encima (cerrar mientras
// aún se abría), la primera se da por saltada y su limpieza NO debe borrar las
// marcas que ya ha puesto la segunda.
let turno = 0;

function lanzar(modo, actualizar, antes, despues) {
  ponerCurvas();
  const mio = ++turno;
  const raiz = document.documentElement;
  raiz.dataset.vt = modo;
  antes?.();

  const t = document.startViewTransition(() => {
    flushSync(actualizar);
    despues?.();
  });

  // El primer toque o clic durante el vuelo lo salta: la transición nunca
  // deja la página sorda.
  const saltar = () => { try { t.skipTransition(); } catch {} };
  window.addEventListener('pointerdown', saltar, { capture: true, once: true });

  const limpiar = () => {
    window.removeEventListener('pointerdown', saltar, { capture: true });
    if (turno === mio) delete raiz.dataset.vt;
  };
  t.finished.then(limpiar, limpiar);
  // Si la actualización falla, la transición se cancela; el error ya lo verá
  // React, aquí solo no queremos una promesa rechazada sin atender.
  t.ready.catch(() => {});
  return t;
}

// Abre la ficha haciendo volar `origen` (el cartel pulsado). Devuelve false si
// no hay vuelo posible; entonces `actualizar` se ejecuta sin más y la hoja
// hace su propia entrada.
export function abrirConCartel(origen, actualizar) {
  if (!hayTransicion() || !aLaVista(origen)) { actualizar(); return false; }
  lanzar(
    'abrir',
    actualizar,
    () => { origen.style.viewTransitionName = 'cartel'; },
    () => {
      origen.style.viewTransitionName = '';
      // El original se queda vacío mientras vuela su copia: dos carteles
      // iguales a la vez delatarían el truco.
      origen.dataset.cartelFuera = '';
    }
  ).finished.finally(() => { delete origen.dataset.cartelFuera; });
  return true;
}

// Cierra la ficha devolviendo el cartel a `destino`. Devuelve false si no se
// puede (sin API, movimiento reducido, o uno de los dos carteles no está a la
// vista); entonces la hoja se cierra con su propio muelle.
// El cartel de la FICHA también tiene que verse para volar desde él. Si se ha
// bajado por la ficha (lo normal: las sesiones y las notas están debajo), el
// cartel está fuera por arriba del cuerpo de la hoja, y la View Transition lo
// fotografía igualmente en su sitio real: el vuelo salía de encima de la
// pantalla y cruzaba la tira de días. Entonces no hay vuelo y la hoja se
// cierra con su propio muelle, que es lo que se espera de ella.
function cartelDeFichaALaVista() {
  const cartel = document.querySelector('.hoja .ficha-cartel');
  const cuerpo = cartel?.closest('.hoja-cuerpo');
  if (!cartel || !cuerpo) return false;
  const r = cartel.getBoundingClientRect();
  const c = cuerpo.getBoundingClientRect();
  if (!r.height) return false;
  return r.top >= c.top - 4 && r.bottom <= c.bottom + r.height * 0.25;
}

export function cerrarConCartel(destino, actualizar) {
  if (!hayTransicion() || !aLaVista(destino) || !cartelDeFichaALaVista()) return false;
  lanzar(
    'cerrar',
    actualizar,
    null,
    () => { destino.style.viewTransitionName = 'cartel'; }
  ).finished.finally(() => { destino.style.viewTransitionName = ''; });
  return true;
}

// El cartel de la lista que corresponde a una película (por su clave).
export function cartelDe(clave) {
  if (!clave || typeof document === 'undefined') return null;
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(clave) : clave.replace(/"/g, '\\"');
  return document.querySelector(`[data-cartel="${esc}"]`);
}
