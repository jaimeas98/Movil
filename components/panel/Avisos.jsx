'use client';

// Avisos: lo que ha abierto el vigilante de GitHub (issues con la etiqueta
// alerta-movil) y dos botones para no tener que ir a Actions: revisar ya y
// mandar un aviso de prueba (para saber que las notificaciones llegan).

import { useState } from 'react';
import Icono from './Icono.jsx';
import { avisoDePrueba, vigilarAhora } from './api.js';
import { Estado, Fallo, Hora, Seccion, Vacio } from './Piezas.jsx';

function Aviso({ a, ahora }) {
  const abierto = a.estado === 'open' || a.estado === 'abierto';
  const nivel = abierto ? (a.nivel === 'critico' ? 'fallo' : 'aviso') : 'bien';
  return (
    <li className="pn-aviso" data-nivel={nivel}>
      <Estado nivel={nivel} texto={abierto ? (a.nivel === 'critico' ? 'Crítico' : 'Abierto') : 'Cerrado'} />
      <div className="pn-aviso-cuerpo">
        <p className="pn-aviso-titulo">
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer noopener">{a.titulo}<Icono nombre="externo" className="pn-ico-peq" /><span className="sr"> (abre GitHub)</span></a>
          ) : a.titulo}
        </p>
        <p className="pn-aviso-meta">
          {a.numero != null && <span className="pn-mono">#{a.numero}</span>}
          <span>abierto <Hora t={a.creado} ahora={ahora} /></span>
          {a.cerrado && <span>cerrado <Hora t={a.cerrado} ahora={ahora} /></span>}
          {!a.cerrado && a.actualizado && a.actualizado !== a.creado && <span>último cambio <Hora t={a.actualizado} ahora={ahora} solo="relativa" /></span>}
          {a.comentarios ? <span>{a.comentarios === 1 ? '1 comentario' : `${a.comentarios} comentarios`}</span> : null}
        </p>
        {a.cuerpo && <p className="pn-aviso-texto">{a.cuerpo}</p>}
      </div>
    </li>
  );
}

function Boton({ texto, enMarcha, accion, soloLectura, ayuda }) {
  const [estado, setEstado] = useState({ enviando: false, hecho: null, error: null });
  async function pulsar() {
    setEstado({ enviando: true, hecho: null, error: null });
    try {
      const r = await accion();
      setEstado({ enviando: false, hecho: r?.aviso || 'Hecho.', error: null });
    } catch (error) {
      setEstado({ enviando: false, hecho: null, error });
    }
  }
  return (
    <div className="pn-accion pn-accion-suelta">
      <div className="pn-accion-txt">
        <p className="pn-accion-nombre">{texto}</p>
        <p className="pn-accion-que">{ayuda}</p>
        {estado.hecho && <p className="pn-accion-hecho" role="status"><Icono nombre="bien" className="pn-ico-peq" />{estado.hecho}</p>}
        {estado.error && <p className="pn-accion-error" role="alert">{estado.error.message}</p>}
      </div>
      <div className="pn-accion-botones">
        <button type="button" className="pn-boton" onClick={pulsar} disabled={estado.enviando || soloLectura}>
          {estado.enviando ? enMarcha : 'Lanzar'}<span className="sr"> {texto}</span>
        </button>
      </div>
    </div>
  );
}

export default function Avisos({ datos, ahora, soloLectura }) {
  const { abiertos, recientes, error } = datos.avisos;
  return (
    <div className="pn-pila">
      <Seccion id="v-abiertos" titulo="Abiertos">
        {error && <Fallo titulo="No se han podido leer los avisos" error={{ message: error }} />}
        {abiertos.length === 0 && !error ? (
          <Vacio titulo="Ningún aviso abierto">El vigilante revisa el móvil con cada informe y abre un aviso si se calla o se queda sin batería.</Vacio>
        ) : (
          <ul className="pn-avisos">{abiertos.map((a) => <Aviso key={a.numero ?? a.titulo} a={a} ahora={ahora} />)}</ul>
        )}
      </Seccion>
      <Seccion id="v-vigilante" titulo="Vigilante">
        <div className="pn-acciones">
          <Boton
            texto="Revisar ahora"
            enMarcha="Lanzando…"
            accion={vigilarAhora}
            soloLectura={soloLectura}
            ayuda="Lanza el vigilante en GitHub Actions sin esperar al próximo informe. Tarda ~1 min."
          />
          <Boton
            texto="Mandar un aviso de prueba"
            enMarcha="Mandando…"
            accion={avisoDePrueba}
            soloLectura={soloLectura}
            ayuda="Abre un aviso de prueba para comprobar que llegan las notificaciones; se cierra solo en la siguiente revisión."
          />
        </div>
      </Seccion>
      <Seccion id="v-recientes" titulo="Cerrados en los últimos 14 días">
        {recientes.length === 0 ? (
          <Vacio titulo="Ninguno cerrado últimamente" />
        ) : (
          <ul className="pn-avisos">{recientes.map((a) => <Aviso key={a.numero ?? a.titulo} a={{ ...a, estado: a.estado === 'open' ? 'open' : 'closed' }} ahora={ahora} />)}</ul>
        )}
      </Seccion>
    </div>
  );
}
