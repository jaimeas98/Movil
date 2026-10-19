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
// MOVER o COPIAR, según lo que se vea (apple-design §7, consistencia
// espacial). Que el cartel "se mueva" solo es verdad si el sitio del que sale
// deja de verse:
//  · Móvil (hoja desde abajo): la hoja tapa la lista, así que el cartel SE
//    MUEVE. El de la lista se vacía mientras vuela y, al cerrar, el hueco
//    espera a que vuelva.
//  · Panel lateral (≥ 900 px): la lista sigue a la vista a la izquierda. Si el
//    cartel se moviera, se vería salir de su tarjeta y luego aparecer otro
//    igual en el mismo sitio, y eso delata el truco (era lo que se veía). Aquí
//    el cartel de la lista NO se mueve nunca: de él crece una COPIA hasta el
//    panel, la tarjeta queda marcada como la abierta (el velo la deja sin
//    atenuar, ver Hoja.jsx) y al cerrar la copia encoge hasta posarse encima
//    del original, que no se ha ido. Con el panel abierto se puede elegir otra
//    película de la lista: su copia crece hasta el panel y la ficha anterior
//    se funde debajo (ver cambiarConCartel).
//
// Reglas que esto garantiza:
//  · Un nombre lo lleva UN solo elemento en cada fotografía. El cartel de la
//    lista lo recibe en línea justo antes de la foto y lo pierde dentro de la
//    actualización; el de la ficha lo lleva solo mientras <html data-vt> está
//    puesto (ver hojas.css). Dos elementos con el mismo nombre abortarían la
//    transición entera.
//  · Corta: el cartel hace el 90 % del camino en ~160 ms al abrir y ~135 ms
//    al cerrar (salir es más rápido que entrar). Lo que dura de más (360 y
//    300 ms en total) es la llegada: con 320/260 ms el muelle se cortaba al
//    0,9 % del recorrido y en escritorio el cartel se paraba de golpe aún a
//    2–3 px por fotograma; así acaba a menos de 1 px por fotograma. En el
//    panel de escritorio, más largo (480/430 ms): el recorrido es más del
//    doble y con el muelle del móvil el cartel saltaba en vez de volar.
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

export const MS_ABRIR = 360;
export const MS_CERRAR = 300;
// En el panel de escritorio el cartel recorre ~770 px (de la lista a la
// derecha de la pantalla) y no ~300 como en el móvil. Con el muelle del móvil
// iba a 100 px por fotograma en el arranque: más que volar, saltaba, y se leía
// como un corte (Jaime, 19-10). Con este, ~70 px por fotograma como mucho, y
// la llegada sigue acabando a menos de 1 px por fotograma.
export const MS_ABRIR_PANEL = 480;
export const MS_CERRAR_PANEL = 430;

// El mismo corte que hojas.css y components/Hoja.jsx: desde aquí la hoja es
// un panel lateral y la lista sigue a la vista.
const PANEL = '(min-width: 900px)';
export const enPanel = () => typeof window !== 'undefined' && window.matchMedia(PANEL).matches;

// Críticamente amortiguado (sin rebote: no hubo gesto con inercia que lo
// justifique) y respuesta corta. La misma curva mueve el cartel y la hoja, así
// que llegan a la vez y se leen como una sola pieza.
const MUELLE_VT = { amortiguamiento: 1, respuesta: 0.26 };
const MUELLE_VT_CIERRE = { amortiguamiento: 1, respuesta: 0.22 };
const MUELLE_VT_PANEL = { amortiguamiento: 1, respuesta: 0.42 };
const MUELLE_VT_PANEL_CIERRE = { amortiguamiento: 1, respuesta: 0.36 };

// Las dos parejas (móvil y panel) quedan puestas; cuál vale lo decide el CSS
// con el mismo corte de 900 px (hojas.css), así que girar la tableta o
// estrechar la ventana no necesita volver aquí.
let curvasPuestas = false;
function ponerCurvas() {
  if (curvasPuestas) return;
  curvasPuestas = true;
  const raiz = document.documentElement.style;
  raiz.setProperty('--vt-abrir-movil', curvaCSS(MUELLE_VT, MS_ABRIR));
  raiz.setProperty('--vt-cerrar-movil', curvaCSS(MUELLE_VT_CIERRE, MS_CERRAR));
  raiz.setProperty('--vt-ms-abrir-movil', `${MS_ABRIR}ms`);
  raiz.setProperty('--vt-ms-cerrar-movil', `${MS_CERRAR}ms`);
  raiz.setProperty('--vt-abrir-panel', curvaCSS(MUELLE_VT_PANEL, MS_ABRIR_PANEL));
  raiz.setProperty('--vt-cerrar-panel', curvaCSS(MUELLE_VT_PANEL_CIERRE, MS_CERRAR_PANEL));
  raiz.setProperty('--vt-ms-abrir-panel', `${MS_ABRIR_PANEL}ms`);
  raiz.setProperty('--vt-ms-cerrar-panel', `${MS_CERRAR_PANEL}ms`);
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

// Con el panel abierto, un cartel de la columna derecha puede quedar en parte
// debajo de él (a 1440 px, los 8 px de su borde). Si queda tapado más de un
// cuarto, su copia empezaría a crecer ENCIMA del panel: entonces no hay vuelo.
function libreDelPanel(el) {
  const panel = document.querySelector('.hoja[data-variante="ficha"]');
  if (!panel) return true;
  const r = el.getBoundingClientRect();
  const borde = panel.getBoundingClientRect().left;
  return r.right - borde <= r.width * 0.25;
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

// Un hueco vacío, fijo en la pantalla, con la forma y el sitio de `el`. Es el
// destino de la copia cuando el original NO debe esconderse: si el nombre lo
// llevara el propio cartel de la lista, el navegador lo sacaría de la foto de
// la página y su sitio se vería vacío durante todo el vuelo de vuelta.
function huecoSobre(el) {
  const r = el.getBoundingClientRect();
  const h = document.createElement('div');
  h.setAttribute('aria-hidden', 'true');
  Object.assign(h.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`,
    pointerEvents: 'none', viewTransitionName: 'cartel',
  });
  document.body.appendChild(h);
  return h;
}

// Abre la ficha haciendo volar `origen` (el cartel pulsado). Devuelve false si
// no hay vuelo posible; entonces `actualizar` se ejecuta sin más y la hoja
// hace su propia entrada.
export function abrirConCartel(origen, actualizar) {
  if (!hayTransicion() || !aLaVista(origen)) { actualizar(); return false; }
  // En el panel el original se queda (la copia crece de él); en el móvil se
  // va con su copia, que la hoja va a tapar la lista de todas formas.
  const mover = !enPanel();
  lanzar(
    'abrir',
    actualizar,
    () => { origen.style.viewTransitionName = 'cartel'; },
    () => {
      origen.style.viewTransitionName = '';
      // Móvil: el original se queda vacío mientras vuela su copia: dos
      // carteles iguales a la vez delatarían el truco.
      if (mover) origen.dataset.cartelFuera = '';
    }
  ).finished.finally(() => { delete origen.dataset.cartelFuera; });
  return true;
}

// Con el panel abierto, otra película de la lista: su copia crece desde su
// tarjeta hasta el sitio del cartel de la ficha, y la ficha anterior (cartel
// incluido) se funde debajo con el contenido nuevo. UN solo vuelo, el del
// cartel elegido: la vista ya está en él, y mandar a la vez el anterior de
// vuelta a su tarjeta eran dos carteles cruzándose en sentidos opuestos. El
// anterior no necesita volver: en el panel su original nunca se fue de la
// lista. Sin vuelo posible, el cambio es inmediato.
export function cambiarConCartel(origen, actualizar) {
  if (!hayTransicion() || !aLaVista(origen) || !libreDelPanel(origen)) { actualizar(); return false; }
  let fichaNueva = null;
  lanzar(
    'cambiar',
    actualizar,
    () => { origen.style.viewTransitionName = 'cartel'; },
    () => {
      origen.style.viewTransitionName = '';
      // El de la ficha no lleva nombre en la foto de antes (hojas.css lo
      // excluye en 'cambiar'): el nombre ya lo tenía el de la lista.
      fichaNueva = document.querySelector('.hoja .ficha-cartel');
      if (fichaNueva) fichaNueva.style.viewTransitionName = 'cartel';
    }
  ).finished.finally(() => { if (fichaNueva) fichaNueva.style.viewTransitionName = ''; });
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
  // Panel: la copia vuelve a posarse ENCIMA del original, que sigue en su
  // tarjeta; el destino es un hueco con su sitio. Móvil: vuelve al propio
  // cartel, cuyo sitio espera vacío (se fue con él al abrir).
  const copiar = enPanel();
  let hueco = null;
  lanzar(
    'cerrar',
    actualizar,
    null,
    () => {
      // Ya sin la hoja y con el scroll de la página devuelto: medir aquí da
      // el sitio real del cartel en la foto de después.
      if (copiar) hueco = huecoSobre(destino);
      else destino.style.viewTransitionName = 'cartel';
    }
  ).finished.finally(() => {
    hueco?.remove();
    destino.style.viewTransitionName = '';
  });
  return true;
}

// El cartel de la lista que corresponde a una película (por su clave).
export function cartelDe(clave) {
  if (!clave || typeof document === 'undefined') return null;
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(clave) : clave.replace(/"/g, '\\"');
  return document.querySelector(`[data-cartel="${esc}"]`);
}

// Lo que se puede tocar A TRAVÉS del velo del panel: el cartel o el título de
// otra película de la lista (lo mismo que abre una ficha). Tocarlo cambia la
// ficha en vez de cerrarla; tocar cualquier otro sitio del velo cierra, como
// siempre. Solo en el panel, que es donde la lista sigue a la vista; la
// abierta no cuenta (tocarla es tocar fuera del panel: cierra).
export function objetivoBajoVelo(x, y, claveAbierta) {
  if (!enPanel() || typeof document.elementsFromPoint !== 'function') return null;
  const bajo = document.elementsFromPoint(x, y).find((el) => el.matches?.('.peli-cartel[data-cartel], .peli-titulo-boton'));
  if (!bajo) return null;
  const peli = bajo.closest('.peli');
  const clave = peli?.querySelector('[data-cartel]')?.dataset.cartel;
  if (!clave || clave === claveAbierta) return null;
  return bajo;
}
