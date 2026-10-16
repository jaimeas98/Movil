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
// Un dedo QUIETO no manda touchmove: el navegador solo avisa cuando cambia la
// posición. Así que "la última muestra es de hace mucho" quiere decir "el dedo
// está parado", y la velocidad es 0 aunque las muestras de la ventana fueran
// rápidas. Sin esto, arrastrar deprisa, pararse 300 ms y soltar se leía como
// un lanzamiento y la hoja se cerraba (o el día cambiaba) contra lo que el
// dedo decía. 50 ms son tres fotogramas sin noticias.
const QUIETO_MS = 50;

export function crearVelocimetro() {
  const muestras = [];
  return {
    // `t` en el reloj de performance.now(); los manejadores pasan
    // e.timeStamp, que es cuándo pasó el toque y no cuándo se ha atendido (con
    // el hilo ocupado pintando, la diferencia falsea la velocidad).
    anotar(valor, t = performance.now()) {
      muestras.push({ valor, t });
      while (muestras.length > 1 && t - muestras[0].t > VENTANA_MS) muestras.shift();
    },
    // px por milisegundo. 0.5 ≈ 500 px/s, ya es un lanzamiento inequívoco.
    // `ahora`: el instante en que se pregunta (el timeStamp del touchend).
    valor(ahora = performance.now()) {
      if (muestras.length < 2) return 0;
      const a = muestras[0];
      const b = muestras[muestras.length - 1];
      if (ahora - b.t > QUIETO_MS) return 0;
      const dt = b.t - a.t;
      return dt > 0 ? (b.valor - a.valor) / dt : 0;
    },
    limpiar() { muestras.length = 0; },
  };
}

// El instante de un evento en el reloj de performance.now(). En los
// navegadores actuales e.timeStamp ya lo está; algunos WebView antiguos dan
// milisegundos de época y ahí se usa el reloj de ahora.
export function instanteDe(e) {
  const t = e?.timeStamp;
  const ahora = performance.now();
  return typeof t === 'number' && t > 0 && t <= ahora + 1000 ? t : ahora;
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
