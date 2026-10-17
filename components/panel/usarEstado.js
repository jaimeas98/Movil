'use client';

// El estado del panel y su refresco.
//
// · Pide /api/panel/estado al entrar, cada 30 s mientras la pestaña se ve y
//   en cuanto vuelve a verse si lo último tiene más de 30 s. Con la pestaña
//   escondida no pide nada: el panel puede quedarse abierto días en el móvil
//   y no tiene por qué gastar batería ni peticiones de la API de GitHub.
// · Si una petición falla, se queda con lo último que llegó bien y lo marca
//   como viejo: un fallo de red momentáneo no debe dejar la pantalla en
//   blanco ni hacer creer que todo ha caído.
// · Nunca hay dos peticiones a la vez: la nueva cancela la anterior.

import { useCallback, useEffect, useRef, useState } from 'react';
import { leerEstado } from './api.js';
import { normalizar } from './datos.js';

const CADA_MS = 30000;

export function usarEstado() {
  const [estado, setEstado] = useState({ datos: null, crudo: null, error: null, cargando: true, recibido: null });
  const ctrl = useRef(null);
  const ultimo = useRef(0);

  const refrescar = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setEstado((e) => ({ ...e, cargando: true }));
    try {
      const crudo = await leerEstado(c.signal);
      if (c.signal.aborted) return;
      ultimo.current = Date.now();
      setEstado({ datos: normalizar(crudo, Date.now()), crudo, error: null, cargando: false, recibido: Date.now() });
    } catch (error) {
      if (c.signal.aborted) return;
      if (error?.tipo === 'sesion') return; // ya se va a /panel/entrar
      setEstado((e) => ({ ...e, error, cargando: false }));
    }
  }, []);

  // Cambia un trozo de los datos sin volver a pedirlo todo (p. ej. los cines
  // tras "Volver a pedir ahora", que ya los trae).
  const parchear = useCallback((fn) => {
    setEstado((e) => (e.datos ? { ...e, datos: fn(e.datos) } : e));
  }, []);

  useEffect(() => {
    refrescar();
    let reloj = null;
    const arrancar = () => {
      clearInterval(reloj);
      reloj = setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, CADA_MS);
    };
    const alCambiar = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - ultimo.current > CADA_MS) refrescar();
        arrancar();
      } else {
        clearInterval(reloj);
      }
    };
    arrancar();
    document.addEventListener('visibilitychange', alCambiar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alCambiar);
      ctrl.current?.abort();
    };
  }, [refrescar]);

  return { ...estado, refrescar, parchear };
}

// Un reloj compartido para las horas relativas: "hace 3 min" tiene que pasar
// a "hace 4 min" sin volver a pedir nada.
export function usarAhora(cadaMs = 15000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}
