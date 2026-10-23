# Orden 7 (23-10-2026) — Yelmo ha cambiado su web (ahora "Cinépolis") y la
# recogida falla. Explorar de dónde saca ahora la cartelera, para reescribir
# el recolector. El resultado va a ~/estado-movil/exploracion-yelmo.json, que
# se publica con el informe.
cd "$HOME/navegador" || exit 1
cp "$HOME/Movil/scripts/movil/recolector-navegador.mjs" ./recolector.mjs
cp "$HOME/Movil/scripts/movil/explorar-yelmo.mjs" ./explorar.mjs
DISPOSITIVO_MODELO="$(getprop ro.product.model 2>/dev/null)" \
DISPOSITIVO_ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
CHROME="$(command -v chromium-browser || command -v chromium)" \
DESTINO="$HOME/estado-movil/exploracion-yelmo.json" \
timeout 270 node explorar.mjs 2>&1 | tail -n 40
