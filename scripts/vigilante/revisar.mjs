// Vigilante del móvil recolector. Lo ejecuta GitHub Actions cada 30 minutos
// (.github/workflows/vigilante-movil.yml) y avisa a Jaime abriendo un aviso
// (issue) en el repositorio, asignado a él y mencionándole: es lo que la app
// de GitHub notifica por defecto en el móvil y en la tablet.
//
// POR QUÉ ASÍ
// El móvil no puede avisar de que se ha apagado: cuando falla, calla. Por eso
// vigila alguien de fuera, que lee el informe que el móvil deja en la rama
// `estado-movil` en cada vuelta (cada 15 min). GitHub Actions es gratis, no
// depende de que haya ninguna sesión abierta y no gasta uso de Claude.
//
// QUÉ AVISA
//  · Sin señal: el último informe tiene más de 45 min (se han perdido dos
//    vueltas seguidas). A las 3 h, un recordatorio de que sigue igual.
//  · Batería: sin cargar y baja, o bajando a un ritmo que la dejaría en apuros
//    antes de 2 h. No se mira solo el porcentaje del último informe: se estima
//    el de AHORA y el de dentro de 2 h con el ritmo de descarga medido en el
//    móvil (scripts/movil/bateria.mjs). Así, un 40 % que baja un 15 % por hora
//    avisa ya, aunque el informe sea de hace un rato.
//  · Crítico (segundo aviso en el mismo issue): ≤10 % o a punto de apagarse.
// Cada problema es UN issue: no se repite cada media hora. Se cierra solo, con
// un comentario, cuando se arregla (eso también llega como notificación).
//
//   node scripts/vigilante/revisar.mjs                 de verdad (necesita GITHUB_TOKEN)
//   SIMULAR=1 ESTADO=fichero.json node …revisar.mjs    solo dice qué haría

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SIN_SENAL_MIN = 45;
export const RECORDATORIO_SIN_SENAL_H = 3;
const ETIQUETA = 'alerta-movil';

const hora = (ms) => new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(ms));
const duracion = (h) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h${Math.round((h % 1) * 60) ? ` ${Math.round((h % 1) * 60)} min` : ''}`);
const pct = (n) => `${Math.max(0, Math.round(n))} %`;

// Lo que dice la batería, estimado para AHORA y para dentro de `h` horas.
function batería(estado, ahora) {
  const b = estado?.bateria;
  if (!b || !Number.isFinite(b.porcentaje)) return null;
  const desde = Math.max(0, (ahora - Date.parse(estado.vuelta)) / 3600000);
  const ritmo = b.cargando ? 0 : (b.ritmoPorHora ?? 0);
  const ahoraPct = b.porcentaje - ritmo * desde;
  return { ...b, ritmo, ahoraPct, en: (h) => ahoraPct - ritmo * h };
}

function lineaBateria(bt) {
  if (!bt) return 'Batería: sin datos.';
  if (bt.cargando) return `Batería: ${pct(bt.porcentaje)}, cargando.`;
  let s = `Batería: ${pct(bt.porcentaje)} en el último informe, sin cargar`;
  if (bt.desenchufadoDesde) s += ` desde ${hora(Date.parse(bt.desenchufadoDesde))}`;
  if (bt.ritmo > 0) s += `; baja un ${bt.ritmo.toFixed(1).replace('.', ',')} % por hora (ahora andará por el ${pct(bt.ahoraPct)})`;
  return s + '.';
}

// Las alertas activas para este informe y este momento. Función pura.
export function evaluar(estado, ahora = Date.now(), { prueba = false } = {}) {
  const alertas = [];
  if (prueba) {
    alertas.push({
      tipo: 'prueba', nivel: 'aviso',
      titulo: 'Prueba de aviso del móvil',
      cuerpo: 'Esto es una prueba para comprobar que te llegan los avisos del vigilante del móvil. ' +
        'Si te ha llegado la notificación, todo está bien. Se cerrará solo en la próxima revisión (en unos 30 min).',
    });
  }

  const vuelta = Date.parse(estado?.vuelta ?? '');
  const bt = batería(estado, ahora);
  const sinSeñalH = Number.isFinite(vuelta) ? (ahora - vuelta) / 3600000 : Infinity;

  if (sinSeñalH * 60 > SIN_SENAL_MIN) {
    const probableBateria = bt && !bt.cargando && bt.ahoraPct <= 5;
    alertas.push({
      tipo: 'sin-senal',
      nivel: sinSeñalH >= RECORDATORIO_SIN_SENAL_H ? 'critico' : 'aviso',
      titulo: probableBateria
        ? 'El móvil no responde: probablemente se ha quedado sin batería'
        : 'El móvil no responde',
      cuerpo: [
        Number.isFinite(vuelta)
          ? `El móvil no da señales desde **${hora(vuelta)}** (hace ${duracion(sinSeñalH)}). Debería informar cada 15 minutos.`
          : 'No hay ningún informe del móvil.',
        lineaBateria(bt),
        probableBateria
          ? 'Por el ritmo al que bajaba, lo más seguro es que se haya apagado. Enchúfalo; al encenderse vuelve a arrancar solo.'
          : 'Mira que esté encendido, con WiFi y con Termux abierto. Si hace falta, en Termux: `bash ~/.recolector/ciclo.sh`.',
        'Mientras tanto la web sigue enseñando los últimos datos de Yelmo (avisando de su hora).',
      ].join('\n\n'),
    });
    return alertas; // con el móvil mudo, la batería ya va dentro de este aviso
  }

  if (bt && !bt.cargando) {
    const critico = bt.ahoraPct <= 10 || (bt.ritmo > 0 && bt.en(1) <= 5);
    const aviso = critico || bt.ahoraPct <= 25 || bt.en(2) <= 20;
    if (aviso) {
      const motivo = bt.ahoraPct <= 25
        ? `está en torno al **${pct(bt.ahoraPct)}** y sin cargar`
        : `baja deprisa: en unas 2 h estaría en torno al **${pct(bt.en(2))}**`;
      const quedan = bt.ritmo > 0 ? ` A este ritmo se apagaría en unas ${duracion(Math.max(0, bt.ahoraPct) / bt.ritmo)}.` : '';
      alertas.push({
        tipo: 'bateria',
        nivel: critico ? 'critico' : 'aviso',
        titulo: `Batería del móvil: ${pct(bt.ahoraPct)} y sin cargar`,
        cuerpo: [
          `La batería del móvil recolector ${motivo}.${quedan}`,
          lineaBateria(bt),
          '**Enchúfalo** para que no se pare la cartelera de Yelmo.',
        ].join('\n\n'),
      });
    }
  }
  return alertas;
}

// Por qué se cierra cada tipo de aviso, para el comentario de cierre.
function resuelto(tipo, estado) {
  const b = estado?.bateria;
  if (tipo === 'sin-senal') return `Resuelto: el móvil vuelve a responder (último informe ${hora(Date.parse(estado.vuelta))}).`;
  if (tipo === 'bateria') return b?.cargando ? `Resuelto: el móvil vuelve a cargar (${pct(b.porcentaje)}).` : `Resuelto: la batería ya no corre peligro (${pct(b?.porcentaje ?? 0)}).`;
  return 'Prueba terminada: este aviso se cierra solo.';
}

const marca = (tipo, nivel) => `<!-- vigilante:${tipo} nivel:${nivel} -->`;
const leerMarca = (cuerpo) => {
  const m = /<!-- vigilante:([\w-]+) nivel:(\w+) -->/.exec(cuerpo ?? '');
  return m ? { tipo: m[1], nivel: m[2] } : null;
};

// Abre, escala o cierra issues para que reflejen `alertas`. `api(método,
// ruta, cuerpo)` llama a la API de GitHub (o simula).
export async function sincronizar(alertas, estado, { api, dueño }) {
  const abiertos = (await api('GET', `/issues?state=open&labels=${ETIQUETA}&per_page=50`))
    .filter((i) => !i.pull_request && leerMarca(i.body));
  const hechos = [];

  for (const a of alertas) {
    const issue = abiertos.find((i) => leerMarca(i.body).tipo === a.tipo);
    const cuerpo = `${marca(a.tipo, a.nivel)}\n@${dueño} ${a.cuerpo}`;
    if (!issue) {
      await api('POST', '/issues', { title: a.titulo, body: cuerpo, labels: [ETIQUETA], assignees: [dueño] });
      hechos.push(`abierto: ${a.titulo}`);
    } else if (leerMarca(issue.body).nivel !== 'critico' && a.nivel === 'critico') {
      // Empeora: un comentario nuevo vuelve a notificar.
      await api('PATCH', `/issues/${issue.number}`, { title: a.titulo, body: cuerpo });
      await api('POST', `/issues/${issue.number}/comments`, { body: `@${dueño} **Empeora.** ${a.cuerpo}` });
      hechos.push(`escalado: #${issue.number} ${a.titulo}`);
    } else {
      // Sigue igual: se actualizan las cifras sin notificar (editar no avisa).
      await api('PATCH', `/issues/${issue.number}`, { title: a.titulo, body: `${marca(a.tipo, leerMarca(issue.body).nivel)}\n@${dueño} ${a.cuerpo}` });
      hechos.push(`sigue: #${issue.number}`);
    }
  }

  for (const issue of abiertos) {
    const { tipo } = leerMarca(issue.body);
    if (alertas.some((a) => a.tipo === tipo)) continue;
    // Con el móvil mudo no se sabe cómo va la batería: el aviso de batería
    // sigue abierto (cerrarlo diciendo "resuelto" sería mentir).
    if (tipo === 'bateria' && alertas.some((a) => a.tipo === 'sin-senal')) continue;
    await api('POST', `/issues/${issue.number}/comments`, { body: resuelto(tipo, estado) });
    await api('PATCH', `/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
    hechos.push(`cerrado: #${issue.number}`);
  }
  return hechos;
}

async function principal() {
  const e = process.env;
  const repo = e.REPO || 'jaimeas98/Movil';
  const dueño = e.DUENO || repo.split('/')[0];
  const simular = Boolean(e.SIMULAR);

  const api = async (metodo, ruta, cuerpo) => {
    if (simular && metodo !== 'GET') { console.log(`[simulado] ${metodo} ${ruta}`, cuerpo ? JSON.stringify(cuerpo).slice(0, 300) : ''); return {}; }
    if (simular) return JSON.parse(e.ABIERTOS || '[]');
    const res = await fetch(`https://api.github.com/repos/${repo}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${e.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (!res.ok) throw new Error(`GitHub ${metodo} ${ruta}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? {} : res.json();
  };

  // El informe del móvil, recién leído de la rama (la API no tiene la caché de
  // unos minutos que sí tiene raw.githubusercontent.com).
  let estado = null;
  if (e.ESTADO) estado = JSON.parse(readFileSync(e.ESTADO, 'utf8'));
  else {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/estado.json?ref=estado-movil`, {
      headers: { Authorization: `Bearer ${e.GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw+json' },
    });
    if (res.ok) estado = await res.json();
    else if (res.status !== 404) throw new Error(`no se pudo leer el informe: ${res.status}`);
  }

  const alertas = evaluar(estado, Date.now(), { prueba: e.PRUEBA === 'true' });
  console.log('alertas:', alertas.map((a) => `${a.tipo}/${a.nivel}`).join(', ') || 'ninguna');
  const hechos = await sincronizar(alertas, estado, { api, dueño });
  console.log(hechos.join('\n') || 'nada que cambiar');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { await principal(); } catch (err) { console.error(`❌ ${err.message}`); process.exit(1); }
}
