'use client';

// La cabina: una pantalla que contesta "¿está todo bien?" y, si no, qué.
//
// Arriba, el veredicto y, solo si hay algo, la lista de lo que falla, cada
// cosa con su enlace a la sección donde se arregla. Debajo, a todo el ancho,
// la línea de las últimas 24 h (components/panel/LineaDelDia.jsx), que es la
// pieza que no hay en ningún otro sitio: señal, recogidas y batería en el
// mismo eje. Luego el tablero de los cuatro cines y la fiabilidad de 7 días;
// al lado, el móvil, el token de GitHub y los accesos.
//
// Lo que está bien no se enciende: tinta tranquila. Solo lo que falla lleva
// color, para que el ojo vaya derecho.

import { useMemo, useState } from 'react';
import Icono from './Icono.jsx';
import { Estado, Hora, PuntoCine, cifra } from './Piezas.jsx';
import { fallosPorCine, ordenCines, nombreCine, textoEstado, veredicto } from './datos.js';
import LineaDelDia from './LineaDelDia.jsx';
import Fiabilidad from './Fiabilidad.jsx';

const ORIGEN_CORTO = { directo: 'de su web', movil: 'del móvil', copia: 'copia del móvil', memoria: 'guardados', ejemplo: 'de ejemplo' };
const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
// La edad de los datos en una columna estrecha: "ahora", "hace 40 min",
// "hace 10 h", "hace 3 días".
function edadCorta(ms) {
  if (ms == null) return '—';
  if (ms < 90e3) return 'ahora';
  if (ms < 60 * 60e3) return `hace ${Math.round(ms / 60e3)} min`;
  if (ms < 48 * 3600e3) return `hace ${Math.round(ms / 3600e3)} h`;
  return `hace ${Math.round(ms / 864e5)} días`;
}
const dia = (iso) => (iso ? fmtDia.format(new Date(`${iso}T12:00:00Z`)).replace(/\./g, '').replace(',', '') : null);

// Lo que se arregla en otra sección lleva a ella; lo de la propia cabina (el
// token) baja a su bloque.
function irA(v, ir) {
  if (v.seccion !== 'resumen') { ir(v.seccion); return; }
  const destino = document.getElementById(v.id === 'token' ? 'c-gh' : 'c-linea');
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  destino?.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' });
}

function Veredicto({ val, ir }) {
  const ver = veredicto(val);
  const mal = val.todas.filter((v) => v.nivel === 'fallo' || v.nivel === 'aviso')
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'fallo' ? -1 : 1));
  return (
    <div className="pn-veredicto" data-nivel={ver.nivel}>
      {/* Solo el veredicto es región viva: la lista lleva horas relativas
          que cambian cada minuto y se volvería a leer entera. */}
      <p className="pn-veredicto-linea" role="status">
        <Icono nombre={ver.nivel} className="pn-veredicto-ico" />
        <span className="pn-veredicto-txt">{ver.texto}</span>
        {ver.sub && <span className="pn-veredicto-sub">{ver.sub}</span>}
      </p>
      {mal.length > 0 && (
        <ul className="pn-veredicto-lista">
          {mal.map((v) => (
            <li key={v.id}>
              <button type="button" className="pn-pendiente pulsable" data-nivel={v.nivel} onClick={() => irA(v, ir)}>
                <Estado nivel={v.nivel} compacto />
                <span className="pn-pendiente-txt">
                  <strong>{v.cine && <PuntoCine id={v.cine} />}{v.titulo}</strong>
                  <span>{v.valor}{v.detalle ? `. ${v.detalle}` : ''}</span>
                </span>
                <Icono nombre="ir" className="pn-ico pn-pendiente-ir" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// El tablero de los cines: una fila por cine, con las columnas alineadas
// para comparar de arriba abajo (¿cuál tiene datos viejos? ¿cuál tiene pocas
// sesiones hoy?). Toda la fila lleva a Cines.
function TableroCines({ datos, val, ahora, ir }) {
  const fallos = useMemo(() => fallosPorCine(datos.movil, ahora), [datos.movil, ahora]);
  const cines = datos.servidor?.cines ?? [];
  return (
    <ul className="pn-tablero" aria-label="Cines">
      {ordenCines.map((id) => {
        const c = cines.find((x) => x.id === id);
        const v = val.cines.find((x) => x.cine === id) ?? val.cines[0];
        const edad = c ? (c.edadMs ?? (c.datosDe != null ? ahora - c.datosDe : null)) : null;
        const f = fallos[id];
        return (
          <li key={id}>
            <button type="button" className="pn-tablero-fila pulsable" data-nivel={v?.nivel ?? 'nada'} onClick={() => ir('cines')}>
              <span className="pn-tablero-cine"><PuntoCine id={id} />{nombreCine(id)}</span>
              <span className="pn-tablero-dato">
                <span className="pn-tablero-cifra">{c?.hoy?.sesiones != null ? cifra(c.hoy.sesiones) : '—'}</span>
                <span className="pn-tablero-etq">sesiones hoy</span>
              </span>
              <span className="pn-tablero-dato">
                <span className="pn-tablero-cifra">{c?.peliculas != null ? cifra(c.peliculas) : '—'}</span>
                <span className="pn-tablero-etq">{c?.ultimoDia ? `pelis, hasta ${dia(c.ultimoDia)}` : 'películas'}</span>
              </span>
              <span className="pn-tablero-dato pn-tablero-fresco">
                <span>{edadCorta(edad)}</span>
                <span className="pn-tablero-etq">{ORIGEN_CORTO[c?.origen] ?? (c ? c.fuente : 'sin datos')}</span>
              </span>
              <span className="pn-tablero-estado">
                <Estado nivel={v?.nivel ?? 'nada'} texto={v?.nivel === 'bien' ? 'Al día' : v?.valor} />
                {f.mal > 0 && <span className="pn-texto-fallo pn-tablero-recog">{f.mal} recogida{f.mal === 1 ? '' : 's'} mal en 7 días</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Movil({ datos, val, ahora, ir }) {
  const m = datos.movil;
  const b = m?.bateria;
  const lat = val.movil[0];
  return (
    <dl className="pn-ficha">
      <div><dt>Último informe</dt><dd data-nivel={lat.nivel}>{m?.latido ? <Hora t={m.latido} ahora={ahora} /> : '—'}</dd></div>
      <div>
        <dt>Batería</dt>
        <dd data-nivel={val.movil[1].nivel}>
          {b?.pct != null ? <><span className="pn-ficha-cifra">{Math.round(b.pct)} %</span>{b.cargando ? <span className="pn-apagada"> · cargando<Icono nombre="rayo" className="pn-ico-peq pn-ico-tras" /></span> : <span className="pn-apagada"> · sin cargar</span>}</> : '—'}
        </dd>
      </div>
      <div><dt>Última recogida</dt><dd data-nivel={val.movil[2].nivel}><Hora t={m?.ultimaRecogida ?? m?.recogidas?.[0]?.t} ahora={ahora} /></dd></div>
      <div><dt>Próxima</dt><dd><Hora t={m?.proximaRecogida} ahora={ahora} /></dd></div>
      <div><dt>Código</dt><dd>{m?.informe?.codigo ? <span className="pn-mono">{m.informe.codigo}</span> : '—'}</dd></div>
      <div className="pn-ficha-pie"><button type="button" className="pn-enlace" onClick={() => ir('movil')}>Todo lo del móvil<Icono nombre="ir" className="pn-ico-peq pn-ico-tras" /></button></div>
    </dl>
  );
}

// Los sitios a los que se va desde el panel. Todos de GitHub o de la propia
// web: nada de servicios con cuenta aparte.
function Accesos({ datos }) {
  const repo = datos.github.repo || 'jaimeas98/Movil';
  const rama = datos.github.ramaApp || 'claude/puerto-santa-maria-restaurants-NxChu';
  const gh = `https://github.com/${repo}`;
  const lista = [
    { texto: 'La cartelera', que: 'la web tal como la ve todo el mundo', url: '/' },
    { texto: 'Avisos en GitHub', que: 'los issues del vigilante, abiertos y cerrados', url: `${gh}/issues?q=label%3Aalerta-movil` },
    { texto: 'Ejecuciones del vigilante', que: 'cada revisión, con su registro', url: `${gh}/actions/workflows/vigilante-movil.yml` },
    { texto: 'Informe del móvil', que: 'la rama estado-movil, fichero a fichero', url: `${gh}/tree/estado-movil` },
    { texto: 'Cambios publicados', que: 'lo último que se ha subido a la web', url: `${gh}/commits/${rama.split('/').map(encodeURIComponent).join('/')}` },
  ];
  return (
    <ul className="pn-accesos">
      {lista.map((a) => (
        <li key={a.url}>
          <a className="pn-acceso" href={a.url} target="_blank" rel="noreferrer noopener">
            <span className="pn-acceso-txt"><strong>{a.texto}</strong><span>{a.que}</span></span>
            <Icono nombre="externo" className="pn-ico pn-acceso-ico" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function CopiarEstado({ datos, val, ahora }) {
  const [hecho, setHecho] = useState(null);   // null | 'si' | 'no'
  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoEstado(datos, val, Date.now()));
      setHecho('si');
    } catch {
      setHecho('no');
    }
    setTimeout(() => setHecho(null), 4000);
  }
  return (
    <div className="pn-copiar">
      <button type="button" className="pn-boton" onClick={copiar}>
        <Icono nombre="copiar" className="pn-ico-peq" />
        {hecho === 'si' ? 'Copiado' : 'Copiar el estado'}
      </button>
      <p className="pn-pequeno pn-apagada" aria-live="polite">
        {hecho === 'no' ? 'El navegador no deja copiar aquí; prueba desde otro.' : 'Un resumen en texto de todo esto, para pegárselo a Claude si algo falla.'}
      </p>
    </div>
  );
}

export default function Resumen({ datos, val, ahora, ir }) {
  const pendientes = datos.movil?.ordenes.pendientes ?? [];
  const token = val.token;
  return (
    <div className="pn-cabina">
      <Veredicto val={val} ir={ir} />

      <section className="pn-cabina-linea" aria-labelledby="c-linea">
        <h2 id="c-linea" className="pn-bloque-titulo">Últimas 24 horas</h2>
        <LineaDelDia movil={datos.movil} ahora={ahora} />
      </section>

      <div className="pn-cabina-rejilla">
        <div className="pn-cabina-principal">
          <section aria-labelledby="c-cines">
            <h2 id="c-cines" className="pn-bloque-titulo">Cines en la web</h2>
            <TableroCines datos={datos} val={val} ahora={ahora} ir={ir} />
          </section>
          <section aria-labelledby="c-fia">
            <h2 id="c-fia" className="pn-bloque-titulo">Fiabilidad, 7 días</h2>
            <Fiabilidad movil={datos.movil} ahora={ahora} />
          </section>
        </div>

        <aside className="pn-cabina-lado" aria-label="El móvil y las herramientas">
          <section aria-labelledby="c-movil">
            <h2 id="c-movil" className="pn-bloque-titulo">Móvil</h2>
            <Movil datos={datos} val={val} ahora={ahora} ir={ir} />
          </section>

          {pendientes.length > 0 && (
            <section aria-labelledby="c-ordenes">
              <h2 id="c-ordenes" className="pn-bloque-titulo">Órdenes en camino</h2>
              <ul className="pn-mini-lista">
                {pendientes.map((o) => (
                  <li key={o.id}>
                    <button type="button" className="pn-enlace-fila" onClick={() => ir('acciones')}>
                      <Icono nombre="espera" className="pn-ico pn-ico-tenue" />
                      <span className="pn-mono">{o.accion}</span>
                      <span className="pn-apagada">pedida <Hora t={o.pedida} ahora={ahora} solo="relativa" /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="c-gh">
            <h2 id="c-gh" className="pn-bloque-titulo">GitHub</h2>
            <div className="pn-token" data-nivel={token.nivel}>
              <Estado nivel={token.nivel} compacto />
              <p><strong>{token.titulo}:</strong> {token.valor}{token.detalle ? <span className="pn-apagada"> {token.detalle}</span> : null}</p>
            </div>
            <Accesos datos={datos} />
            <CopiarEstado datos={datos} val={val} ahora={ahora} />
          </section>
        </aside>
      </div>
    </div>
  );
}
