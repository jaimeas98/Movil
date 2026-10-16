# Skills de diseño

Copiadas el 16-10-2026 para el rediseño de la cartelera, a petición de Jaime.
Las usa cualquier sesión de Claude Code que abra este repositorio.

| Skill | Origen | Licencia | Para qué |
|---|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) @ 6af45ac | Apache 2.0 | Dirección de diseño, crítica, auditoría, pulido, tipografía, color, layout |
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) @ 2d22863 | MIT | Criterio de diseño de interfaz y de animación |
| `apple-design` | ídem | MIT | Movimiento fluido estilo Apple: muelles, gestos, materiales, tipografía |
| `animate`, `review-animations`, `animation-performance`, `find-animation-opportunities` | ídem | MIT | Crear, revisar y optimizar animaciones |
| `design-taste-frontend` | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) @ f624f37 | MIT | Antigenérico: ideas sacadas del tema, no de la categoría |
| `redesign-existing-projects` | ídem | MIT | Auditoría de patrones genéricos al rediseñar |

## Qué se ha dejado fuera, a propósito

Solo se han copiado las guías (`SKILL.md` y sus referencias en Markdown/JSON).
**No** se han copiado los scripts ejecutables que traen:

- `impeccable/scripts/`: su lanzador descarga y ejecuta un binario la primera
  vez. La propia skill prevé trabajar sin él ("Launcher unavailable": se leen
  PRODUCT.md y DESIGN.md directamente).
- `design-taste-frontend/scripts/`: `draw.mjs`, `inspect.mjs`, `assets.mjs`.
  Los datos que reparten (`library/*.json`) sí están, y se pueden consultar a
  mano.

Código de terceros sin revisar no entra en el repositorio. Si algún día hacen
falta, se descargan aparte y se revisan antes.
