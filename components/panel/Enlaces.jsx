'use client';

// Enlaces de compra: arreglar el formato de un cine sin tocar código.
//
// El camino es el de PLAN.md: elijo una sesión real, veo su enlace de ahora y
// sus campos, pego el enlace BUENO de esa misma sesión (copiado de la web del
// cine), el servidor deduce la plantilla y la prueba con otras sesiones, y si
// cuadra la guardo. Guardar no es inmediato (commit + redespliegue de Vercel,
// ~1 min) y se dice antes de pulsar, no después.

import { useEffect, useMemo, useState } from 'react';
import Icono from './Icono.jsx';
import { deducirPlantilla, guardarPlantilla, leerEnlaces } from './api.js';
import { Cargando, Estado, Fallo, PuntoCine, Seccion, Vacio } from './Piezas.jsx';
import { nombreCine } from './datos.js';

// Solo se pinta como enlace un https: lo que se enseña aquí puede venir de la
// web de un cine, y un `javascript:` en esta página correría con la sesión
// del panel.
const esHttps = (u) => typeof u === 'string' && /^https:\/\//i.test(u);

const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const dia = (iso) => (iso ? fmtDia.format(new Date(`${iso}T12:00:00Z`)).replace('.', '') : '');

function Plantilla({ texto }) {
  // Los huecos {campo|filtro} se resaltan: son lo que cambia de una sesión a otra.
  const partes = String(texto).split(/(\{[^}]+\})/g);
  return (
    <code className="pn-plantilla">
      {partes.map((p, i) => (p.startsWith('{') ? <span key={i} className="pn-hueco">{p}</span> : p))}
    </code>
  );
}

function Prueba({ p }) {
  const nivel = p.ok === true ? 'bien' : p.ok === false ? 'fallo' : 'nada';
  return (
    <li className="pn-prueba" data-nivel={nivel}>
      <Estado nivel={nivel} texto={p.ok === true ? `Responde${p.estado ? ` (${p.estado})` : ''}` : p.ok === false ? (p.motivo || 'No responde') : 'No se puede comprobar'} />
      <span className="pn-prueba-que">{p.pelicula} · {dia(p.fecha)} {p.hora}{p.ms != null && <span className="pn-apagada"> · {p.ms} ms</span>}</span>
      {p.ok == null && p.motivo && <span className="pn-apagada pn-pequeno">{p.motivo}</span>}
      {esHttps(p.url) ? <a className="pn-url" href={p.url} target="_blank" rel="noreferrer noopener">{p.url}</a> : p.url && <span className="pn-url">{p.url}</span>}
    </li>
  );
}

function EditorCine({ cine, soloLectura, alGuardar }) {
  const [clave, setClave] = useState(cine.sesiones[0]?.clave ?? '');
  const [pegado, setPegado] = useState('');
  const [deduciendo, setDeduciendo] = useState(false);
  const [deduccion, setDeduccion] = useState(null);
  const [errDeducir, setErrDeducir] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const [errGuardar, setErrGuardar] = useState(null);
  const [confirmandoOriginal, setConfirmandoOriginal] = useState(false);

  const sesion = cine.sesiones.find((s) => s.clave === clave) ?? null;
  const urlValida = /^https?:\/\/\S+$/i.test(pegado.trim());

  async function deducir(e) {
    e.preventDefault();
    if (!sesion || !urlValida) return;
    setDeduciendo(true); setErrDeducir(null); setDeduccion(null); setGuardado(null);
    try { setDeduccion(await deducirPlantilla({ cine: cine.id, sesion: sesion.clave, enlaceBueno: pegado.trim() })); }
    catch (err) { setErrDeducir(err); }
    finally { setDeduciendo(false); }
  }
  async function guardar(plantilla) {
    setGuardando(true); setErrGuardar(null); setGuardado(null);
    try {
      const r = await guardarPlantilla(cine.id, plantilla);
      setGuardado(r);
      setConfirmandoOriginal(false);
      alGuardar(cine.id, plantilla);
    } catch (err) { setErrGuardar(err); }
    finally { setGuardando(false); }
  }

  // Lo que pasó al guardar va junto al botón que se pulsó: bajo "Guardar
  // esta plantilla" o bajo "Volver al formato original".
  const resultadoGuardar = (errGuardar || guardado) ? (
    <div aria-live="polite">
      {errGuardar && <Fallo titulo="No se ha podido guardar" error={errGuardar} />}
      {guardado && (
        <div className="pn-hecho" role="status">
          <Estado nivel="bien" texto="Guardado" />
          <p>{guardado.aviso || 'Guardado. La cartelera lo usará cuando Vercel termine de redesplegar (~1 min).'}{guardado.commit && <> Commit <span className="pn-mono">{guardado.commit}</span>.</>}</p>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="pn-pila">
      <Seccion id="e-actual" titulo="Formato en uso">
        {cine.plantilla ? (
          <>
            <p className="pn-apagada pn-pequeno">Plantilla propia, guardada desde el panel. Manda sobre el formato del adaptador.</p>
            <Plantilla texto={cine.plantilla} />
            <details className="pn-detalles"><summary>Ver el formato original</summary><Plantilla texto={cine.original} /></details>
            <div className="pn-fila-botones">
              {confirmandoOriginal ? (
                <>
                  <button type="button" className="pn-boton pn-boton-fuerte" onClick={() => guardar(null)} disabled={guardando}>{guardando ? 'Guardando…' : 'Sí, volver al original'}</button>
                  <button type="button" className="pn-boton" onClick={() => setConfirmandoOriginal(false)}>Cancelar</button>
                </>
              ) : (
                <button type="button" className="pn-boton" onClick={() => setConfirmandoOriginal(true)} disabled={soloLectura}>Volver al formato original</button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="pn-apagada pn-pequeno">Formato original del adaptador{cine.id !== 'arte-siete-puerto' ? ' (aproximado: el adaptador manda)' : ''}.</p>
            <Plantilla texto={cine.original || '—'} />
          </>
        )}
        {!deduccion && resultadoGuardar && <div className="pn-fila-botones">{resultadoGuardar}</div>}
      </Seccion>

      <Seccion id="e-nueva" titulo="Arreglar con un enlace bueno">
        {cine.sesiones.length === 0 ? (
          <Vacio titulo="No hay sesiones de hoy ni de mañana">Sin una sesión real no se puede deducir el formato. Vuelve cuando el cine tenga cartelera.</Vacio>
        ) : (
          <form className="pn-form" onSubmit={deducir}>
            <label className="pn-campo">
              <span className="pn-campo-nombre">Sesión de ejemplo</span>
              <select value={clave} onChange={(e) => { setClave(e.target.value); setDeduccion(null); }}>
                {cine.sesiones.map((s) => (
                  <option key={s.clave} value={s.clave}>{dia(s.fecha)} · {s.hora} · {s.pelicula}{s.sala ? ` · ${s.sala}` : ''}</option>
                ))}
              </select>
            </label>
            {sesion && (
              <div className="pn-sesion">
                <dl className="pn-datos">
                  {Object.entries(sesion.campos || {}).map(([k, v]) => (
                    <div key={k} className="pn-dato"><dt className="pn-mono">{k}</dt><dd className="pn-mono pn-romper">{String(v)}</dd></div>
                  ))}
                </dl>
                <p className="pn-campo-nombre">Enlace que ve la cartelera ahora</p>
                {esHttps(sesion.enlace) ? <a className="pn-url" href={sesion.enlace} target="_blank" rel="noreferrer noopener">{sesion.enlace}<Icono nombre="externo" className="pn-ico-peq" /></a> : <p className="pn-apagada">Esta sesión no tiene enlace.</p>}
                {sesion.enlaceOriginal && sesion.enlaceOriginal !== sesion.enlace && (
                  <p className="pn-apagada pn-pequeno">El adaptador daría: <span className="pn-url">{sesion.enlaceOriginal}</span></p>
                )}
              </div>
            )}
            <label className="pn-campo">
              <span className="pn-campo-nombre">Enlace bueno de esa misma sesión</span>
              <span className="pn-campo-ayuda" id="pegar-ayuda">Ábrela en la web del cine, llega hasta la página de compra y copia la dirección.</span>
              <textarea
                rows={3}
                value={pegado}
                onChange={(e) => { setPegado(e.target.value); setDeduccion(null); }}
                placeholder="https://…"
                aria-describedby="pegar-ayuda"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="url"
              />
              {pegado.trim() && !urlValida && <span className="pn-campo-error">Tiene que empezar por http:// o https:// y no llevar espacios.</span>}
            </label>
            <div className="pn-fila-botones">
              <button type="submit" className="pn-boton pn-boton-fuerte" disabled={!sesion || !urlValida || deduciendo}>
                {deduciendo ? 'Deduciendo y probando…' : 'Deducir'}
              </button>
              {deduciendo && <span className="pn-apagada pn-pequeno">Prueba hasta 5 sesiones más; puede tardar medio minuto.</span>}
            </div>
          </form>
        )}
        {errDeducir && <Fallo titulo="No se ha podido deducir" error={errDeducir} />}
      </Seccion>

      {deduccion && (
        <Seccion id="e-resultado" titulo="Plantilla deducida">
          <Plantilla texto={deduccion.plantilla} />
          <p className="pn-apagada pn-pequeno">
            Usa {deduccion.usados?.length ? deduccion.usados.join(', ') : 'ningún campo'}
            {deduccion.sinUsar?.length ? `; no usa ${deduccion.sinUsar.join(', ')}` : ''}.
          </p>
          <div className="pn-comprobacion" data-nivel={deduccion.igual ? 'bien' : 'fallo'}>
            <Estado nivel={deduccion.igual ? 'bien' : 'fallo'} texto={deduccion.igual ? 'Da exactamente el enlace pegado' : 'No da el enlace pegado'} />
            <span className="pn-url">{deduccion.renderizado}</span>
          </div>
          {deduccion.avisos?.length > 0 && (
            <ul className="pn-avisos-txt">
              {deduccion.avisos.map((a) => <li key={a}><Icono nombre="aviso" className="pn-ico-peq" />{a}</li>)}
            </ul>
          )}
          <p className="pn-campo-nombre">Con otras sesiones</p>
          {deduccion.pruebas?.length ? <ul className="pn-pruebas">{deduccion.pruebas.map((p) => <Prueba key={p.clave || p.url} p={p} />)}</ul> : <p className="pn-apagada pn-pequeno">No había más sesiones con las que probar.</p>}
          <div className="pn-guardar">
            <p className="pn-pequeno">Guardar hace un commit en la rama de la web: la cartelera usa la plantilla cuando Vercel termina de redesplegar, en ~1 min.</p>
            <button type="button" className="pn-boton pn-boton-fuerte" onClick={() => guardar(deduccion.plantilla)} disabled={!deduccion.igual || guardando || soloLectura}>
              {guardando ? 'Guardando…' : 'Guardar esta plantilla'}
            </button>
            {!deduccion.igual && <p className="pn-campo-error">No se puede guardar una plantilla que no da el enlace pegado.</p>}
            {soloLectura && <p className="pn-apagada pn-pequeno">Solo lectura: falta PANEL_GITHUB_TOKEN.</p>}
            {resultadoGuardar}
          </div>
        </Seccion>
      )}
    </div>
  );
}

export default function Enlaces({ soloLectura }) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: true });
  const [cineId, setCineId] = useState(null);

  async function cargar() {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const datos = await leerEnlaces();
      setEstado({ datos, error: null, cargando: false });
      setCineId((id) => id ?? datos?.cines?.find((c) => c.id === 'arte-siete-puerto')?.id ?? datos?.cines?.[0]?.id ?? null);
    } catch (error) {
      if (error?.tipo === 'sesion') return;
      setEstado((e) => ({ ...e, error, cargando: false }));
    }
  }
  useEffect(() => { cargar(); }, []);

  const cines = useMemo(() => estado.datos?.cines ?? [], [estado.datos]);
  const cine = cines.find((c) => c.id === cineId) ?? null;

  function alGuardar(id, plantilla) {
    setEstado((e) => ({ ...e, datos: { ...e.datos, cines: e.datos.cines.map((c) => (c.id === id ? { ...c, plantilla } : c)) } }));
  }

  if (estado.error && !estado.datos) return <Fallo titulo="No se han podido leer los enlaces" error={estado.error} alReintentar={cargar} reintentando={estado.cargando} />;
  if (!estado.datos) return <Cargando texto="Leyendo plantillas y sesiones…" />;
  if (!cines.length) return <Vacio titulo="El servidor no ha mandado ningún cine" />;

  return (
    <div className="pn-pila">
      <div className="pn-selector-cine" role="group" aria-label="Cine">
        {cines.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === cineId}
            className="pn-segmento pn-segmento-cine"
            onClick={() => setCineId(c.id)}
          >
            <PuntoCine id={c.id} />
            <span>{nombreCine(c.id)}</span>
            {c.plantilla && <span className="pn-marca-propia">propia</span>}
          </button>
        ))}
      </div>
      {cine && <EditorCine key={cine.id} cine={cine} soloLectura={soloLectura} alGuardar={alGuardar} />}
    </div>
  );
}
