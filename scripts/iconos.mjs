// Genera los iconos de la cartelera en public/: icono.svg (pestaña del
// navegador), favicon.ico (16, 32 y 48 px, para los navegadores que lo piden
// por su cuenta), icono-180.png (pantalla de inicio del iPhone),
// icono-192/512.png (Android y el manifest) e icono-maskable-512.png (Android
// lo recorta en círculo o en la forma que toque: el dibujo va más pequeño,
// dentro del círculo central del 80 %).
//
// El dibujo: la entrada roja butaca con sus dos muescas de troquel y la línea
// de picado, la misma pieza que lleva cada sesión en la web (DESIGN.md, «La
// entrada»), sobre el azul noche de la bahía. Elegido por Jaime el 31-10-2026
// entre cuatro opciones (la entrada sola se reconoce hasta a 16 px).
//
// Este fichero es la fuente: para cambiar el icono se cambia aquí y se vuelve
// a ejecutar. Necesita playwright (no está en package.json a propósito):
//   node scripts/iconos.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const FONDO = '#0B1526';     // Azul Noche de Bahía (tokens.css --fondo)
const ROJO = '#C22E43';      // Rojo Butaca

// La entrada, en un lienzo de 512. Las muescas se recortan con una máscara
// para que lo de detrás (el fondo) se vea por ellas.
const dibujo = `
  <mask id="troquel">
    <rect x="64" y="156" width="384" height="200" rx="10" fill="#fff"/>
    <circle cx="64" cy="256" r="28" fill="#000"/><circle cx="448" cy="256" r="28" fill="#000"/>
  </mask>
  <rect x="64" y="156" width="384" height="200" rx="10" fill="${ROJO}" mask="url(#troquel)"/>
  <line x1="366" y1="176" x2="366" y2="336" stroke="${FONDO}" stroke-width="7" stroke-dasharray="2 14" stroke-linecap="round"/>`;

const svg = ({ redondo = false, escala = 1 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512"${redondo ? ' rx="112"' : ''} fill="${FONDO}"/>
  <g transform="translate(256 256) scale(${escala}) translate(-256 -256)">${dibujo}</g>
</svg>
`;

const RAIZ = new URL('../public/', import.meta.url);
const COMENTARIO = '<!-- Icono de la cartelera: la entrada roja butaca sobre el azul noche. Generado por scripts/iconos.mjs: se cambia allí. -->\n';
writeFileSync(new URL('icono.svg', RAIZ), svg({ redondo: true }).replace('>\n', `>\n  ${COMENTARIO}`));

const { chromium } = createRequire(import.meta.url)('playwright');
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
async function png(codigo, lado) {
  await pagina.setViewportSize({ width: lado, height: lado });
  await pagina.setContent(`<style>*{margin:0}svg{display:block;width:${lado}px;height:${lado}px}</style>${codigo}`);
  return pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } });
}
// A sangre: iOS y Android ponen sus propias esquinas.
for (const lado of [180, 192, 512]) writeFileSync(new URL(`icono-${lado}.png`, RAIZ), await png(svg(), lado));
writeFileSync(new URL('icono-maskable-512.png', RAIZ), await png(svg({ escala: 0.78 }), 512));

// favicon.ico con PNG dentro (lo entienden todos los navegadores de hoy):
// cabecera de 6 bytes, una entrada de 16 por tamaño y luego las imágenes.
const tamanos = [16, 32, 48];
const imagenes = [];
for (const t of tamanos) imagenes.push(await png(svg({ redondo: true }), t));
const cab = Buffer.alloc(6 + 16 * tamanos.length);
cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(tamanos.length, 4);
let desplazamiento = cab.length;
tamanos.forEach((t, i) => {
  const o = 6 + 16 * i;
  cab.writeUInt8(t, o); cab.writeUInt8(t, o + 1); cab.writeUInt8(0, o + 2); cab.writeUInt8(0, o + 3);
  cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6);
  cab.writeUInt32LE(imagenes[i].length, o + 8); cab.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += imagenes[i].length;
});
writeFileSync(new URL('favicon.ico', RAIZ), Buffer.concat([cab, ...imagenes]));
await navegador.close();
console.log('Iconos de la cartelera en public/.');
