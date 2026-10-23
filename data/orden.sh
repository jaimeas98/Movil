# Orden 9 (23-10-2026) — Tercera exploración de cineyelmo.com: leer el código
# de la web para encontrar la consulta GraphQL de los horarios de un cine y
# probarla con Bahía Sur. Resultado en ~/estado-movil/exploracion-yelmo3.json.
cd "$HOME/navegador" || exit 1
cp "$HOME/Movil/scripts/movil/recolector-navegador.mjs" ./recolector.mjs
cp "$HOME/Movil/scripts/movil/explorar-yelmo3.mjs" ./explorar3.mjs
DISPOSITIVO_MODELO="$(getprop ro.product.model 2>/dev/null)" \
DISPOSITIVO_ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
CHROME="$(command -v chromium-browser || command -v chromium)" \
DESTINO="$HOME/estado-movil/exploracion-yelmo3.json" \
timeout 280 node explorar3.mjs 2>&1 | tail -n 60
