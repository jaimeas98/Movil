'use client';

import { useEffect, useRef } from 'react';
import { movimientoReducido } from '@/lib/gestos.js';

export default function DayTimeline({ days, selected, onSelect }) {
  const pistaRef = useRef(null);
  const activoRef = useRef(null);

  // Al cambiar de día deslizando nadie ha tocado la tira, así que el chip nuevo
  // podía quedarse fuera de pantalla y la cabecera contradecía al contenido.
  // Movemos el scroll de la propia tira y nada más: scrollIntoView() habría
  // movido también la ventana y peleado con las barras pegajosas.
  useEffect(() => {
    const pista = pistaRef.current;
    const chip = activoRef.current;
    if (!pista || !chip) return;
    const destino = chip.offsetLeft - (pista.clientWidth - chip.offsetWidth) / 2;
    pista.scrollTo({
      left: Math.max(0, destino),
      behavior: movimientoReducido() ? 'auto' : 'smooth',
    });
  }, [selected]);

  return (
    <div className="days">
      <div className="container">
        <div className="days-scroll" ref={pistaRef} role="tablist" aria-label="Selector de día">
          {days.map((d) => {
            const active = d.iso === selected;
            return (
              <button
                key={d.iso}
                id={`tab-${d.iso}`}
                ref={active ? activoRef : null}
                role="tab"
                aria-selected={active}
                aria-controls="panel-dia"
                // Recorrido del tabulador rotatorio: 14 paradas seguidas eran
                // un incordio, y las flechas ya mueven entre días.
                tabIndex={active ? 0 : -1}
                className={`day-chip${active ? ' active' : ''}`}
                onClick={() => onSelect(d.iso)}
              >
                <span className="dow">{d.weekday}</span>
                <span className="dnum">{d.day}</span>
                {d.isToday ? (
                  <span className="badge-today">Hoy</span>
                ) : d.isTomorrow ? (
                  <span className="badge-today">Mañana</span>
                ) : (
                  <span className="dmon">{d.month}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
