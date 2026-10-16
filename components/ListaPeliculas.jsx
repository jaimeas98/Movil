'use client';

import { useMemo, useState } from 'react';
import { ordenarPeliculas } from '@/lib/cartelera.js';
import { useAhora } from '@/lib/reloj.js';
import Pelicula from './Pelicula.jsx';

// Cuántos minutos de sesión de la lista ya han pasado. Es lo único del reloj
// que cambia el ORDEN, así que la lista solo se reordena cuando una sesión
// empieza, no cada minuto.
function contarAnteriores(minutos, ahora) {
  let lo = 0, hi = minutos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (minutos[mid] < ahora) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// Vista "Películas": una entrada por película, ordenadas por la primera sesión
// que todavía no ha empezado (hoy) o por la primera del día (otros días). Hoy,
// las que ya no tienen nada por delante se guardan tras un botón.
export default function ListaPeliculas({ peliculas, fecha, onAbrir, onDiaSiguiente }) {
  const [verEmpezadas, setVerEmpezadas] = useState(false);

  const minutos = useMemo(() => {
    const s = new Set();
    for (const p of peliculas) for (const c of p.cines) for (const x of c.sessions) s.add(x.minuto);
    return [...s].sort((a, b) => a - b);
  }, [peliculas]);

  const corte = useAhora((a) => (a && a.fecha === fecha ? contarAnteriores(minutos, a.minuto) : -1));
  const umbral = corte < 0 ? null : corte < minutos.length ? minutos[corte] : Infinity;
  const { porDelante, empezadas } = useMemo(() => ordenarPeliculas(peliculas, umbral), [peliculas, umbral]);

  const n = empezadas.length;
  return (
    <>
      {porDelante.length > 0 && (
        <ul className="pelis">
          {porDelante.map((p) => (
            <li key={p.clave}><Pelicula pelicula={p} fecha={fecha} onAbrir={onAbrir} /></li>
          ))}
        </ul>
      )}

      {porDelante.length === 0 && n > 0 && (
        <div className="estado estado-compacto">
          <h2 className="estado-titulo">Por hoy ya ha empezado todo</h2>
          <p className="estado-texto">
            {n === 1 ? 'La única película que quedaba ya ha empezado.' : `Las ${n} películas de hoy ya han empezado su última sesión.`}
          </p>
          {onDiaSiguiente && (
            <div className="estado-acciones">
              <button type="button" className="boton boton-principal" onClick={onDiaSiguiente}>Ver mañana</button>
            </div>
          )}
        </div>
      )}

      {n > 0 && (
        <div className="empezadas">
          <button
            type="button"
            className="boton empezadas-boton"
            aria-expanded={verEmpezadas}
            onClick={() => setVerEmpezadas((v) => !v)}
          >
            {verEmpezadas
              ? 'Ocultar las que ya han empezado'
              : `Ver también ${n === 1 ? 'la que ya ha empezado' : `las ${n} que ya han empezado`}`}
          </button>
          {verEmpezadas && (
            <ul className="pelis pelis-apagadas">
              {empezadas.map((p) => (
                <li key={p.clave}><Pelicula pelicula={p} fecha={fecha} onAbrir={onAbrir} /></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
