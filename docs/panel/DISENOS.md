# Diseños intercambiables desde el panel — plan

Petición de Jaime (18-10-2026): poder elegir desde el panel qué diseño de la
cartelera está publicado (hoy: v1, el anterior, guardado en la rama
`diseno-v1`/commit 7081fca; y v2, "Marquesina de la Bahía", el actual), y que
los diseños futuros se vayan añadiendo a esa lista. Por defecto sigue el v2.

## Cómo
- **Cada diseño, una ruta propia** con su layout y su CSS:
  `app/d/v1/` y `app/d/v2/` (más los que vengan). Así Next solo carga el CSS
  del diseño que se ve, sin choques de nombres entre diseños (v1 usaba un
  `globals.css` con clases genéricas). El layout raíz se queda solo con lo
  común (script del tema, manifest). Los datos (`/api/*`, `lib/cinemas`) son
  los mismos para todos.
- **`/` se reescribe al diseño activo** en `middleware.js` (ampliar el
  `matcher` a `/`): lee `data/diseno.js` (`export default { activo: 'v2' }`).
  La URL pública no cambia nunca.
- **Previsualizar sin publicar**: el panel puede poner una cookie solo para
  quien tiene sesión (`diseno-prueba=v1`) y el middleware la respeta solo con
  sesión válida: Jaime ve el otro diseño en su móvil; el público, el activo.
- **Publicar**: el panel escribe `data/diseno.js` por la API de GitHub (como
  `data/enlaces.js`: lista cerrada de ids válidos, límite de 1 cambio/min) →
  Vercel redespliega (~1 min).
- **Recuperar v1**: copiar `app/page.js`, `app/globals.css` y `components/*`
  del commit 7081fca a `app/d/v1/` y `components/v1/`, adaptando imports. El
  backend ha cambiado solo de forma aditiva (enlaceCampos, origen…), así que
  sus datos le siguen valiendo; repasar que su modal y sus tarjetas ignoran
  los campos nuevos.
- **Añadir diseños futuros**: carpeta nueva `app/d/vN/` + entrada en la lista
  de `lib/disenos.js` (id, nombre, fecha, captura) que lee el panel.
- **Panel**: sección "Diseño" con tarjetas (captura, nombre, fecha), botones
  "Ver en mi móvil" (cookie de prueba) y "Publicar"; el activo marcado.

## Riesgos y pruebas
- Que el middleware en `/` no añada latencia notable (solo lee una constante
  importada y una cookie).
- Probar: `/` con cada diseño activo, previsualización con y sin sesión,
  temas claro/oscuro en ambos, los tests de navegador apuntando al diseño
  activo, `next build`.
