// Cómo se nombra cada cine en la interfaz, según el sitio del que se dispone.
//
// lib/cinemas/config.js trae el nombre comercial y uno corto ("Yelmo Bahía
// Sur"), pero en el interruptor del móvil caben diez letras y no catorce, y en
// el pie de cada grupo de entradas sobra "de la Frontera". Esto no toca los
// datos: solo decide el rótulo.

const INTERRUPTOR = {
  'cinesur-bahia-cadiz': 'Cinesur',
  'yelmo-bahia-sur': 'Bahía Sur',
  'yelmo-jerez': 'Área Sur',
  'arte-siete-puerto': 'Arte Siete',
};

const LUGAR = {
  'Jerez de la Frontera': 'Jerez',
  'El Puerto de Santa María': 'El Puerto',
};

export function nombreInterruptor(cine) {
  return INTERRUPTOR[cine.id] ?? cine.short ?? cine.name;
}

export function lugarCorto(cine) {
  return LUGAR[cine.city] ?? cine.city ?? '';
}

// ── Lo pequeño de cada sesión, escrito igual venga del cine que venga ────────
//
// Cada cine llama a lo mismo de una manera: Cinesur da la sala "Sala Premium",
// Yelmo el formato "PREMIUM" con la sala en número, Arte Siete "4K Laser
// Atmos" y "Sala 05". Antes el tratamiento lo decidía el CAMPO del que venía
// (el formato en negrita y tinta, la sala en apagado), y la misma idea salía
// "Sala Premium" en gris en un cine y "PREMIUM" en negro y gritando en otro.
// Ahora lo decide lo que SIGNIFICA:
//  · 'clave': lo que cambia la decisión de ir o no (versión original y 3D).
//    En negrita y en tinta, como siempre.
//  · 'formato' y 'sala': cómo es la sala (Premium, láser, Atmos, su número).
//    Un mismo tratamiento discreto para todos, se llame como se llame.
// Y se escribe legible: las palabras enteras en mayúsculas pasan a minúsculas
// con inicial ("PREMIUM" → "Premium"), pero no las siglas cortas ni lo que
// lleva cifras ("VOSE", "4K", "3D", "CA"), que en minúsculas ya no se leen.
// Solo cambia el rótulo: los datos y lo común de cada cine (lib/cartelera.js)
// se calculan con el texto tal cual llega.

const CLAVE = /^(VOSE|VOS|VO|V\.O\.S?\.?E?\.?|3D)$/i;
const RAROS = { SCREENX: 'ScreenX', ISENSE: 'iSense', IMAX: 'IMAX', '4DX': '4DX' };

export function rotuloLegible(texto) {
  return String(texto).trim().split(/\s+/).map((p) => {
    const sin = p.toUpperCase();
    if (RAROS[sin]) return RAROS[sin];
    // Solo palabras ENTERAS en mayúsculas y de 5 letras o más: "Láser" o
    // "Sala" se quedan como vienen, y las siglas cortas también.
    if (/^[A-ZÁÉÍÓÚÜÑ]{5,}$/.test(p)) return p[0] + p.slice(1).toLowerCase();
    return p;
  }).join(' ');
}

// "Sala 05" y "Sala 5" son la misma sala en dos cines distintos: sin el cero.
const salaLegible = (sala) => rotuloLegible(sala).replace(/^(Sala\s+)0+(\d)/i, '$1$2');

// Piezas en el orden en que se leen: primero lo que decide (VOSE, 3D), luego
// cómo es la sala. Una VO dentro del formato ("Láser VO") con VOSE ya dicha
// no se repite.
//   → [{ texto, tipo: 'clave' | 'formato' | 'sala' }]
export function piezasDeSesion({ etiquetas = [], sala = '' } = {}) {
  const claves = [];
  const formatos = [];
  for (const t of etiquetas) {
    const palabras = String(t).trim().split(/\s+/).filter(Boolean);
    const resto = [];
    for (const p of palabras) {
      if (CLAVE.test(p)) claves.push(p.toUpperCase().replace(/\./g, ''));
      else resto.push(p);
    }
    if (resto.length) formatos.push(rotuloLegible(resto.join(' ')));
  }
  const vistas = new Set();
  const unicas = claves.filter((c) => {
    if (vistas.has(c) || (c !== 'VOSE' && c.startsWith('VO') && claves.includes('VOSE'))) return false;
    vistas.add(c);
    return true;
  });
  return [
    ...unicas.map((texto) => ({ texto, tipo: 'clave' })),
    ...formatos.map((texto) => ({ texto, tipo: 'formato' })),
    ...(sala ? [{ texto: salaLegible(sala), tipo: 'sala' }] : []),
  ];
}
