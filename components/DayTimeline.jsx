export default function DayTimeline({ days, selected, onSelect }) {
  return (
    <div className="days">
      <div className="container">
        <div className="days-scroll" role="tablist" aria-label="Selector de día">
          {days.map((d) => {
            const active = d.iso === selected;
            return (
              <button
                key={d.iso}
                role="tab"
                aria-selected={active}
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
