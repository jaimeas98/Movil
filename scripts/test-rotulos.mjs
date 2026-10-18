// Lo pequeño de cada sesión se escribe igual venga del cine que venga
// (lib/rotulos.js, piezasDeSesion). Son los valores REALES que mandan los
// cuatro cines: Cinesur da la sala "Sala Premium"; Yelmo el formato
// "PREMIUM" (o "CA PREMIUM") y la sala en número; Arte Siete "4K Laser Atmos",
// "Láser VO" y "Sala 05". Antes el tratamiento dependía del campo y la misma
// idea salía en gris en un cine y en negrita y mayúsculas en otro.
import { piezasDeSesion, rotuloLegible } from '../lib/rotulos.js';
import { detallesDeSesion } from '../lib/cartelera.js';

let fallos = 0;
const texto = (piezas) => piezas.map((p) => `${p.tipo}:${p.texto}`).join(' | ');
const eq = (nombre, r, esperado) => {
  if (r !== esperado) { fallos++; console.log(`FALLO ${nombre}: ${r}\n      esperado ${esperado}`); }
  else console.log(`ok    ${nombre}: ${r}`);
};
const sesion = (format, room, language = 'VE') => piezasDeSesion(detallesDeSesion({ format, room, language }));

// Yelmo: el formato en mayúsculas pasa a "Premium", en el mismo tratamiento
// que la sala; la sala numérica lleva "Sala".
eq('Yelmo PREMIUM', texto(sesion('PREMIUM', '2')), 'formato:Premium | sala:Sala 2');
eq('Yelmo CA PREMIUM VOSE', texto(sesion('CA PREMIUM', '7', 'VOSE')), 'clave:VOSE | formato:CA Premium | sala:Sala 7');
// Cinesur: la sala es "Sala Premium", tal cual; VOSE delante
eq('Cinesur Sala Premium', texto(sesion('2D', 'Sala Premium')), 'sala:Sala Premium');
eq('Cinesur VOSE', texto(sesion('2D', 'Sala Premium', 'VOSE')), 'clave:VOSE | sala:Sala Premium');
// Arte Siete: el 3D se separa del formato y va delante; "Sala 05" sin el cero
eq('Arte Siete 3D', texto(sesion('4K Laser Atmos 3D', 'Sala 05')), 'clave:3D | formato:4K Laser Atmos | sala:Sala 5');
eq('Arte Siete Láser VO', texto(sesion('Láser VO', 'Sala 09')), 'clave:VO | formato:Láser | sala:Sala 9');
eq('VO con VOSE no se repite', texto(piezasDeSesion({ etiquetas: ['VOSE', 'Láser VO'], sala: '' })), 'clave:VOSE | formato:Láser');
// Las siglas cortas y lo que lleva cifras no se tocan
eq('siglas', ['VOSE', '4K', 'CA', 'IMAX', 'SCREENX', 'DOLBY ATMOS', 'Sala'].map(rotuloLegible).join(' '), 'VOSE 4K CA IMAX ScreenX Dolby Atmos Sala');
// Nada que decir, nada
eq('2D sin sala', texto(sesion('2D', null)), '');

console.log(fallos ? `\n${fallos} FALLOS` : '\nTodas pasan');
process.exit(fallos ? 1 : 0);
