import { variantesDeTitulo, pareceElMismo, normaliza } from '../lib/ratings/match.js';
let fallos = 0;
const eq = (n, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fallos++; console.log(`FALLO ${n}\n  obtenido ${JSON.stringify(a)}\n  esperado ${JSON.stringify(b)}`); }
  else console.log(`ok    ${n} → ${JSON.stringify(a)}`);
};
// Títulos reales sacados de la cartelera de los cuatro cines
eq('aniversario (el caso reportado)', variantesDeTitulo('The Fast & The Furious 25 aniversario')[0], 'The Fast & The Furious');
eq('paréntesis', variantesDeTitulo('Vaiana (Live Action)')[0], 'Vaiana');
eq('paréntesis + aniversario', variantesDeTitulo('Harry Potter y la piedra filosofal (25 aniversario)')[0], 'Harry Potter y la piedra filosofal');
eq('formato 4K', variantesDeTitulo('El apartamento 4K')[0], 'El apartamento');
eq('VOSE', variantesDeTitulo('Toy Story 5 VOSE')[0], 'Toy Story 5');
eq('título limpio se deja igual', variantesDeTitulo('Casablanca')[0], 'Casablanca');
eq('dos puntos como último recurso', variantesDeTitulo('Insidious: Fuera del más allá').at(-1), 'Insidious');

const si = (n, a, b) => { const r = pareceElMismo(a, b); if (!r) { fallos++; console.log(`FALLO ${n}: debería casar "${a}" con "${b}"`); } else console.log(`ok    ${n}`); };
const no = (n, a, b) => { const r = pareceElMismo(a, b); if (r) { fallos++; console.log(`FALLO ${n}: NO debería casar "${a}" con "${b}"`); } else console.log(`ok    ${n}`); };

si('& contra and', 'The Fast & The Furious', 'The Fast and the Furious');
si('acentos', 'El día de la revelación', 'El dia de la revelacion');
si('subtítulo añadido', 'Toy Story 5', 'Toy Story 5: La despedida');
si('mismo título exacto', 'Casablanca', 'Casablanca');
no('secuela distinta no cuela', 'Insidious', 'Insidious: Fuera del más allá');
no('películas distintas', 'Origen', 'Gremlins');
no('una palabra contra otra', 'Akira', 'Casablanca');
console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
