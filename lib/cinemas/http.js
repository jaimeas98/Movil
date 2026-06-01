// Helper de red para los adaptadores. Se ejecuta SIEMPRE en el servidor
// (rutas API de Next en Vercel), por lo que no hay problemas de CORS y
// podemos enviar cabeceras de navegador para sortear protecciones básicas.

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/json,application/xhtml+xml,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
};

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...BROWSER_HEADERS, ...(options.headers || {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} en ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}
