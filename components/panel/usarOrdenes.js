'use client';

// Las órdenes al móvil que se han pedido desde ESTA pestaña, y su sondeo.
//
// Una orden tarda en empezar hasta ~1 min (el móvil mira la rama cada minuto)
// y luego lo que tarde la acción. Mientras haya alguna pendiente o en curso,
// se pregunta por ella cada 5 s (API.md: la caché de esa lectura es de 4 s) y
// se para en cuanto llega su resultado. Al terminar una, se vuelve a pedir el
// estado general: lo normal es que la orden haya cambiado el informe del móvil.
//
// Vive en el armazón del panel y no en la pantalla de Acciones para que el
// seguimiento no se pierda al cambiar de sección.

import { useCallback, useEffect, useRef, useState } from 'react';
import { leerOrden, mandarOrden } from './api.js';

export const VIVAS = new Set(['pendiente', 'en-curso']);
const CADA_MS = 5000;

function aplanar(r) {
  // GET /orden/:id → { id, accion, pedida, estado, resultado: {inicio, fin, codigo, salida} | null }
  const res = r?.resultado && typeof r.resultado === 'object' ? r.resultado : {};
  return {
    id: r?.id,
    accion: r?.accion,
    pedida: r?.pedida ? Date.parse(r.pedida) : null,
    estado: r?.estado || res.estado || 'pendiente',
    inicio: res.inicio ? Date.parse(res.inicio) : null,
    fin: res.fin ? Date.parse(res.fin) : null,
    codigo: typeof res.codigo === 'number' ? res.codigo : null,
    salida: typeof res.salida === 'string' ? res.salida : null,
  };
}

export function usarOrdenes({ alTerminar } = {}) {
  const [ordenes, setOrdenes] = useState({}); // id → orden
  const [enviando, setEnviando] = useState(null); // acción que se está mandando
  const [errores, setErrores] = useState({}); // acción → ErrorPanel
  const [ultimoSondeo, setUltimoSondeo] = useState(null);
  const terminar = useRef(alTerminar);
  terminar.current = alTerminar;

  const pedirAccion = useCallback(async (accion) => {
    setEnviando(accion);
    setErrores((e) => ({ ...e, [accion]: null }));
    try {
      const r = await mandarOrden(accion);
      const o = aplanar(r);
      if (o.id) setOrdenes((t) => ({ ...t, [o.id]: { ...o, accion: o.accion || accion, pedida: o.pedida ?? Date.now(), estado: o.estado || 'pendiente' } }));
      return o;
    } catch (error) {
      // "Ya está pedida": no es un fallo, es esa misma orden; se sigue a ella.
      if (error?.tipo === 'ya-pedida' && error.id) {
        setOrdenes((t) => (t[error.id] ? t : { ...t, [error.id]: { id: error.id, accion, pedida: null, estado: 'pendiente' } }));
      }
      setErrores((e) => ({ ...e, [accion]: error }));
      return null;
    } finally {
      setEnviando(null);
    }
  }, []);

  const ordenesRef = useRef(ordenes);
  ordenesRef.current = ordenes;

  const vivas = Object.values(ordenes).filter((o) => VIVAS.has(o.estado));
  const hayVivas = vivas.length > 0;

  useEffect(() => {
    if (!hayVivas) return undefined;
    let parado = false;
    const ctrl = new AbortController();
    async function sondear() {
      if (document.visibilityState !== 'visible') return;
      const ids = Object.values(ordenesRef.current).filter((o) => VIVAS.has(o.estado)).map((o) => o.id);
      let alguna = false;
      await Promise.all(ids.map(async (id) => {
        try {
          const r = aplanar(await leerOrden(id, ctrl.signal));
          if (parado) return;
          // Se compara con la referencia y no dentro del actualizador: React
          // puede ejecutar el actualizador más tarde, y entonces `alguna` aún
          // no valdría nada al mirarla abajo.
          const previa = ordenesRef.current[id];
          if (previa && VIVAS.has(previa.estado) && !VIVAS.has(r.estado)) alguna = true;
          setOrdenes((t) => {
            const antes = t[id];
            return { ...t, [id]: { ...antes, ...r, accion: r.accion || antes?.accion, pedida: r.pedida ?? antes?.pedida } };
          });
        } catch (error) {
          if (parado || ctrl.signal.aborted) return;
          // La orden ya no está (se recortó del historial): se da por perdida
          // en vez de sondear para siempre.
          if (error?.tipo === 'no-esta') setOrdenes((t) => ({ ...t, [id]: { ...t[id], estado: 'perdida' } }));
        }
      }));
      if (!parado) {
        setUltimoSondeo(Date.now());
        if (alguna) terminar.current?.();
      }
    }
    const t = setInterval(sondear, CADA_MS);
    return () => { parado = true; clearInterval(t); ctrl.abort(); };
  }, [hayVivas]);

  const olvidar = useCallback((id) => setOrdenes((t) => { const n = { ...t }; delete n[id]; return n; }), []);

  // Las pendientes que ya venían en el estado (pedidas desde otra pestaña o
  // antes de recargar) también se siguen, para que su resultado aparezca solo.
  const seguir = useCallback((pendientes) => {
    if (!pendientes?.length) return;
    setOrdenes((t) => {
      let cambia = false;
      const n = { ...t };
      for (const o of pendientes) {
        if (o.id && !n[o.id]) { n[o.id] = { id: o.id, accion: o.accion, pedida: o.pedida, estado: o.estado || 'pendiente' }; cambia = true; }
      }
      return cambia ? n : t;
    });
  }, []);

  return { ordenes, pedirAccion, enviando, errores, ultimoSondeo, olvidar, seguir };
}
