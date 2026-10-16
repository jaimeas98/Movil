'use client';

// Muelles para las hojas y paneles (ficha, Próximas, atajos).
//
// Por qué un muelle y no una transición con duración fija: una transición CSS
// no sabe a qué velocidad iba el dedo al soltar ni puede retomarse a medias
// sin un salto. Un muelle sí: arranca desde donde está la hoja AHORA, con la
// velocidad que traía, y si la vuelves a agarrar se para donde esté. Es lo que
// hace que la hoja se sienta un objeto y no una animación (apple-design §3–5).
//
// Se describe con los dos parámetros de Apple en vez de masa/rigidez/fricción:
//   amortiguamiento (ζ): 1 = crítico, llega sin pasarse; < 1 rebota un poco.
//   respuesta (s): lo rápido que alcanza el destino. NO es una duración: el
//                  muelle no tiene duración, se asienta cuando se asienta.
// Con masa 1: rigidez = (2π / respuesta)², fricción = 4π·ζ / respuesta.
//
// Se resuelve de forma EXACTA (la ecuación del oscilador amortiguado tiene
// solución cerrada) en vez de integrar paso a paso: así se puede preguntar
// "¿dónde estaba y a qué velocidad iba a los 137 ms?" cuando alguien agarra la
// hoja a mitad de camino, sin acumular error ni depender de los fotogramas.
//
// La animación en sí la hace el navegador (Web Animations API) con la curva ya
// calculada: va en el hilo del compositor y no se entrecorta aunque React esté
// pintando la ficha a la vez, que es justo cuando se abre.

// Estado del muelle a los `t` segundos. x es la distancia al destino (px) y v
// su velocidad (px/s); ambas con el mismo signo que el valor animado.
export function crearMuelle({ amortiguamiento = 1, respuesta = 0.3 } = {}) {
  const w0 = (2 * Math.PI) / respuesta;
  const z = amortiguamiento;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return (t, x0, v0) => {
      const e = Math.exp(-z * w0 * t);
      const a = x0;
      const b = (v0 + z * w0 * x0) / wd;
      const c = Math.cos(wd * t);
      const s = Math.sin(wd * t);
      return {
        x: e * (a * c + b * s),
        v: e * (-z * w0 * (a * c + b * s) + wd * (b * c - a * s)),
      };
    };
  }
  // Crítico. (Sobreamortiguado no lo usamos: es igual de seguro y más lento.)
  return (t, x0, v0) => {
    const e = Math.exp(-w0 * t);
    const b = v0 + w0 * x0;
    return { x: (x0 + b * t) * e, v: (b - w0 * (x0 + b * t)) * e };
  };
}

// Proyección de inercia de Apple (la misma deceleración que el scroll): adónde
// iría a parar algo lanzado a `v` px/ms si nadie lo frenara. Con esto se
// decide el destino de la hoja al soltar mirando ADÓNDE VA, no dónde está.
export function proyectar(v, deceleracion = 0.998) {
  return (v * deceleracion) / (1 - deceleracion);
}

const PASO_MS = 1000 / 60;

// Recorrido muestreado de `desde` a `hasta` con velocidad inicial en px/ms.
// `cortarSi(valor)` permite cortar antes de asentarse (p. ej. cuando la hoja ya
// ha salido de la pantalla: lo que queda de cola no lo ve nadie).
export function recorrido(desde, hasta, velocidad, params, { maxMs = 1200, cortarSi } = {}) {
  const estado = crearMuelle(params);
  const x0 = desde - hasta;
  const v0 = velocidad * 1000;
  const valores = [desde];
  let t = 0;
  for (;;) {
    t += PASO_MS;
    const { x, v } = estado(t / 1000, x0, v0);
    const valor = hasta + x;
    if (t >= maxMs || (Math.abs(x) < 0.4 && Math.abs(v) < 12) || cortarSi?.(valor)) {
      valores.push(hasta);
      break;
    }
    valores.push(valor);
  }
  return { valores, duracion: (valores.length - 1) * PASO_MS, estado, x0, v0 };
}

// Anima `el` con el muelle y, a la par, las capas que lo acompañan (el velo).
//   aplicar(valor) → objeto de estilo del fotograma, p. ej. { transform: … }
//   acompanantes: [{ el, aplicar(valor) }]
// Devuelve { parar(), terminado }:
//   parar() corta en seco y devuelve { valor, velocidad (px/ms) } del instante
//   exacto, dejando el estilo puesto en línea: desde ahí sigue el dedo.
//   terminado: promesa que se resuelve a true al asentarse o false si se paró.
export function animarMuelle(el, { desde, hasta, velocidad = 0, aplicar, acompanantes = [], cortarSi, ...params }) {
  const r = recorrido(desde, hasta, velocidad, params, { cortarSi });
  const capas = [{ el, aplicar }, ...acompanantes].filter((c) => c.el);
  // Fotogramas explícitos, uno por cada 1/60 s, con interpolación lineal entre
  // ellos: la forma del muelle (velocidad inicial incluida) va en los datos.
  const animaciones = capas.map((c) =>
    c.el.animate(r.valores.map((v) => c.aplicar(v)), {
      duration: Math.max(1, r.duracion),
      easing: 'linear',
      fill: 'forwards',
    })
  );

  const fijar = (valor) => {
    for (const c of capas) Object.assign(c.el.style, c.aplicar(valor));
    for (const a of animaciones) a.cancel();
  };

  let resolver;
  let acabado = false;
  const terminado = new Promise((res) => { resolver = res; });
  animaciones[0].finished.then(
    () => {
      if (acabado) return;
      acabado = true;
      fijar(hasta);
      resolver(true);
    },
    () => {}   // cancelada: la resuelve parar()
  );

  return {
    terminado,
    parar() {
      if (acabado) return { valor: hasta, velocidad: 0 };
      acabado = true;
      const t = Math.min(r.duracion, animaciones[0].currentTime ?? 0) / 1000;
      const { x, v } = r.estado(t, r.x0, r.v0);
      // Si el recorrido se cortó (salida por abajo), más allá del corte el
      // valor real ya es el destino.
      const valor = t * 1000 >= r.duracion ? hasta : hasta + x;
      fijar(valor);
      resolver(false);
      return { valor, velocidad: t * 1000 >= r.duracion ? 0 : v / 1000 };
    },
  };
}

// La misma curva como función de tiempo CSS `linear(…)`, normalizada de 0 a 1,
// para las animaciones que no puede lanzar JS: los pseudoelementos de la View
// Transition del cartel (ver lib/transicionCartel.js). Se muestrea hasta
// `duracionMs`; lo que falte para llegar al 1 (menos de un 1 % con estos
// parámetros) se reparte en vez de saltar en el último fotograma.
export function curvaCSS(params, duracionMs, puntos = 24) {
  const estado = crearMuelle(params);
  const final = 1 + estado(duracionMs / 1000, -1, 0).x;
  const valores = [];
  for (let i = 0; i <= puntos; i++) {
    const t = (duracionMs * i) / puntos / 1000;
    valores.push(((1 + estado(t, -1, 0).x) / final).toFixed(4));
  }
  return `linear(${valores.join(', ')})`;
}
