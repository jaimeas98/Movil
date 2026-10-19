'use client';

// Cines: cómo ve el servidor a cada cine ahora mismo (lo mismo que sirve a la
// cartelera), y dos herramientas: volver a pedirlos saltándose la caché, y
// comprobar si los enlaces de compra responden.

import { useState } from 'react';
import { comprobarEnlaces, refrescarServidor } from './api.js';
import { normalizar, ordenCines, nombreCine, textoOrigen, valorarCine } from './datos.js';
import { Estado, Fallo, Hora, PuntoCine, Seccion, Vacio, cifra } from './Piezas.jsx';
import { duracion } from './tiempo.js';

// Solo se pinta como enlace un https: lo que se enseña aquí puede venir de la
// web de un cine, y un `javascript:` en esta página correría con la sesión
// del panel.
const esHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);

const FUENTE = { live: 'Al día', stale: 'Datos guardados', error: 'Sin datos', sample: 'Ejemplo', nada: 'Sin datos' };

// Con mes: la cartelera llega a cubrir hasta dos meses (Yelmo publica
// preventas), y "lun 19–mar 23" se leía como cuatro días cuando eran 32.
const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dia = (iso) => (iso ? fmtDia.format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, '').replace(',', '') : null);

function ResultadoEnlaces({ r }) {
  if (!r) return null;
  const malas = r.pruebas.filter((p) => p.ok === false);
  const nivel = r.probadas === 0 ? 'nada' : r.buenas === r.probadas ? 'bien' : r.buenas === 0 && r.dudosas === 0 ? 'fallo' : 'aviso';
  return (
    <div className="pn-enlaces-res" data-nivel={nivel}>
      <p className="pn-enlaces-res-cab">
        <Estado nivel={nivel} compacto />
        {r.probadas === 0
          ? 'No había sesiones que probar.'
          : <><strong>{r.buenas} de {r.probadas}</strong>&nbsp;enlaces responden bien{r.dudosas ? `; ${r.dudosas} no se pueden comprobar desde el servidor` : ''}.</>}
      </p>
      {malas.length > 0 && (
        <ul className="pn-pruebas">
          {malas.slice(0, 3).map((p) => (
            <li key={p.clave || p.url}>
              <span className="pn-prueba-que">{p.pelicula} · {p.hora}</span>
              <span className="pn-texto-fallo">{p.motivo || (p.estado ? `HTTP ${p.estado}` : 'no responde')}</span>
              {esHttps(p.url) ? <a className="pn-url" href={p.url} target="_blank" rel="noreferrer noopener">{p.url}</a> : p.url && <span className="pn-url">{p.url}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cine({ c, ahora, enlaces }) {
  const v = valorarCine(c, ahora);
  const hoy = c.hoy;
  return (
    <article className="pn-cine" data-nivel={v.nivel} data-cine={c.id} aria-labelledby={`c-${c.id}`}>
      <header className="pn-cine-cab">
        <h3 id={`c-${c.id}`} className="pn-cine-nombre"><PuntoCine id={c.id} />{c.nombre}</h3>
        <Estado nivel={v.nivel} texto={FUENTE[c.fuente] || c.fuente} />
      </header>
      {v.nivel !== 'bien' && <p className="pn-cine-valor">{v.valor}</p>}
      {c.motivo && <p className={`pn-cine-motivo${c.fuente === 'error' ? ' pn-texto-fallo' : ''}`}>{c.motivo}</p>}
      <dl className="pn-datos pn-datos-cine">
        <div className="pn-dato"><dt>Datos de</dt><dd>{c.datosDe ? <Hora t={c.datosDe} ahora={ahora} /> : '—'}</dd></div>
        <div className="pn-dato"><dt>Origen</dt><dd>{textoOrigen(c.origen) || '—'}</dd></div>
        <div className="pn-dato">
          <dt>Cartelera</dt>
          <dd>
            {c.peliculas != null ? `${cifra(c.peliculas)} películas, ${cifra(c.sesiones)} sesiones` : '—'}
            {c.dias ? (
              <span className="pn-celda-sub">
                {c.dias === 1 ? '1 día' : `${c.dias} días`}{c.primerDia && `: ${dia(c.primerDia)}–${dia(c.ultimoDia)}`}
                {c.diasCompletados ? ` (${c.diasCompletados} de la copia)` : ''}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="pn-dato"><dt>Hoy</dt><dd>{hoy ? `${cifra(hoy.peliculas)} películas, ${cifra(hoy.sesiones)} sesiones` : '—'}</dd></div>
        <div className="pn-dato"><dt>Enlaces de compra</dt><dd>{c.plantilla === 'propia' ? 'Plantilla propia' : 'Formato original'}</dd></div>
      </dl>
      {enlaces && <ResultadoEnlaces r={enlaces} />}
    </article>
  );
}

export default function Cines({ datos, ahora, parchear }) {
  const s = datos.servidor;
  const [pidiendo, setPidiendo] = useState(false);
  const [errPedir, setErrPedir] = useState(null);
  const [comprobando, setComprobando] = useState(false);
  const [comprobacion, setComprobacion] = useState(null);
  const [errComprobar, setErrComprobar] = useState(null);

  async function pedirAhora() {
    setPidiendo(true); setErrPedir(null);
    try {
      const r = await refrescarServidor();
      const nuevo = normalizar({ servidor: r }, Date.now()).servidor;
      parchear((d) => ({ ...d, servidor: nuevo }));
    } catch (e) { setErrPedir(e); }
    finally { setPidiendo(false); }
  }
  async function comprobar() {
    setComprobando(true); setErrComprobar(null);
    try {
      const r = await comprobarEnlaces();
      setComprobacion({ t: r?.comprobadoEn ? Date.parse(r.comprobadoEn) : Date.now(), cines: Object.fromEntries((r?.cines ?? []).map((c) => [c.id, { probadas: c.probadas ?? 0, buenas: c.buenas ?? 0, dudosas: c.dudosas ?? 0, pruebas: c.pruebas ?? [] }])) });
    } catch (e) { setErrComprobar(e); }
    finally { setComprobando(false); }
  }

  const botones = (
    <>
      <button type="button" className="pn-boton" onClick={pedirAhora} disabled={pidiendo} aria-describedby="cines-pedir-ayuda">
        {pidiendo ? 'Pidiendo a los 4 cines…' : 'Volver a pedir ahora'}
      </button>
      <button type="button" className="pn-boton" onClick={comprobar} disabled={comprobando}>
        {comprobando ? 'Probando enlaces…' : 'Comprobar enlaces de compra'}
      </button>
    </>
  );

  return (
    <div className="pn-pila">
      <Seccion
        id="c-lista"
        titulo="Lo que sirve la web"
        acciones={botones}
        nota={<span id="cines-pedir-ayuda">"Volver a pedir" se salta la caché de 5 min y tarda 10–40 s. La comprobación prueba 3 sesiones de hoy por cine.</span>}
      >
        {errPedir && <Fallo titulo="No se han podido volver a pedir" error={errPedir} alReintentar={pedirAhora} reintentando={pidiendo} />}
        {errComprobar && <Fallo titulo="No se han podido comprobar los enlaces" error={errComprobar} alReintentar={comprobar} reintentando={comprobando} />}
        {comprobacion && <p className="pn-apagada pn-pequeno">Enlaces comprobados <Hora t={comprobacion.t} ahora={ahora} />.</p>}
        {!s ? (
          <Fallo titulo="Sin datos del servidor" error={{ message: 'La parte del servidor no ha llegado en la respuesta.' }} />
        ) : (
          <>
            {s.error && <Fallo titulo="El servidor ha tenido problemas" error={{ message: s.error }} />}
            {s.cines.length === 0 ? (
              !s.error && <Vacio titulo="El servidor no ha mandado ningún cine" />
            ) : (
              <div className={`pn-cines${pidiendo ? ' es-recargando' : ''}`}>
                {ordenCines.map((id) => {
                  const c = s.cines.find((x) => x.id === id);
                  if (!c) {
                    return (
                      <article key={id} className="pn-cine" data-nivel="nada">
                        <header className="pn-cine-cab"><h3 className="pn-cine-nombre"><PuntoCine id={id} />{nombreCine(id)}</h3><Estado nivel="nada" /></header>
                        <p className="pn-cine-valor">El servidor no lo ha mandado.</p>
                      </article>
                    );
                  }
                  return <Cine key={id} c={c} ahora={ahora} enlaces={comprobacion?.cines[id]} />;
                })}
              </div>
            )}
          </>
        )}
      </Seccion>

      {s && (
        <Seccion id="c-fuentes" titulo="Fuentes y claves">
          <dl className="pn-datos">
            <div className="pn-dato">
              <dt>Instantánea de Yelmo</dt>
              <dd>
                {s.instantaneaYelmo?.t ? <Hora t={s.instantaneaYelmo.t} ahora={ahora} /> : 'No hay'}
                {s.instantaneaYelmo?.cines?.length > 0 && <span className="pn-celda-sub">{s.instantaneaYelmo.cines.map((c) => `${nombreCine(c.id)}: ${c.dias} días`).join(' · ')}</span>}
              </dd>
            </div>
            <div className="pn-dato">
              <dt>Copia de respaldo</dt>
              <dd>
                {s.respaldo?.t ? <Hora t={s.respaldo.t} ahora={ahora} /> : 'No hay'}
                {s.respaldo?.cines?.length > 0 && <span className="pn-celda-sub">{s.respaldo.cines.map((c) => `${nombreCine(c.id)}: ${c.dias} días`).join(' · ')}</span>}
              </dd>
            </div>
            <div className="pn-dato">
              <dt>Caché del servidor</dt>
              <dd>{s.cacheMs != null ? `pedida hace ${duracion(s.cacheMs, { segundos: true })}` : '—'}</dd>
            </div>
            <div className="pn-dato">
              <dt>Claves</dt>
              <dd className="pn-claves">
                {['tmdb', 'omdb', 'github'].map((k) => {
                  const si = s.claves?.[k];
                  return (
                    <span key={k} className="pn-clave-si" data-si={si === true ? 'si' : si === false ? 'no' : 'nada'}>
                      <Estado nivel={si === true ? 'bien' : si === false ? 'aviso' : 'nada'} compacto />
                      {k === 'github' ? 'GitHub' : k.toUpperCase()}: {si === true ? 'sí' : si === false ? 'no' : '—'}
                    </span>
                  );
                })}
              </dd>
            </div>
          </dl>
        </Seccion>
      )}
    </div>
  );
}
