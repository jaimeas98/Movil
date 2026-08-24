'use client';

// Utilidades compartidas por los gestos táctiles (cerrar la ficha, cambiar de
// día). Van juntas porque ambos necesitan lo mismo: goma elástica, una medida
// honesta de la velocidad y saber si el usuario pidió menos movimiento.

// Goma elástica al estilo iOS: los primeros píxeles se siguen casi 1:1 y a
// partir de ahí cada uno cuesta más. La curva tiende asintóticamente al límite,
// así que nunca hace falta un tope duro — un Math.min se percibe como que el
// contenido se ha despegado del dedo, justo la sensación que queremos quitar.
export function goma(distancia, limite, c = 0.55) {
  const d = Math.abs(distancia);
  const r = (1 - 1 / ((d / limite) * c + 1)) * limite;
  return distancia < 0 ? -r : r;
}

// Velocímetro con ventana temporal. Si midiéramos (final - inicio) / tiempo
// total, arrastrar 250px despacio y soltar daría "velocidad alta" y la ficha
// saldría disparada sin motivo. Con una ventana corta, pararse un instante
// antes de soltar da velocidad ~0 y el gesto se juzga solo por distancia, que
// es lo que el dedo espera.
const VENTANA_MS = 90;

export function crearVelocimetro() {
  const muestras = [];
  return {
    anotar(valor, t = performance.now()) {
      muestras.push({ valor, t });
      while (muestras.length > 1 && t - muestras[0].t > VENTANA_MS) muestras.shift();
    },
    // px por milisegundo. 0.5 ≈ 500 px/s, ya es un lanzamiento inequívoco.
    valor() {
      if (muestras.length < 2) return 0;
      const a = muestras[0];
      const b = muestras[muestras.length - 1];
      const dt = b.t - a.t;
      return dt > 0 ? (b.valor - a.valor) / dt : 0;
    },
    limpiar() { muestras.length = 0; },
  };
}

export function movimientoReducido() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ¿El dedo ha empezado sobre algo que ya se desplaza en horizontal? La
// comprobación de .chip-row es la regla que el proyecto ya tenía; el recorrido
// genérico cubre además cualquier carrusel que añadamos más adelante.
export function enScrollHorizontal(nodo, tope) {
  let el = nodo;
  while (el && el !== tope && el.nodeType === 1) {
    if (el.classList?.contains('chip-row') || el.classList?.contains('days-scroll')) return true;
    const ov = getComputedStyle(el).overflowX;
    if ((ov === 'auto' || ov === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    el = el.parentElement;
  }
  return false;
}

// Espera a que termine una transición concreta, con red de seguridad por si el
// evento nunca llega (pestaña en segundo plano, transición interrumpida, o que
// el valor de destino coincida con el actual). Sin el temporizador la ficha se
// quedaría colgada a medio cerrar.
export function alTerminarTransicion(el, prop, ms, cb) {
  if (!el) { cb(); return () => {}; }
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    el.removeEventListener('transitionend', alEvento);
    clearTimeout(reloj);
    cb();
  };
  const alEvento = (e) => {
    if (e.target === el && e.propertyName === prop) fin();
  };
  el.addEventListener('transitionend', alEvento);
  const reloj = setTimeout(fin, ms + 90);
  return fin;
}
