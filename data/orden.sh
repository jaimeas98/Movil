# Orden 10 (23-10-2026) — Primera prueba de verdad del recolector NUEVO de
# Yelmo (cineyelmo.com + api-g.cinepolis.com), sin escribir nada
# (--solo-probar). Lo que interesa ver en orden-salida.txt:
#  · qué cabeceras ha copiado de la web (solo sus NOMBRES: los valores pueden
#    ser una clave y este informe es público);
#  · si el API filtra la cartelera por cine y si admite los dos cines a la vez;
#  · por cine: días, películas y sesiones, y las tres primeras como ejemplo;
#  · la "muestra del API": la forma real de una sesión (fecha, hora, sala,
#    idioma, formato), que hasta hoy no se había podido ver;
#  · cuánto tarda (tarea.sh le da 240 s).
# En esta misma vuelta, antes, tarea.sh ya habrá reintentado la recogida
# normal con este mismo recolector (ha cambiado tras un fallo).
cd "$HOME/navegador" || exit 1
cp "$HOME/Movil/scripts/movil/recolector-navegador.mjs" ./recolector.mjs
inicio=$(date +%s)
DISPOSITIVO_MODELO="$(getprop ro.product.model 2>/dev/null)" \
DISPOSITIVO_ANDROID="$(getprop ro.build.version.release 2>/dev/null)" \
CHROME="$(command -v chromium-browser || command -v chromium)" \
timeout 240 node recolector.mjs --solo-probar 2>&1 \
  | node "$HOME/Movil/scripts/movil/ordenes.mjs" filtrar | tail -n 80
r=${PIPESTATUS[0]}
echo "────────────────────────────────────────"
echo "salida del recolector: $r$([ "$r" = 124 ] && echo ' (cortado a los 240 s)') · $(( $(date +%s) - inicio )) s en total"
