'use client';

// Acciones: la lista cerrada de órdenes que el móvil sabe hacer (API.md), con
// lo que hace cada una y lo que tarda. Las que cuestan (gastan batería, datos
// o paran el bucle) piden confirmación en la misma fila, sin ventana: el
// botón se convierte en "Sí, …" y "Cancelar", y el texto dice la consecuencia.
//
// Tras pedirla, la orden sube a "En marcha" y se sigue sola cada 5 s hasta que
// llega el resultado del móvil, con su salida, su código y lo que tardó.

import { useState } from 'react';
import Icono from './Icono.jsx';
import { Estado, Fallo, Hora, Seccion, Vacio } from './Piezas.jsx';
import { VIVAS } from './usarOrdenes.js';
import { duracion } from './tiempo.js';

export const ACCIONES = [
  { id: 'informe', nombre: 'Pedir un informe', que: 'Una vuelta sin recoger: batería, código y estado al momento.', tarda: '~20 s' },
  { id: 'recoger', nombre: 'Recoger todo ahora', que: 'Recogida completa aunque no toque: Yelmo con el navegador y la copia de mk2 y Arte Siete.', tarda: '1–5 min', confirmar: 'Abre Chromium en el móvil y publica la cartelera: gasta batería y datos.' },
  { id: 'recoger-yelmo', nombre: 'Recoger solo Yelmo', que: 'Solo Yelmo Bahía Sur y Área Sur, y lo publica.', tarda: '1–4 min', confirmar: 'Abre Chromium en el móvil: gasta batería y datos.' },
  { id: 'respaldo', nombre: 'Copiar mk2 y Arte Siete', que: 'Solo la copia de respaldo de los dos cines que la web lee directo.', tarda: '~1 min' },
  { id: 'probar-yelmo', nombre: 'Probar Yelmo sin publicar', que: 'Abre Yelmo como en una recogida y dice si funciona, sin tocar la cartelera.', tarda: '1–4 min' },
  { id: 'diagnostico', nombre: 'Diagnóstico', que: 'Versiones de Node y Chromium, disco, memoria, git, bucle, batería y red (sin IPs).', tarda: '~15 s' },
  { id: 'reiniciar-bucle', nombre: 'Reiniciar el bucle', que: 'Para y vuelve a arrancar el bucle de cada 15 min. Para cuando se ha quedado colgado.', tarda: '~5 s', confirmar: 'Si hay una recogida a medias, se corta.' },
  { id: 'actualizar-paquetes', nombre: 'Actualizar paquetes', que: 'pkg upgrade de Termux en segundo plano; el resultado llega al acabar.', tarda: '5–30 min', confirmar: 'Puede tardar media hora y descargar cientos de MB.' },
];
export const nombreAccion = (id) => ACCIONES.find((a) => a.id === id)?.nombre || id || 'Orden';

export const ESTADO_ORDEN = {
  pendiente: { nivel: 'espera', texto: 'Pendiente' },
  'en-curso': { nivel: 'espera', texto: 'En marcha' },
  hecha: { nivel: 'bien', texto: 'Hecha' },
  fallida: { nivel: 'fallo', texto: 'Falló' },
  rechazada: { nivel: 'fallo', texto: 'Rechazada' },
  caducada: { nivel: 'aviso', texto: 'Caducada' },
  perdida: { nivel: 'nada', texto: 'Sin noticias' },
};

function Salida({ texto, abierta = false }) {
  if (!texto) return <p className="pn-apagada pn-pequeno">Sin salida.</p>;
  const lineas = texto.replace(/\s+$/, '').split('\n');
  if (lineas.length <= 14 || abierta) return <pre className="pn-salida">{texto.replace(/\s+$/, '')}</pre>;
  return (
    <details className="pn-detalles">
      <summary>Ver la salida ({lineas.length} líneas)</summary>
      <pre className="pn-salida">{texto.replace(/\s+$/, '')}</pre>
    </details>
  );
}

function Seguimiento({ o, ahora, olvidar }) {
  const e = ESTADO_ORDEN[o.estado] || { nivel: 'nada', texto: o.estado };
  const viva = VIVAS.has(o.estado);
  let frase;
  if (o.estado === 'pendiente') frase = <>Esperando a que el móvil la recoja (mira cada minuto). Pedida <Hora t={o.pedida} ahora={ahora} solo="relativa" />.</>;
  else if (o.estado === 'en-curso') frase = <>El móvil la está haciendo{o.inicio ? <>; empezó <Hora t={o.inicio} ahora={ahora} solo="relativa" /></> : null}.</>;
  else if (o.estado === 'caducada') frase = 'El móvil no la recogió en 6 h y ya no la hará.';
  else if (o.estado === 'rechazada') frase = 'El móvil no la ha aceptado.';
  else if (o.estado === 'perdida') frase = 'Ya no aparece ni en las órdenes ni en los resultados.';
  return (
    <li className="pn-seguimiento" data-nivel={e.nivel} data-viva={viva || undefined}>
      <div className="pn-seguimiento-cab">
        <Estado nivel={e.nivel} texto={e.texto} />
        <p className="pn-seguimiento-nombre">{nombreAccion(o.accion)}</p>
        {!viva && (
          <button type="button" className="boton-icono pn-cerrar" onClick={() => olvidar(o.id)} aria-label={`Quitar ${nombreAccion(o.accion)} de En marcha`}>
            <Icono nombre="aspa" />
          </button>
        )}
      </div>
      {viva && <div className="pn-progreso" aria-hidden="true"><span /></div>}
      {frase && <p className="pn-seguimiento-frase">{frase}</p>}
      {!viva && o.estado !== 'perdida' && o.estado !== 'caducada' && (
        <>
          <p className="pn-seguimiento-datos">
            {o.codigo != null && <span>Código de salida <strong className={o.codigo ? 'pn-texto-fallo' : ''}>{o.codigo}</strong></span>}
            {o.inicio && o.fin && <span>Tardó {duracion(o.fin - o.inicio)}</span>}
            {o.fin && <span>Acabó <Hora t={o.fin} ahora={ahora} /></span>}
          </p>
          <Salida texto={o.salida} abierta />
        </>
      )}
      <p className="pn-seguimiento-id pn-mono">{o.id}</p>
    </li>
  );
}

function Accion({ a, pedirAccion, enviando, error, soloLectura, pendiente }) {
  const [confirmando, setConfirmando] = useState(false);
  const ocupado = enviando === a.id;
  const deshabilitada = soloLectura || Boolean(enviando) || Boolean(pendiente);
  async function pedir() {
    setConfirmando(false);
    await pedirAccion(a.id);
  }
  return (
    <li className="pn-accion" data-confirmando={confirmando || undefined}>
      <div className="pn-accion-txt">
        <p className="pn-accion-nombre">{a.nombre} <span className="pn-accion-tarda">{a.tarda}</span></p>
        <p className="pn-accion-que">{a.que}</p>
        {confirmando && <p className="pn-accion-aviso" id={`conf-${a.id}`}><Icono nombre="aviso" className="pn-ico-peq" />{a.confirmar}</p>}
        {pendiente && <p className="pn-accion-pend">Ya hay una pedida; espera a que acabe.</p>}
        {error && error.tipo !== 'ya-pedida' && <p className="pn-accion-error" role="alert">{error.message}</p>}
      </div>
      <div className="pn-accion-botones">
        {confirmando ? (
          <>
            <button type="button" className="pn-boton pn-boton-fuerte" onClick={pedir} aria-describedby={`conf-${a.id}`} autoFocus>Sí, {a.nombre.charAt(0).toLowerCase() + a.nombre.slice(1)}</button>
            <button type="button" className="pn-boton" onClick={() => setConfirmando(false)}>Cancelar</button>
          </>
        ) : (
          <button
            type="button"
            className="pn-boton"
            disabled={deshabilitada}
            onClick={() => (a.confirmar ? setConfirmando(true) : pedir())}
            title={soloLectura ? 'Solo lectura: falta PANEL_GITHUB_TOKEN' : undefined}
          >
            {ocupado ? 'Mandando…' : 'Pedir'}
            <span className="sr"> {a.nombre}</span>
          </button>
        )}
      </div>
    </li>
  );
}

export default function Acciones({ datos, ahora, soloLectura, ordenesApi }) {
  const { ordenes, pedirAccion, enviando, errores, olvidar } = ordenesApi;
  const seguidas = Object.values(ordenes).sort((a, b) => (b.pedida ?? 0) - (a.pedida ?? 0));
  const idsSeguidas = new Set(seguidas.map((o) => o.id));
  const pendientesPorAccion = new Set(seguidas.filter((o) => VIVAS.has(o.estado)).map((o) => o.accion));
  const historial = (datos.movil?.ordenes.resultados ?? []).filter((o) => !idsSeguidas.has(o.id));

  return (
    <div className="pn-pila">
      {seguidas.length > 0 && (
        <Seccion id="a-marcha" titulo="En marcha">
          <ul className="pn-seguimientos" aria-live="polite">
            {seguidas.map((o) => <Seguimiento key={o.id} o={o} ahora={ahora} olvidar={olvidar} />)}
          </ul>
        </Seccion>
      )}

      <Seccion
        id="a-lista"
        titulo="Pedir al móvil"
        nota={soloLectura
          ? 'Solo lectura: sin PANEL_GITHUB_TOKEN el panel no puede dejar órdenes en GitHub.'
          : 'El móvil mira cada minuto si hay órdenes y nunca hace dos cosas a la vez: si está recogiendo, la orden espera.'}
      >
        <ul className="pn-acciones">
          {ACCIONES.map((a) => (
            <Accion
              key={a.id}
              a={a}
              pedirAccion={pedirAccion}
              enviando={enviando}
              error={errores[a.id]}
              soloLectura={soloLectura}
              pendiente={pendientesPorAccion.has(a.id)}
            />
          ))}
        </ul>
      </Seccion>

      <Seccion id="a-historial" titulo="Órdenes recientes">
        {!datos.movil ? (
          <Fallo titulo="Sin datos del móvil" error={{ message: 'No se puede leer el historial de órdenes.' }} />
        ) : historial.length === 0 ? (
          <Vacio titulo="Ninguna orden reciente">
            {datos.movil.ficheros?.['ordenes-resultado.json'] === false
              ? 'El móvil aún no ha publicado ningún resultado de orden.'
              : 'Las órdenes que pidas aparecerán aquí con su resultado.'}
          </Vacio>
        ) : (
          <ul className="pn-historial">
            {historial.map((o) => {
              const e = ESTADO_ORDEN[o.estado] || { nivel: 'nada', texto: o.estado || '—' };
              return (
                <li key={o.id} className="pn-historial-fila" data-nivel={e.nivel}>
                  <details>
                    <summary>
                      <Estado nivel={e.nivel} texto={e.texto} compacto />
                      <span className="pn-historial-nombre">{nombreAccion(o.accion)}</span>
                      <span className="pn-historial-meta">
                        {o.codigo != null && <span className={o.codigo ? 'pn-texto-fallo' : ''}>código {o.codigo}</span>}
                        {o.duracionMs != null && <span>{duracion(o.duracionMs)}</span>}
                        {o.fin ?? o.inicio ? <Hora t={o.fin ?? o.inicio} ahora={ahora} /> : <span>{o.estado === 'caducada' ? 'el móvil no la recogió a tiempo' : 'sin hora'}</span>}
                      </span>
                    </summary>
                    <Salida texto={o.salida} abierta />
                    <p className="pn-seguimiento-id pn-mono">{o.id}</p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>
    </div>
  );
}
