'use client';

import { useEffect, useRef } from 'react';
import { movimientoReducido } from '@/lib/gestos.js';

// Tira de días, pegada arriba. Hoy y mañana se nombran así; el resto, día de
// la semana y número. El día elegido va en rojo butaca, que es el único rojo
// grande de la pantalla: es lo seleccionado por excelencia.
export default function DayTimeline({ days, selected, onSelect }) {
  const pistaRef = useRef(null);
  const activoRef = useRef(null);

  // Al cambiar de día deslizando nadie ha tocado la tira, así que el día nuevo
  // podía quedarse fuera de pantalla y la cabecera contradecía al contenido.
  // Movemos el scroll de la propia tira y nada más: scrollIntoView() habría
  // movido también la ventana y peleado con la barra pegajosa.
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
    <nav className="days" aria-label="Días">
      <div className="contenedor">
        <div className="days-scroll" ref={pistaRef} role="tablist" aria-label="Selector de día">
          {days.map((d) => {
            const active = d.iso === selected;
            const nombre = d.isToday ? 'Hoy' : d.isTomorrow ? 'Mañana' : d.weekday;
            return (
              <button
                key={d.iso}
                id={`tab-${d.iso}`}
                ref={active ? activoRef : null}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="panel-dia"
                aria-label={`${d.isToday ? 'Hoy, ' : d.isTomorrow ? 'Mañana, ' : ''}${d.weekdayLong.toLowerCase()} ${d.day}`}
                // Recorrido del tabulador rotatorio: 14 paradas seguidas eran
                // un incordio, y las flechas ya mueven entre días.
                tabIndex={active ? 0 : -1}
                className={`day-chip${active ? ' active' : ''}${d.isToday ? ' es-hoy' : ''}`}
                onClick={() => onSelect(d.iso)}
              >
                <span className="dia-nombre">{nombre}</span>
                <span className="dnum">{d.day}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
