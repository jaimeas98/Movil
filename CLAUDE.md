# Cartelera de la Bahía de Cádiz

> **Al empezar una sesión, lee también [`docs/TRASPASO.md`](docs/TRASPASO.md)**:
> qué está montado, cómo se trabaja con Jaime y qué queda pendiente.

Web (Next.js 14 en Vercel) con la cartelera de mk2 Cinesur, los dos Yelmo y
Arte Siete. Rama de trabajo: `claude/puerto-santa-maria-restaurants-NxChu`.
Yelmo bloquea a los servidores con Cloudflare, así que lo recoge **un móvil
Android de casa** (Termux + Chromium), que además copia mk2 y Arte Siete, deja
su informe cada 15 min en la rama `estado-movil` y obedece al panel privado
(`/panel`) por la rama `ordenes-movil`. Un vigilante de GitHub avisa si calla.

## Dónde está cada cosa
- **Web**: `app/`, `components/`, `lib/cinemas/` (adaptadores y agregador),
  `data/` (lo que publica el móvil: `yelmo.js`, `respaldo.js`; y `enlaces.js`).
  Diseño: `DESIGN.md`, `PRODUCT.md`.
- **Panel**: `app/panel/`, `app/api/panel/`, `components/panel/`, `lib/panel/`,
  `middleware.js`. Plan y contrato: `docs/panel/PLAN.md`, `docs/panel/API.md`.
  Es también el panel del **visor de LoL** (repo privado `jaimeas98/Trabajo-IA`):
  pestaña LoL, `lib/panel/lol.js`, `components/panel/Lol.jsx`; se conecta con
  `LOL_URL` y un token con acceso a ese repo.
- **Móvil**: `scripts/movil/` — `instalar.sh` (instalación), `ciclo.sh` →
  `tarea.sh` (cada vuelta), `bucle.sh`, `ordenes.sh` + `acciones.sh` (órdenes
  del panel, lista cerrada), `publicar.sh`.
- **Vigilante**: `scripts/vigilante/revisar.mjs` y
  `.github/workflows/vigilante-movil.yml`.
- **Pruebas**: `for t in scripts/test-*.mjs; do grep -q playwright $t && continue; node --no-warnings $t; done`
  y `npx next build`.

## Reglas que ha enseñado este proyecto
- **Nunca romper el latido del móvil.** El móvil ejecuta en la vuelta
  siguiente lo que se suba a `scripts/movil/`, y si eso falla se queda roto sin
  que nadie lo vea. `estado.json` se escribe y se sube pase lo que pase; todo
  lo nuevo va después y sin poder tumbarlo.
- **Simular antes de subir.** Cualquier cambio en `scripts/movil/`:
  `bash scripts/movil/probar.sh`. Si toca `instalar.sh` o lo que instala,
  también `bash scripts/movil/ensayo-recuperacion.sh`.
- **En el trabajo de diseño, el backend no se toca** (`lib/cinemas`,
  `app/api`, `scripts/movil`, `lib/panel`).
- **El repositorio es público**: nada de secretos, IPs, MACs, correos ni
  números de serie en el código ni en los informes del móvil. Lo que publica el
  móvil pasa por `filtrar()` de `scripts/movil/ordenes.mjs`.
- Comentarios y documentación en castellano, explicando **por qué**.

## Si el móvil se rompe
→ [`docs/movil/RECUPERACION.md`](docs/movil/RECUPERACION.md): lo que hace
Jaime (tres apps, un comando, un código, ajustes de batería) y lo que se
comprueba después a distancia.
