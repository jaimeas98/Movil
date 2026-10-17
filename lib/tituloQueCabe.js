'use client';

// Títulos que caben sin partir palabras.
//
// Los títulos van en Big Shoulders, en mayúsculas y a buen tamaño, y algunas
// palabras son largas ("CAZAFANTASMAS", "DORAEMON"). Con `overflow-wrap:
// anywhere` el navegador las partía por donde le venía bien ("CAZAFANTASM|AS")
// en cuanto la columna se estrechaba: la ficha a 320 px o el panel a 900 px.
// Ahora las palabras no se parten nunca (overflow-wrap: normal en el CSS) y, si
// una sola no cabe entera en su línea, se encoge el cuerpo de ESE título, poco
// a poco y no más de lo necesario, en vez de cortarla. Los demás títulos no
// cambian.
//
// El tamaño se pide como factor en la variable --encoge (1 = el del CSS), que
// el CSS multiplica por su tamaño de siempre; así también puede leerla el
// hueco de la equis de la ficha, que mide una línea del título.

import { useLayoutEffect } from 'react';

// Hasta dónde se puede encoger: por debajo, el título dejaría de leerse como
// título. Con los títulos reales no se pasa de ~0,8.
const MINIMO = 0.6;

function primerTexto(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.data.trim() && !n.parentElement?.closest('.sr') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  return w.nextNode();
}

// ¿Cabe? Ninguna palabra se sale de la caja y la primera línea empieza
// arriba (si su primera palabra no cabe junto al hueco de la equis, el
// navegador baja la línea entera y deja un hueco en blanco).
function cabe(el) {
  if (el.scrollWidth > el.clientWidth + 0.5) return false;
  const nodo = primerTexto(el);
  if (!nodo) return true;
  const r = document.createRange();
  r.setStart(nodo, 0);
  r.setEnd(nodo, 1);
  const caja = r.getClientRects()[0];
  if (!caja) return true;
  const alto = parseFloat(getComputedStyle(el).lineHeight) || caja.height;
  return caja.top - el.getBoundingClientRect().top < alto / 2;
}

export function ajustarTitulo(el, donde = el) {
  donde.style.removeProperty('--encoge');
  if (cabe(el)) return 1;
  // Búsqueda binaria: seis pasos dejan el tamaño a menos de un 1 % del justo.
  let bien = MINIMO;
  let mal = 1;
  for (let i = 0; i < 6; i++) {
    const f = (bien + mal) / 2;
    donde.style.setProperty('--encoge', f.toFixed(3));
    if (cabe(el)) bien = f; else mal = f;
  }
  donde.style.setProperty('--encoge', bien.toFixed(3));
  return bien;
}

// Un solo observador para todos los títulos de la página: se recalcula solo
// cuando cambia el ANCHO de la columna (al cambiar el tamaño del título
// cambia su alto, y eso no debe volver a lanzarlo).
let observador = null;
const vigilados = new Map();   // columna → { ancho, rehacer }
function vigilar(columna, rehacer) {
  if (typeof ResizeObserver === 'undefined') return () => {};
  observador ??= new ResizeObserver((entradas) => {
    for (const e of entradas) {
      const v = vigilados.get(e.target);
      const ancho = e.contentRect.width;
      if (v && Math.abs(ancho - v.ancho) > 0.5) { v.ancho = ancho; v.rehacer(); }
    }
  });
  vigilados.set(columna, { ancho: columna.getBoundingClientRect().width, rehacer });
  observador.observe(columna);
  return () => { vigilados.delete(columna); observador?.unobserve(columna); };
}

//   ref     el título
//   texto   el texto (para rehacer si cambia)
//   donde   opcional: en qué elemento se pone --encoge (por defecto, el título)
export function useTituloQueCabe(ref, texto, donde = null) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const destino = donde?.current ?? el;
    const rehacer = () => { if (el.isConnected) ajustarTitulo(el, destino); };
    rehacer();
    // Con las fuentes aún cargando se mide con la de respaldo: otra vez al
    // tenerlas.
    document.fonts?.ready.then(rehacer);
    const columna = destino === el ? el.parentElement : destino.parentElement;
    return columna ? vigilar(columna, rehacer) : undefined;
  }, [ref, texto, donde]);
}
