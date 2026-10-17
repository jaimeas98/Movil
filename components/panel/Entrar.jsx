'use client';

// La entrada: una caja de clave y un botón, nada más. Sin marca ni nada que
// diga qué hay detrás (PLAN.md): quien llegue aquí por casualidad no tiene por
// qué saber que es un panel ni de qué.
//
// Es un <form> de verdad con method="post" a la misma ruta: sin JavaScript
// también entra (el servidor responde 303). Con JavaScript, se queda en la
// página para poder decir "esa clave no vale" sin recargar. El servidor tarda
// ~800 ms a propósito en cada fallo, así que el botón dice que está
// comprobando desde el primer instante. El campo de usuario oculto es para
// que los gestores de contraseñas guarden la clave con un nombre.

import { useEffect, useRef, useState } from 'react';
import { entrar } from './api.js';

export default function Entrar({ mal = false }) {
  const [clave, setClave] = useState('');
  const [comprobando, setComprobando] = useState(false);
  const [error, setError] = useState(mal ? 'Esa clave no vale.' : null);
  const campo = useRef(null);

  useEffect(() => { campo.current?.focus(); }, []);

  async function alEnviar(e) {
    e.preventDefault();
    if (!clave || comprobando) return;
    setComprobando(true);
    setError(null);
    try {
      await entrar(clave);
      window.location.replace('/panel');
    } catch (err) {
      setComprobando(false);
      if (err?.tipo === 'clave') setError(err.message || 'Esa clave no vale.');
      else if (err?.tipo === 'limite') setError(err.message || 'Demasiados intentos seguidos. Espera un minuto.');
      else if (err?.tipo === 'red' || err?.tipo === 'tiempo') setError('No hay conexión. Vuelve a intentarlo.');
      else setError('No se ha podido comprobar. Vuelve a intentarlo.');
      // Se deja la clave escrita y seleccionada: lo normal es corregir una letra.
      requestAnimationFrame(() => campo.current?.select());
    }
  }

  return (
    <main className="pn-entrar">
      <form className="pn-entrar-form" method="post" action="/api/panel/entrar" onSubmit={alEnviar} noValidate>
        {/* Fuera de la vista pero no `hidden`: con hidden, algunos gestores de
            contraseñas no lo ven y guardan la clave sin nombre. */}
        <input type="text" name="usuario" autoComplete="username" defaultValue="panel" readOnly className="sr" aria-hidden="true" tabIndex={-1} />
        <label className="pn-campo-nombre pn-entrar-etiqueta" htmlFor="clave">Clave</label>
        <input
          ref={campo}
          id="clave"
          name="clave"
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          value={clave}
          onChange={(e) => { setClave(e.target.value); if (error) setError(null); }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'clave-error' : undefined}
          className="pn-entrar-campo"
        />
        <p id="clave-error" className="pn-entrar-error" role="alert">{error}</p>
        <button type="submit" className="pn-boton pn-boton-fuerte pn-entrar-boton" disabled={!clave || comprobando} aria-busy={comprobando}>
          {comprobando ? 'Comprobando…' : 'Entrar'}
          {comprobando && <span className="pn-entrar-progreso" aria-hidden="true" />}
        </button>
      </form>
    </main>
  );
}
