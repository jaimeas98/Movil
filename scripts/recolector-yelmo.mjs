#!/usr/bin/env node
// Recolector de la cartelera de Yelmo, para ejecutar EN TU PROPIO EQUIPO.
//
// POR QUÉ EXISTE
// Yelmo puso Cloudflare delante de su web y bloquea a cualquier servidor:
// comprobado desde Washington y desde París, y caen las seis vías, hasta el
// robots.txt. A ti, en cambio, te responde con normalidad, porque eres una
// persona con un navegador y una conexión doméstica. Este script no disfraza
// nada ni fuerza ninguna puerta: es tu equipo pidiendo lo mismo que pide tu
// navegador cuando entras en su web, y guardando el resultado para que tu
// cartelera lo pueda leer.
//
// CÓMO SE USA
//   node scripts/recolector-yelmo.mjs            recoge y guarda data/yelmo.js
//   node scripts/recolector-yelmo.mjs --publicar  además hace commit y push
//
// Al hacer push, Vercel redespliega solo y la web se actualiza. No hace falta
// ninguna clave ni ningún servicio nuevo: usa el git que ya tienes configurado.
//
// CADA CUÁNTO
// Con una o dos veces al día sobra: los horarios de un día no cambian una vez
// publicados. Si quieres automatizarlo, al final del fichero tienes la línea
// de cron para Linux/macOS y el equivalente en Windows.
//
// Y SI EL EQUIPO ESTÁ APAGADO
// No pasa nada. La web tira de esta instantánea mientras sea reciente y, por
// debajo, cada dispositivo guarda además su propio respaldo. Lo peor que ocurre
// es que veas los horarios con la antigüedad indicada en pantalla.

import { writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'data', 'yelmo.js');

const API = 'https://www.yelmocines.es/now-playing.aspx/GetNowPlaying';
// Las claves de recinto tal y como las devuelve su propio API.
const CINES = { 'yelmo-bahia-sur': 'premium-bahia-sur', 'yelmo-jerez': 'area-sur' };

// Mismas cabeceras que envía su web al llamar a su propio endpoint.
const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.yelmocines.es/',
  'Origin': 'https://www.yelmocines.es',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'es-ES,es;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

async function recoger() {
  const res = await fetch(API, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify({ cityKey: 'cadiz' }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const cuerpo = await res.text();
    if (res.status === 403 && /cloudflare/i.test(res.headers.get('server') || '')) {
      throw new Error(
        'Cloudflare también te ha bloqueado a ti (403).\n' +
        'Prueba a abrir https://www.yelmocines.es en el navegador de este mismo equipo:\n' +
        '  · si la web carga, vuelve a intentarlo en unos minutos;\n' +
        '  · si no carga, el bloqueo alcanza a tu conexión y aquí no hay nada que hacer.'
      );
    }
    throw new Error(`HTTP ${res.status}. Principio de la respuesta: ${cuerpo.slice(0, 200)}`);
  }

  const datos = await res.json();
  const cinemas = datos?.d?.Cinemas ?? [];
  if (!cinemas.length) throw new Error('El API ha respondido, pero sin ningún cine. ¿Ha cambiado su formato?');

  // Guardamos SOLO nuestros dos cines, tal cual vienen: el adaptador de la web
  // ya sabe interpretar esta forma, así que no hay dos parsers que mantener.
  const cines = {};
  for (const [id, clave] of Object.entries(CINES)) {
    const encontrado =
      cinemas.find((c) => c.Key === clave) ||
      cinemas.find((c) => c.Key?.includes(clave.replace(/^premium-/, '')));
    if (encontrado) cines[id] = encontrado;
    else console.warn(`⚠️  No aparece el cine '${clave}'. Claves disponibles: ${cinemas.map((c) => c.Key).join(', ')}`);
  }

  if (!Object.keys(cines).length) throw new Error('No se ha encontrado ninguno de nuestros dos cines.');
  return { generatedAt: new Date().toISOString(), origen: 'recolector-local', cines };
}

const cabecera = () => `// Instantánea de la cartelera de Yelmo, recogida desde una máquina doméstica.
// Lo genera scripts/recolector-yelmo.mjs — NO se edita a mano.
`;

function resumir(instantanea) {
  return Object.entries(instantanea.cines).map(([id, cine]) => {
    const dias = cine.Dates?.length ?? 0;
    const pelis = (cine.Dates ?? []).reduce((n, d) => n + (d.Movies?.length ?? 0), 0);
    return `   · ${id}: ${dias} día(s), ${pelis} pase(s) de película`;
  }).join('\n');
}

try {
  console.log('Pidiendo la cartelera a Yelmo…');
  const instantanea = await recoger();

  // No pisamos una instantánea buena con una peor: si hoy viniera medio vacía,
  // mejor conservar la de ayer que dejar la web sin datos.
  try {
    const texto = readFileSync(DESTINO, 'utf8');
    const previa = JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    const antes = Object.keys(previa.cines ?? {}).length;
    const ahora = Object.keys(instantanea.cines).length;
    if (antes > ahora) {
      console.warn(`⚠️  La anterior tenía ${antes} cines y ésta ${ahora}. Se conserva la anterior.`);
      process.exit(1);
    }
  } catch { /* no había instantánea previa */ }

  writeFileSync(DESTINO, cabecera() + 'export default ' + JSON.stringify(instantanea, null, 2) + ';\n');
  console.log(`✅ Guardado en data/yelmo.js\n${resumir(instantanea)}`);

  if (process.argv.includes('--publicar')) {
    execSync('git add data/yelmo.js', { cwd: RAIZ, stdio: 'inherit' });
    const hayCambios = execSync('git status --porcelain data/yelmo.js', { cwd: RAIZ }).toString().trim();
    if (!hayCambios) {
      console.log('Sin cambios respecto a la instantánea anterior: no se publica nada.');
    } else {
      execSync(`git commit -m "Cartelera de Yelmo — ${instantanea.generatedAt.slice(0, 16).replace('T', ' ')}"`,
        { cwd: RAIZ, stdio: 'inherit' });
      execSync('git push', { cwd: RAIZ, stdio: 'inherit' });
      console.log('✅ Publicado. Vercel redesplegará en un par de minutos.');
    }
  } else {
    console.log('\nPara publicarlo en la web: vuelve a ejecutarlo con --publicar');
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

// ── Automatizarlo ────────────────────────────────────────────────────────────
//
// Linux o macOS — dos veces al día, a las 9:10 y a las 19:10:
//   crontab -e
//   10 9,19 * * *  cd /ruta/a/Movil && /usr/bin/node scripts/recolector-yelmo.mjs --publicar
//
// Windows — Programador de tareas, acción "Iniciar un programa":
//   Programa:   node
//   Argumentos: scripts\recolector-yelmo.mjs --publicar
//   Iniciar en: C:\ruta\a\Movil
