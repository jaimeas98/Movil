# Orden 8 (23-10-2026) — Segunda exploración de la web nueva de Yelmo
# (cineyelmo.com): recorrerla como una persona hasta los horarios de Bahía Sur
# para ver qué operación GraphQL los trae, y probar si su API responde sin
# navegador. Resultado en ~/estado-movil/exploracion-yelmo2.json.
cd "$HOME/navegador" || exit 1
cp "$HOME/Movil/scripts/movil/recolector-navegador.mjs" ./recolector.mjs
cp "$HOME/Movil/scripts/movil/explorar-yelmo2.mjs" ./explorar2.mjs
DISPOSITIVO_MODELO="$(getprop ro.product.model 2>/dev/null)" \
DISPOSITIVO_ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
CHROME="$(command -v chromium-browser || command -v chromium)" \
DESTINO="$HOME/estado-movil/exploracion-yelmo2.json" \
timeout 280 node explorar2.mjs 2>&1 | tail -n 40
