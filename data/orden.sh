# Orden 5 — Repetir la prueba con Chromium identificándose como el Chrome
# normal del móvil. Ya está instalado (orden 4), así que va rápido y cabe en
# los 5 minutos de una orden.
cd "$HOME/navegador" && cp "$HOME/Movil/scripts/movil/navegador-prueba.mjs" ./prueba.mjs
CHROME=$(command -v chromium-browser) timeout 200 node prueba.mjs 2>&1
