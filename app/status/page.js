'use client';

import { useEffect, useState } from 'react';

export default function StatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status?refresh=1', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setData({ error: String(e) }))
      .finally(() => setLoading(false));
  }, []);

  const style = {
    fontFamily: 'monospace', fontSize: 13, padding: 20, lineHeight: 1.6,
    background: '#0a0a0a', color: '#e0e0e0', minHeight: '100vh',
  };
  const green = { color: '#4ade80' };
  const red = { color: '#f87171' };
  const yellow = { color: '#fbbf24' };

  if (loading) return <div style={style}>Cargando datos…</div>;
  if (!data || data.error) return <div style={style}>Error: {data?.error}</div>;

  return (
    <div style={style}>
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Estado cartelera</h2>
      <p style={{ margin: '0 0 16px', ...( data.healthy ? green : red ) }}>
        {data.healthy ? '✅ SALUDABLE — todos los días tienen películas' : `❌ PROBLEMA — ${data.zeros.length} huecos detectados`}
      </p>
      <p style={{ margin: '0 0 4px', color: '#9ca3af' }}>
        Generado: {data.generatedAt} | Hoy Madrid: {data.todayMadrid} | Modo: {data.mode}
      </p>
      {data.zeros.length > 0 && (
        <div style={{ ...red, margin: '8px 0' }}>
          Huecos: {data.zeros.join(', ')}
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', marginTop: 16, width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Cine</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Fuente</th>
            {data.cinemas[0]?.allDates.map((d) => (
              <th key={d.iso} style={{ padding: '4px 6px', minWidth: 36, fontSize: 11 }}>
                {d.iso.slice(5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cinemas.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{c.id}</td>
              <td style={{ padding: '4px 8px', ...(c.source === 'live' ? green : yellow) }}>
                {c.source}
              </td>
              {c.allDates.map((d) => (
                <td key={d.iso} style={{
                  padding: '4px 6px', textAlign: 'center', fontSize: 11,
                  ...(d.count === 0 ? red : d.count > 0 ? {} : {}),
                }}>
                  {d.count === 0 ? '❌' : d.count}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.cinemas.map((c) => c.reason && (
        <p key={c.id} style={{ ...yellow, margin: '4px 0', fontSize: 12 }}>
          {c.id}: {c.reason}
        </p>
      ))}
    </div>
  );
}
