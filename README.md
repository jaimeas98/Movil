# 🎬 Cartelera Cine Jaime

Cartelera unificada y responsive de los cines de la **Bahía de Cádiz**:

- **mk2 Cinesur Bahía de Cádiz** (Cádiz)
- **Yelmo Premium Bahía Sur** (San Fernando)
- **Yelmo Cines Jerez** (Jerez de la Frontera)
- **Arte Siete El Puerto** (El Puerto de Santa María)

Selecciona un día en la línea superior y verás, cine por cine, las películas con sus
horarios, duración, género y clasificación por edad. Incluye **buscador** (por título),
**filtro por género** y **filtro por cine**, **modo claro/oscuro** y diseño adaptado a
móvil, tablet, PC y pantallas ultrawide.

## 🚀 Stack

- **Next.js 14** (App Router) — frontend + rutas API serverless.
- **CSS propio** con variables (sin frameworks): limpio, legible y rápido.
- Sin base de datos: los datos se obtienen al vuelo desde el servidor.

## 🧩 Cómo funcionan los datos

Las llamadas a los cines se hacen **en el servidor** (rutas API en `/app/api`), evitando
problemas de CORS. Cada cine tiene su adaptador en `lib/cinemas/`:

- `yelmo.js`, `mk2.js`, `artesiete.js` → integración en vivo (a afinar tras el deploy).
- `sample.js` → datos de ejemplo deterministas (fallback) para que la web nunca esté vacía.
- `aggregator.js` → orquesta los 4 cines y marca cada uno como `live` o `sample`.

> En local/sandbox sin red abierta verás "datos de ejemplo". Al desplegar en Vercel
> (red abierta) se afinan los adaptadores para datos en vivo.

## 🛠️ Desarrollo local

```bash
npm install
npm run dev
# abre http://localhost:3000
```

## ☁️ Desplegar en Vercel (URL pública)

1. Entra en **https://vercel.com** e inicia sesión con tu cuenta de **GitHub**.
2. **Add New → Project** e importa el repositorio `jaimeas98/Movil`
   (rama `claude/puerto-santa-maria-restaurants-NxChu`).
3. Framework: **Next.js** (se detecta solo). No hay que configurar nada más.
4. **Deploy**. En ~1 minuto tendrás una URL tipo
   `https://cartelera-cine-jaime.vercel.app`.

No necesitas variables de entorno ni base de datos.
