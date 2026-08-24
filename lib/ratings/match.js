// Emparejado de títulos de cine con las bases de datos de películas.
//
// El problema: los cines no anuncian el título "de catálogo". Le cuelgan
// coletillas del pase — "The Fast & The Furious 25 aniversario",
// "Vaiana (Live Action)", "Toy Story 5 VOSE", "El apartamento 4K" — y ninguna
// de esas cadenas existe en TMDB, así que la búsqueda volvía vacía y la
// película se quedaba sin nota.
//
// La estrategia es generar variantes del título de más fiel a más agresiva,
// probarlas en orden y quedarnos con el primer resultado que de verdad se
// parezca al que buscábamos, en vez de aceptar a ciegas el primero que llegue.

// Texto comparable: sin acentos, sin signos y con "&" y "and" unificados,
// para que "The Fast & The Furious" y "The Fast and the Furious" coincidan.
export function normaliza(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Coletillas que los cines añaden al título y que no forman parte de él.
const COLETILLAS = [
  /\(.*?\)/g,                                   // "(Live Action)", "(A Todo Gas)"
  /\b\d{1,3}\s*[ºªo]?\s*aniversario\b/gi,
  /\baniversario\b/gi,
  /\bre-?estreno\b/gi,
  /\bpre-?estreno\b/gi,
  /\bv\.?\s?o\.?\s?s\.?\s?e?\.?\b/gi,           // VO, VOS, VOSE
  /\bversi[oó]n\s+original\b/gi,
  /\bsubtitulad[ao]s?\b/gi,
  /\b(4k|uhd|imax|3d|2d|hdr|dolby|atmos|laser|l[aá]ser)\b/gi,
  /\bversi[oó]n\s+extendida\b/gi,
  /\bmontaje\s+del\s+director\b/gi,
  /\bdirector'?s?\s+cut\b/gi,
  /\bedici[oó]n\s+especial\b/gi,
  /\bcine\s*club\b/gi,
  /\bsesi[oó]n\s+especial\b/gi,
  /\bestreno\b/gi,
];

function limpia(texto) {
  let t = String(texto || '');
  for (const re of COLETILLAS) t = t.replace(re, ' ');
  return t
    .replace(/[–—]/g, '-')
    .replace(/\s*[-:]\s*$/, '')   // guion o dos puntos huérfanos al final
    .replace(/^\s*[-:]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Variantes a probar, de la más fiel a la más agresiva y sin repetidos.
export function variantesDeTitulo(titulo) {
  const original = String(titulo || '').trim();
  const limpio = limpia(original);

  const variantes = [limpio, original];

  // Último recurso: quedarse con lo anterior a los dos puntos. Es agresivo
  // ("Insidious: Fuera del más allá" → "Insidious", que es OTRA película), por
  // eso va al final y siempre pasa por la comprobación de parecido.
  const antesDeDosPuntos = limpio.split(':')[0].trim();
  if (antesDeDosPuntos && antesDeDosPuntos !== limpio) variantes.push(antesDeDosPuntos);

  const vistas = new Set();
  return variantes
    .map((v) => v.trim())
    .filter((v) => {
      const k = normaliza(v);
      if (!k || k.length < 2 || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
}

// ¿El resultado que nos devuelve la base de datos es la película que
// buscábamos? Evita colgarle a una peli la nota de otra que se llama parecido.
export function pareceElMismo(consulta, candidato) {
  const a = normaliza(consulta);
  const b = normaliza(candidato);
  if (!a || !b) return false;
  if (a === b) return true;

  const pa = a.split(' ').filter(Boolean);
  const pb = b.split(' ').filter(Boolean);

  // Uno contiene al otro entero: "toy story 5" ⊂ "toy story 5 la despedida".
  // El corto debe tener al menos dos palabras; si no, "Insidious" se comería
  // "Insidious: Fuera del más allá", que es otra película de la saga.
  if (Math.min(pa.length, pb.length) >= 2 && (a.includes(b) || b.includes(a))) {
    return true;
  }

  const sa = new Set(pa);
  const sb = new Set(pb);
  const comunes = [...sa].filter((p) => sb.has(p)).length;
  const union = new Set([...sa, ...sb]).size;
  if (!union) return false;

  // Títulos de una sola palabra: exigimos coincidencia exacta, ya comprobada.
  if (sa.size === 1 && sb.size === 1) return false;

  return comunes / union >= 0.6;
}
