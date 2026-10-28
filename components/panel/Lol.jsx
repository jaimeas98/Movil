'use client';

// LoL: el visor de LoL Esports en el mismo panel que la cartelera. Es otra
// web (su propio proyecto de Vercel y su repositorio), así que aquí se ve lo
// que ella misma cuenta de sí (lib/panel/lol.js):
//
// · Ahora en LoL: lo que está en directo, lo próximo y lo recién terminado,
//   cada partido con enlace a su ficha en el visor.
// · lolesports.com: si responde a cada consulta o si el visor está tirando
//   de su copia, y de cuándo es esa copia.
// · Tareas: las de GitHub Actions del visor (respaldo, cuerpo técnico,
//   captura), con su última ejecución y un botón para lanzarlas ya.
// · Últimos cambios de su repositorio (cada respaldo es un commit).
//
// Sin LOL_URL o sin token con acceso a su repositorio, cada bloque explica
// qué falta poner en Vercel: no es un fallo, es que aún no está conectado.

import { useState } from 'react';
import Icono from './Icono.jsx';
import { Estado, Fallo, Hora, Seccion, Vacio } from './Piezas.jsx';
import { estadoFuenteLol, valorarLolApi, valorarTareaLol } from './datos.js';
import { lanzarTareaLol } from './api.js';
import { absoluta, duracion } from './tiempo.js';

// Solo se enlaza a https: la dirección sale de LOL_URL, pero el panel no
// pinta como enlace nada que no lo sea.
const esHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);
const enGitHub = (u) => typeof u === 'string' && u.startsWith('https://github.com/');

export const TAREAS = [
  { id: 'respaldo', nombre: 'Respaldo de datos', fichero: 'respaldo.yml', que: 'Copia agenda, ligas y torneos de lolesports.com al repositorio del visor, para cuando el API falle. Sola cada 2 h.', tarda: '~1 min' },
  { id: 'cuerpo-tecnico', nombre: 'Cuerpo técnico', fichero: 'cuerpo-tecnico.yml', que: 'Entrenadores de unos pocos equipos desde Liquipedia. Sola una vez al día; Liquipedia limita, así que a mano como mucho cada 6 h.', tarda: '2–10 min' },
  { id: 'captura', nombre: 'Captura de la API', fichero: 'captura.yml', que: 'Respuestas reales de lolesports.com para las pruebas del visor. Solo a mano.', tarda: '~2 min', confirmar: 'Sube un commit con las capturas nuevas al repositorio del visor.' },
];

const NOMBRE_FUENTE = {
  agenda: 'Agenda', directo: 'Directo', ligas: 'Ligas', listasTorneos: 'Listas de torneos', manifiesto: 'Manifiesto de consultas',
};
const LIGA = { worlds: 'Mundial', msi: 'MSI', first_stand: 'First Stand', lec: 'LEC', lck: 'LCK', lpl: 'LPL', lcs: 'LCS', cblol: 'CBLOL', lcp: 'LCP' };
function nombreFuente(k) {
  if (NOMBRE_FUENTE[k]) return NOMBRE_FUENTE[k];
  const m = /^(torneo|torneos)[:/](.+)$/.exec(k);
  return m ? `Torneo · ${LIGA[m[2]] ?? m[2].toUpperCase()}` : k;
}
const SIRVIO = { directo: 'del API', memoria: 'copia en memoria', respaldo: 'respaldo del repositorio' };
const TEXTO_FUENTE = { bien: 'Bien', aviso: 'Con fallos', fallo: 'Falla', nada: 'Sin datos' };

const CONCLUSION = {
  success: { nivel: 'bien', texto: 'Bien' },
  failure: { nivel: 'fallo', texto: 'Falló' },
  timed_out: { nivel: 'fallo', texto: 'Se pasó de tiempo' },
  cancelled: { nivel: 'nada', texto: 'Cancelada' },
  skipped: { nivel: 'nada', texto: 'Saltada' },
  startup_failure: { nivel: 'fallo', texto: 'No arrancó' },
};
const EVENTO = { schedule: 'por calendario', workflow_dispatch: 'a mano', push: 'por un cambio' };
function estadoEjecucion(x) {
  if (!x) return { nivel: 'nada', texto: 'Sin ejecuciones' };
  if (x.estado !== 'completed') return { nivel: 'espera', texto: x.estado === 'queued' ? 'En cola' : 'En marcha' };
  return CONCLUSION[x.conclusion] ?? { nivel: 'nada', texto: x.conclusion || '—' };
}

// ── Ahora en LoL ──────────────────────────────────────────────────────────
function Partido({ p, url, ahora }) {
  const [a, b] = p.equipos;
  const marcador = p.estado !== 'programado' && a?.victorias != null && b?.victorias != null;
  const cuando = p.estado === 'directo'
    ? <span className="pn-lol-vivo">En directo</span>
    : p.estado === 'programado'
      ? <span>{absoluta(p.inicio, ahora)}</span>
      : <span className="pn-apagada">Terminado</span>;
  const cuerpo = (
    <>
      <span className="pn-lol-cuando">{cuando}</span>
      <span className="pn-lol-cruce">
        <span className="pn-lol-equipo" data-gana={a?.resultado === 'gana' || undefined} title={a?.nombre ?? undefined}>{a?.codigo ?? '?'}</span>
        <span className="pn-lol-marcador">{marcador ? `${a.victorias}–${b.victorias}` : 'vs'}</span>
        <span className="pn-lol-equipo" data-gana={b?.resultado === 'gana' || undefined} title={b?.nombre ?? undefined}>{b?.codigo ?? '?'}</span>
      </span>
      <span className="pn-lol-liga">{[p.liga, p.mejorDe ? `Bo${p.mejorDe}` : null].filter(Boolean).join(' · ')}</span>
    </>
  );
  // La ficha del partido en el visor: /?partido=<id> (la abre aunque no
  // esté en la agenda que tiene cargada).
  if (esHttps(url) && p.id) {
    return (
      <li>
        <a className="pn-lol-partido" data-estado={p.estado} href={`${url}/?partido=${encodeURIComponent(p.id)}`} target="_blank" rel="noreferrer noopener">
          {cuerpo}
          <Icono nombre="externo" className="pn-ico pn-lol-ir" />
        </a>
      </li>
    );
  }
  return <li><div className="pn-lol-partido" data-estado={p.estado}>{cuerpo}</div></li>;
}

function Grupo({ titulo, partidos, url, ahora }) {
  if (!partidos.length) return null;
  return (
    <div className="pn-lol-grupo">
      <h3 className="pn-lol-grupo-t">{titulo}</h3>
      <ul className="pn-lol-partidos">
        {partidos.map((p, i) => <Partido key={p.id ?? i} p={p} url={url} ahora={ahora} />)}
      </ul>
    </div>
  );
}

function AhoraEnLol({ lol, ahora }) {
  const web = lol.web;
  const ag = web.agenda;
  const abrir = esHttps(web.url) && (
    <a className="pn-boton" href={web.url} target="_blank" rel="noreferrer noopener">
      Abrir el visor<Icono nombre="externo" className="pn-ico-peq pn-ico-tras" />
    </a>
  );
  let cuerpo;
  if (!lol.configurado.web) {
    cuerpo = (
      <Vacio titulo="El visor aún no está conectado al panel">
        Pon en Vercel (proyecto de la cartelera, Settings → Environment Variables) la variable <code>LOL_URL</code> con la
        dirección del visor, p. ej. <code>https://…vercel.app</code>, y redespliega.{web.error ? ` Ahora mismo: ${web.error}` : ''}
      </Vacio>
    );
  } else if (!web.responde) {
    cuerpo = <Fallo titulo="La web del visor no responde" error={{ message: web.error || 'Sin respuesta.' }} />;
  } else if (!ag) {
    cuerpo = <Fallo titulo="No se ha podido leer la agenda del visor" error={{ message: web.error || 'Sin respuesta.' }} />;
  } else if (!ag.directo.length && !ag.proximos.length && !ag.terminados.length) {
    cuerpo = <Vacio titulo="Nada hoy">Ni en directo, ni en las próximas 24 h, ni terminado en las últimas 18 h.</Vacio>;
  } else {
    cuerpo = (
      <div className="pn-lol-agenda">
        <Grupo titulo="En directo" partidos={ag.directo} url={web.url} ahora={ahora} />
        <Grupo titulo="Próximos" partidos={ag.proximos} url={web.url} ahora={ahora} />
        <Grupo titulo="Terminados" partidos={ag.terminados} url={web.url} ahora={ahora} />
      </div>
    );
  }
  const nota = ag
    ? <>Agenda {ag.fuente === 'directo' || !ag.fuente ? 'de lolesports.com' : ag.fuente === 'memoria' ? 'de la copia en memoria del visor' : 'del respaldo del visor'}{ag.edadMs != null ? `, de hace ${duracion(ag.edadMs, { segundos: false })}` : ''}. Cada partido abre su ficha en el visor.</>
    : null;
  return (
    <Seccion id="l-ahora" titulo="Ahora en LoL" acciones={abrir} nota={nota}>
      {cuerpo}
    </Seccion>
  );
}

// ── lolesports.com ────────────────────────────────────────────────────────
function Fuentes({ lol, ahora }) {
  const web = lol.web;
  if (!web.responde || !web.generado) return null;
  const v = valorarLolApi(lol, ahora);
  const r = web.respaldo;
  const copias = r ? [
    ['Agenda', r.agenda],
    ['Ligas', r.ligas],
    ...r.torneos.map((t) => [`${LIGA[t.slug] ?? t.slug.toUpperCase()}${t.torneo ? ` · ${t.torneo}` : ''}`, t]),
  ] : [];
  return (
    <Seccion
      id="l-api"
      titulo="lolesports.com"
      nota={<>Lo que cuenta la instancia del visor que ha contestado; cada instancia lleva su propia cuenta y tras un despliegue empieza de cero. Leído <Hora t={web.generado} ahora={ahora} />.</>}
    >
      <div className="pn-token" data-nivel={v.nivel}>
        <Estado nivel={v.nivel} compacto />
        <p><strong>{v.valor}.</strong>{v.detalle ? <span className="pn-apagada"> {v.detalle}</span> : null}</p>
      </div>
      {web.fuentes.length > 0 && (
        <ul className="pn-lol-fuentes">
          {web.fuentes.map((f) => {
            const n = estadoFuenteLol(f);
            return (
              <li key={f.clave} className="pn-lol-fuente" data-nivel={n}>
                <span className="pn-lol-fuente-n">{nombreFuente(f.clave)}</span>
                <Estado nivel={n} texto={TEXTO_FUENTE[n]} />
                <span className="pn-lol-fuente-d">
                  {f.ultimaOk ? <>Buena <Hora t={f.ultimaOk} ahora={ahora} solo="relativa" /></> : 'Ninguna buena desde que arrancó'}
                  {f.ultimaFuente && f.ultimaFuente !== 'directo' ? ` · sirvió ${SIRVIO[f.ultimaFuente] ?? f.ultimaFuente}` : ''}
                  {f.ultimoError && n !== 'bien' ? <span className="pn-texto-fallo pn-celda-sub">{f.ultimoError}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {copias.length > 0 && (
        <>
          <h3 className="pn-lol-grupo-t pn-lol-sub">Respaldo del repositorio del visor</h3>
          <dl className="pn-datos">
            {copias.map(([n, c]) => (
              <div className="pn-dato" key={n}>
                <dt>{n}</dt>
                <dd>{c?.t ? <Hora t={c.t} ahora={ahora} /> : 'Sin copia'}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {web.consultas && (
        <p className="pn-pequeno pn-apagada pn-lol-consultas">
          Ids de las consultas del API: {web.consultas.origen === 'codigo' ? 'los del código' : web.consultas.origen ?? '—'}
          {web.consultas.redescubierto ? <> · redescubiertos <Hora t={web.consultas.redescubierto} ahora={ahora} solo="relativa" /></> : null}
          {web.consultas.error ? ` · último error: ${web.consultas.error}` : ''}.
        </p>
      )}
    </Seccion>
  );
}

// ── Tareas de GitHub Actions ──────────────────────────────────────────────
function Tarea({ t, runs, repoUrl, ahora, sinAcceso, lanzar, enviando, error, hecho }) {
  const [confirmando, setConfirmando] = useState(false);
  const ult = runs?.[0];
  const e = estadoEjecucion(ult);
  const viva = ult && ult.estado !== 'completed';
  const ocupado = enviando === t.id;
  async function pedir() { setConfirmando(false); await lanzar(t.id); }
  return (
    <li className="pn-accion pn-lol-tarea" data-confirmando={confirmando || undefined}>
      <div className="pn-accion-txt">
        <p className="pn-accion-nombre">{t.nombre} <span className="pn-accion-tarda">{t.tarda}</span></p>
        <p className="pn-accion-que">{t.que}</p>
        {runs && (
          <p className="pn-lol-ultima">
            <Estado nivel={e.nivel} texto={e.texto} />
            {ult && <span className="pn-apagada"><Hora t={ult.creada} ahora={ahora} />{EVENTO[ult.evento] ? ` · ${EVENTO[ult.evento]}` : ''}</span>}
            {runs.length > 1 && (
              <span className="pn-lol-tira" aria-label={`Las ${runs.length} últimas: ${runs.map((x) => estadoEjecucion(x).texto).join(', ')}`}>
                {runs.map((x, i) => <span key={x.id ?? i} data-nivel={estadoEjecucion(x).nivel} />)}
              </span>
            )}
            {enGitHub(ult?.url) && <a className="pn-enlace pn-lol-ver" href={ult.url} target="_blank" rel="noreferrer noopener">Ver<Icono nombre="externo" className="pn-ico-peq pn-ico-tras" /></a>}
          </p>
        )}
        {confirmando && <p className="pn-accion-aviso" id={`lconf-${t.id}`}><Icono nombre="aviso" className="pn-ico-peq" />{t.confirmar}</p>}
        {hecho && !error && <p className="pn-accion-hecho" role="status">Lanzada. En unos segundos aparece aquí en marcha.</p>}
        {error && <p className="pn-accion-error" role="alert">{error.message}</p>}
      </div>
      <div className="pn-accion-botones">
        {confirmando ? (
          <>
            <button type="button" className="pn-boton pn-boton-fuerte" onClick={pedir} aria-describedby={`lconf-${t.id}`} autoFocus>Sí, lanzar</button>
            <button type="button" className="pn-boton" onClick={() => setConfirmando(false)}>Cancelar</button>
          </>
        ) : (
          <button
            type="button"
            className="pn-boton"
            disabled={sinAcceso || Boolean(enviando) || viva}
            onClick={() => (t.confirmar ? setConfirmando(true) : pedir())}
            title={sinAcceso ? 'Sin acceso al repositorio del visor' : viva ? 'Ya está en marcha' : undefined}
          >
            {ocupado ? 'Lanzando…' : 'Lanzar'}
            <span className="sr"> {t.nombre}</span>
          </button>
        )}
        {repoUrl && <a className="pn-enlace pn-lol-todas" href={`${repoUrl}/actions/workflows/${t.fichero}`} target="_blank" rel="noreferrer noopener">Todas<span className="sr"> las ejecuciones de {t.nombre}</span></a>}
      </div>
    </li>
  );
}

function Tareas({ lol, ahora, refrescar }) {
  const [enviando, setEnviando] = useState(null);
  const [errores, setErrores] = useState({});
  const [hechos, setHechos] = useState({});
  const repo = lol.repo;
  const repoUrl = enGitHub(repo?.url) ? repo.url : null;
  const sinAcceso = !lol.configurado.github || Boolean(repo?.error && !Object.values(repo.tareas ?? {}).some(Boolean));

  async function lanzar(id) {
    setEnviando(id);
    setErrores((x) => ({ ...x, [id]: null }));
    try {
      await lanzarTareaLol(id);
      setHechos((x) => ({ ...x, [id]: true }));
      // GitHub tarda unos segundos en dar de alta la ejecución.
      setTimeout(refrescar, 6000);
      setTimeout(() => setHechos((x) => ({ ...x, [id]: false })), 20000);
    } catch (e) {
      setErrores((x) => ({ ...x, [id]: e }));
    } finally {
      setEnviando(null);
    }
  }

  let nota;
  if (!lol.configurado.github) {
    nota = 'Sin token no se ven ni se lanzan: pon en Vercel LOL_GITHUB_TOKEN (fine-grained, solo el repositorio del visor, con «Contents: Read» y «Actions: Read and write») y redespliega.';
  } else {
    nota = `Tareas de GitHub Actions de ${repo?.nombre ?? 'el repositorio del visor'}. Cada una sube su resultado al repositorio y el visor se vuelve a publicar solo.`;
  }
  const respaldo = valorarTareaLol(lol, 'respaldo', ahora);
  return (
    <Seccion id="l-tareas" titulo="Tareas del visor" nota={nota}>
      {lol.configurado.github && repo?.error && <Fallo titulo="No se ha podido leer todo del repositorio del visor" error={{ message: repo.error }} />}
      {respaldo.nivel === 'fallo' && <Fallo titulo={`${respaldo.titulo}: ${respaldo.valor}`} error={{ message: respaldo.detalle }} />}
      <ul className="pn-acciones">
        {TAREAS.map((t) => (
          <Tarea
            key={t.id}
            t={t}
            runs={repo?.tareas?.[t.id] ?? null}
            repoUrl={repoUrl}
            ahora={ahora}
            sinAcceso={sinAcceso}
            lanzar={lanzar}
            enviando={enviando}
            error={errores[t.id]}
            hecho={hechos[t.id]}
          />
        ))}
      </ul>
    </Seccion>
  );
}

function Cambios({ lol, ahora }) {
  const c = lol.repo?.cambios;
  if (!c?.length) return null;
  const repoUrl = enGitHub(lol.repo.url) ? lol.repo.url : null;
  return (
    <Seccion
      id="l-cambios"
      titulo="Últimos cambios del visor"
      acciones={repoUrl && <a className="pn-boton" href={`${repoUrl}/commits`} target="_blank" rel="noreferrer noopener">Todos<Icono nombre="externo" className="pn-ico-peq pn-ico-tras" /></a>}
    >
      <ul className="pn-lol-cambios">
        {c.map((x, i) => (
          <li key={x.sha ?? i}>
            {enGitHub(x.url)
              ? <a href={x.url} target="_blank" rel="noreferrer noopener" className="pn-lol-cambio"><span className="pn-lol-cambio-m">{x.mensaje}</span><Hora t={x.t} ahora={ahora} className="pn-apagada pn-pequeno" /></a>
              : <span className="pn-lol-cambio"><span className="pn-lol-cambio-m">{x.mensaje}</span><Hora t={x.t} ahora={ahora} className="pn-apagada pn-pequeno" /></span>}
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

export default function Lol({ datos, ahora, refrescar }) {
  const lol = datos.lol;
  if (!lol) {
    return <Fallo titulo="Sin datos del visor de LoL" error={{ message: 'La parte del visor no ha llegado en la respuesta del servidor.' }} alReintentar={refrescar} />;
  }
  if (lol.error) {
    return <Fallo titulo="El servidor no ha podido leer el visor de LoL" error={{ message: lol.error }} alReintentar={refrescar} />;
  }
  return (
    <div className="pn-pila">
      <AhoraEnLol lol={lol} ahora={ahora} />
      <Fuentes lol={lol} ahora={ahora} />
      <Tareas lol={lol} ahora={ahora} refrescar={refrescar} />
      <Cambios lol={lol} ahora={ahora} />
    </div>
  );
}
