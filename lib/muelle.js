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
  // Sobreamortiguado (ζ > 1) no se resuelve: llega igual de seguro que el
  // crítico pero más tarde, y ninguna pieza de la casa lo quiere. Se recorta a
  // 1 a la vista, aquí, en vez de caer en silencio en la rama crítica: quien
  // pase 1,4 sabrá leyendo esto que se mueve como 1.
  const z = Math.min(1, Math.max(0, amortiguamiento));
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
  // Crítico (y todo lo que pida más: ver arriba).
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
// Lanza las animaciones de `capas` con unos fotogramas ya calculados y
// devuelve el mando común { terminado, parar() }. `estadoEn(ms)` dice dónde
// estaba y a qué velocidad (px/ms) en cada instante: es lo que permite
// agarrar la pieza a mitad de camino sin un salto.
function lanzarCapas(capas, valores, duracion, hasta, estadoEn) {
  const animaciones = capas.map((c) =>
    c.el.animate(valores.map((v) => c.aplicar(v)), {
      duration: Math.max(1, duracion),
      easing: 'linear',
      fill: 'forwards',
    })
  );
  // Que empiecen AHORA, en el fotograma en curso, y no en el siguiente. Si
  // el navegador las arranca en el siguiente, ese primer fotograma pinta la
  // muestra t = 0 —donde ya estaba la pieza— y se nota un tropiezo entre el
  // dedo y la animación (24,96 → 25 → 80 px al soltar la hoja). Con el
  // arranque fijado aquí, el primer fotograma pintado ya va un fotograma por
  // delante, a la velocidad que traía. Todas a la vez: hoja y velo juntos.
  const ahora = document.timeline?.currentTime;
  if (typeof ahora === 'number') for (const a of animaciones) a.startTime = ahora;

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
      const ms = Math.min(duracion, animaciones[0].currentTime ?? 0);
      // Más allá del final (o del corte de una salida por abajo) el valor
      // real ya es el destino.
      const { valor, velocidad } = ms >= duracion ? { valor: hasta, velocidad: 0 } : estadoEn(ms);
      fijar(valor);
      resolver(false);
      return { valor, velocidad };
    },
  };
}

export function animarMuelle(el, { desde, hasta, velocidad = 0, aplicar, acompanantes = [], cortarSi, ...params }) {
  const r = recorrido(desde, hasta, velocidad, params, { cortarSi });
  const capas = [{ el, aplicar }, ...acompanantes].filter((c) => c.el);
  // Fotogramas explícitos, uno por cada 1/60 s, con interpolación lineal entre
  // ellos: la forma del muelle (velocidad inicial incluida) va en los datos.
  return lanzarCapas(capas, r.valores, r.duracion, hasta, (ms) => {
    const { x, v } = r.estado(ms / 1000, r.x0, r.v0);
    return { valor: hasta + x, velocidad: v / 1000 };
  });
}

// ── Tramo con tiempo fijo que arranca a la velocidad del dedo ─────────────────
// Para las salidas con gesto. Un muelle hacia un destino a 800 px no sabe
// que el dedo iba despacio: lo lleva a su ritmo y la hoja "patea" lejos del
// dedo (0,2 px/ms de dedo → 2,5 → 5,4 px/ms de hoja en dos fotogramas). Aquí
// la curva se construye para que su pendiente inicial sea exactamente la del
// dedo y luego frene hasta el borde, en un tiempo acotado.
//
// cubic-bezier(x1, y1, x2, y2): la pendiente en t = 0 es y1/x1 (en unidades
// normalizadas, distancia/duración). Con x1 = 0,2, y1 = 0,2 · v·T/D da v.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  const dY = (s) => (3 * ay * s + 2 * by) * s + cy;
  // s tal que X(s) = t: Newton, y bisección si la derivada se aplana.
  const resolver = (t) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const e = X(s) - t;
      if (Math.abs(e) < 1e-5) return s;
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0, hi = 1; s = t;
    for (let i = 0; i < 30; i++) {
      if (X(s) < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  return {
    css: `cubic-bezier(${x1}, ${y1.toFixed(4)}, ${x2}, ${y2})`,
    // progreso (0–1) y su derivada respecto al tiempo normalizado
    en(t) {
      const s = resolver(Math.min(1, Math.max(0, t)));
      const d = dX(s);
      return { p: Y(s), dp: d > 1e-6 ? dY(s) / d : 0 };
    },
  };
}

// Parámetros del tramo: duración T = clamp(D / max(v, 1), 160, 280) ms —
// cuanto más deprisa iba el dedo, antes llega, pero nunca tan rápido que no
// se lea ni tan lento que parezca que se resiste— y la curva que arranca a v.
export function tramoDeSalida(distancia, velocidad) {
  const D = Math.max(1, Math.abs(distancia));
  const v = Math.max(0, velocidad);
  const T = Math.min(280, Math.max(160, D / Math.max(v, 1)));
  const y1 = Math.min(1, (0.2 * v * T) / D);
  return { duracion: T, curva: bezier(0.2, y1, 0.4, 1) };
}

// Anima de `desde` a `hasta` con el tramo anterior. Mismo mando que
// animarMuelle (se puede agarrar a mitad y devuelve dónde y a qué velocidad
// iba), así que la hoja no distingue uno de otro.
export function animarTramo(el, { desde, hasta, velocidad = 0, aplicar, acompanantes = [] }) {
  const capas = [{ el, aplicar }, ...acompanantes].filter((c) => c.el);
  const { duracion, curva } = tramoDeSalida(hasta - desde, Math.abs(velocidad));
  // Muestreado a 60 fps igual que el muelle (la curva va en los datos, con
  // interpolación lineal).
  const pasos = Math.max(2, Math.round(duracion / PASO_MS));
  const valores = [];
  for (let i = 0; i <= pasos; i++) valores.push(desde + (hasta - desde) * curva.en(i / pasos).p);
  return lanzarCapas(capas, valores, duracion, hasta, (ms) => {
    const { p, dp } = curva.en(ms / duracion);
    return { valor: desde + (hasta - desde) * p, velocidad: ((hasta - desde) * dp) / duracion };
  });
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
