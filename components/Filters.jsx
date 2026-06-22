export default function Filters({
  query,
  onQuery,
  genre,
  onGenre,
  cinema,
  onCinema,
  genres,
  cinemas,
}) {
  return (
    <div className="filters">
      <div className="field">
        <span className="ic">🔎</span>
        <input
          id="search-input"
          className="input"
          type="text"
          placeholder="Buscar por título…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Buscar por título"
        />
        {query && (
          <button className="field-clear" onClick={() => onQuery('')} aria-label="Limpiar búsqueda">
            ✕
          </button>
        )}
      </div>

      <div className="field">
        <span className="ic">🎭</span>
        <select className="select" value={genre} onChange={(e) => onGenre(e.target.value)} aria-label="Filtrar por género">
          <option value="">Todos los géneros</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="ic">🎬</span>
        <select className="select" value={cinema} onChange={(e) => onCinema(e.target.value)} aria-label="Filtrar por cine">
          <option value="">Todos los cines</option>
          {cinemas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.short}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
