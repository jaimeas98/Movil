// Los géneros llegan escritos de mil maneras y cada variante creaba un chip de
// filtro distinto para el mismo género. Estos son casos REALES vistos en los
// datos de los cines y en las respuestas de OMDB.
import { normalizaGenero } from '../lib/normalize.js';

let fallos = 0;
const eq = (entrada, esperado) => {
  const r = normalizaGenero(entrada);
  if (r !== esperado) { fallos++; console.log(`FALLO ${JSON.stringify(entrada)} -> ${JSON.stringify(r)}, esperado ${JSON.stringify(esperado)}`); }
  else console.log(`ok    ${JSON.stringify(entrada)} -> ${JSON.stringify(r)}`);
};

// El caso reportado: Arte Siete escribe el mismo género de las dos formas
eq('Animacion', 'Animación');
eq('Animación', 'Animación');
eq('ANIMACIÓN', 'Animación');
// Inglés colado desde OMDB
eq('Animation', 'Animación');
eq('Action', 'Acción');
eq('Adventure', 'Aventura');
eq('Horror', 'Terror');
eq('Sci-Fi', 'Ciencia ficción');
// Singular y plural entre cines
eq('Aventura', 'Aventura');
eq('Aventuras', 'Aventura');
// Acentos y mayúsculas
eq('Accion', 'Acción');
eq('Ciencia Ficcion', 'Ciencia ficción');
eq('TERROR', 'Terror');
eq('terror', 'Terror');
eq('Opera', 'Ópera');
// Desconocido: al menos unifica mayúsculas, no inventa
eq('Cine negro', 'Cine negro');
eq('CINE NEGRO', 'Cine negro');
// Vacíos
eq('', null);
eq(null, null);
eq('   ', null);

// La prueba de verdad: una lista con duplicados debe quedar en uno solo
const crudos = ['Animacion', 'Animación', 'Animation', 'Aventura', 'Aventuras', 'Accion', 'Acción'];
const unicos = [...new Set(crudos.map(normalizaGenero))].sort();
const esperado = ['Acción', 'Animación', 'Aventura'];
if (JSON.stringify(unicos) !== JSON.stringify(esperado)) {
  fallos++; console.log(`FALLO la lista queda ${JSON.stringify(unicos)}, esperado ${JSON.stringify(esperado)}`);
} else console.log(`ok    7 variantes se reducen a 3 géneros: ${JSON.stringify(unicos)}`);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
