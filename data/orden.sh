# Orden 6 — Repetir la prueba: Cloudflare ya deja pasar (portada 200), pero la
# petición fallaba dentro de la página por MicrosoftAjax. Ahora va en un mundo
# aislado. Chromium ya está instalado, así que cabe en los 5 minutos.
cd "$HOME/navegador" && cp "$HOME/Movil/scripts/movil/navegador-prueba.mjs" ./prueba.mjs
CHROME=$(command -v chromium-browser) timeout 200 node prueba.mjs 2>&1
