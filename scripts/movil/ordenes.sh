#!/data/data/com.termux/files/usr/bin/bash
# Órdenes del panel de control. Lo lanza el bucle (bucle.sh) CADA MINUTO, entre
# vuelta y vuelta, para que una orden del panel no espere los 15 minutos.
#
# POR QUÉ ASÍ
# El panel escribe las órdenes en la rama `ordenes-movil` (ordenes.json). Mirar
# si esa rama ha cambiado es barato (`git ls-remote`: una línea, sin bajar
# nada), así que se hace cada minuto; solo si ha cambiado se trae el fichero.
# Cada orden se ejecuta UNA vez (se recuerda su id en ~/.recolector, antes de
# empezar: aunque el móvil se apague a medias, no se repite), y solo si su
# acción está en la lista cerrada de acciones.sh.
#
# Nunca a la vez que una vuelta: se toma el mismo candado que ciclo.sh. Si hay
# una vuelta o una recogida en marcha, se espera al minuto siguiente.
#
# Se copia a ~/.recolector/ordenes.sh (lo hace tarea.sh), FUERA del
# repositorio, por lo mismo que ciclo.sh: aquí se hace `git reset` del código
# y bash no puede estar leyendo un fichero que se reescribe.
#
# El resultado va a ordenes-resultado.json en la rama de informes y se sube
# en el acto (publicar.sh).

set -u
DIR="$HOME/Movil"
DIR_ESTADO="$HOME/estado-movil"
BASE="$HOME/.recolector"
RAMA_APP="claude/puerto-santa-maria-restaurants-NxChu"
RAMA_ORDENES="ordenes-movil"
LOG="$BASE/ciclo.log"
RESULTADOS="$DIR_ESTADO/ordenes-resultado.json"
HECHAS="$BASE/ordenes-hechas"
# Acciones largas: se anota «en curso» y se publica antes de empezar, para que
# el panel sepa que el móvil la ha cogido.
LARGAS=" recoger recoger-yelmo respaldo probar-yelmo actualizar-paquetes "

cd "$DIR" 2>/dev/null || exit 0

sha=$(timeout 30 git ls-remote origin "refs/heads/$RAMA_ORDENES" 2>/dev/null | cut -f1)
[ -n "$sha" ] || exit 0                                         # sin red, o la rama aún no existe
[ "$sha" = "$(cat "$BASE/ordenes-sha" 2>/dev/null)" ] && exit 0  # nada nuevo

exec 9>"$BASE/candado"
flock -w "${RECOLECTOR_ESPERA_S:-30}" 9 || exit 0   # hay una vuelta en marcha: el minuto siguiente (ESPERA_S: solo probar.sh)
exec >>"$LOG" 2>&1
echo
echo "=== $(date '+%Y-%m-%d %H:%M:%S') órdenes del panel (rama en ${sha:0:7})"

if ! timeout 60 git fetch -q origin "+refs/heads/$RAMA_ORDENES:refs/remotes/origin/$RAMA_ORDENES"; then
  echo "no se pudieron traer las órdenes; el minuto siguiente"
  exit 0
fi
# El código al día, igual que al empezar una vuelta: las acciones usan la
# última versión de acciones.sh y tarea.sh.
if timeout 120 git fetch -q origin "$RAMA_APP"; then
  git reset --hard -q "origin/$RAMA_APP"
fi

ahora() { date +%s; }

anotar() {   # id accion estado inicio fin codigo  < salida
  ID="$1" ACCION="$2" ESTADO="$3" INICIO="$4" FIN="$5" CODIGO="$6" \
    node "$DIR/scripts/movil/ordenes.mjs" anotar "$RESULTADOS" \
    || echo "aviso: no se pudo anotar el resultado de $1"
}

publicar() { bash "$DIR/scripts/movil/publicar.sh" </dev/null; }

# El registro (ciclo.log) acaba en el informe público (registro.txt): lo que
# imprime una acción pasa antes por el mismo filtro que su resultado.
al_registro() {
  node "$DIR/scripts/movil/ordenes.mjs" filtrar || echo "(salida omitida: no se pudo filtrar)"
}

# nuevas también aplica los límites de cada acción (ordenes.mjs) y los apunta
# en ordenes-limites.json. Si falla, no se ejecuta nada ni se da la rama por
# vista: se vuelve a probar el minuto siguiente.
if ! nuevas=$(git show "origin/$RAMA_ORDENES:ordenes.json" 2>/dev/null \
  | node "$DIR/scripts/movil/ordenes.mjs" nuevas "$HECHAS" "$RESULTADOS" "$BASE/ordenes-limites.json" --motivos); then
  echo "no se pudieron leer las órdenes (ordenes.mjs ha fallado); el minuto siguiente"
  exit 0
fi

# Por el descriptor 3: lo que se ejecuta dentro no puede comerse la lista.
while IFS=$'\t' read -r -u 3 id accion tipo motivo; do
  [ -n "$id" ] || continue
  # Recordada ANTES de ejecutarla: una sola vez pase lo que pase.
  echo "$id" >> "$HECHAS"
  case "$tipo" in
    rechazada)
      echo "orden $id ($accion) rechazada: ${motivo:-acción no permitida}"
      printf 'rechazada: %s\n' "${motivo:-acción no permitida (no está en la lista de acciones.sh)}" \
        | anotar "$id" "$accion" rechazada "$(ahora)" "$(ahora)" 2
      publicar; continue ;;
    caducada)
      echo "orden $id ($accion) caducada: lleva más de 6 h esperando"
      echo "no se ha ejecutado: llevaba más de 6 h esperando a que el móvil la recogiera" \
        | anotar "$id" "$accion" caducada "$(ahora)" "$(ahora)" ""
      publicar; continue ;;
  esac

  inicio=$(ahora)
  echo "orden $id: $accion"
  if [ "$accion" = actualizar-paquetes ]; then
    # Larga (hasta 30 min): en segundo plano, con el candado de las vueltas
    # (heredado por el 9), así que nada más corre mientras tanto. El bucle
    # sigue mirando órdenes; esperarán a que acabe.
    echo "en marcha en segundo plano (hasta 30 min)" | anotar "$id" "$accion" en-curso "$inicio" "" ""
    publicar
    (
      trap '' HUP   # que acabar ordenes.sh (o el bucle) no la corte a medias
      salida=$(cd "$HOME" && timeout 1800 bash "$DIR/scripts/movil/acciones.sh" "$accion" </dev/null 2>&1); codigo=$?
      [ "$codigo" = 124 ] && salida="$salida"$'\n'"(cortada a los 30 minutos)"
      printf '%s\n' "$salida" | al_registro >> "$LOG"
      estado=hecha; [ "$codigo" = 0 ] || estado=fallida
      printf '%s\n' "$salida" | anotar "$id" "$accion" "$estado" "$inicio" "$(ahora)" "$codigo"
      publicar >> "$LOG" 2>&1
      echo "orden $id: $accion terminada (código $codigo)" >> "$LOG"
    ) </dev/null >/dev/null 2>&1 &
    # Lo que quede en la lista, en la próxima pasada (tras la actualización).
    break
  fi

  case "$LARGAS" in *" $accion "*)
    echo "en marcha…" | anotar "$id" "$accion" en-curso "$inicio" "" ""
    publicar ;;
  esac
  salida=$(cd "$HOME" && RECOLECTOR_ORDEN="$id" timeout 900 bash "$DIR/scripts/movil/acciones.sh" "$accion" </dev/null 2>&1); codigo=$?
  [ "$codigo" = 124 ] && salida="$salida"$'\n'"(cortada a los 15 minutos)"
  printf '%s\n' "$salida" | al_registro
  estado=hecha; [ "$codigo" = 0 ] || estado=fallida
  printf '%s\n' "$salida" | anotar "$id" "$accion" "$estado" "$inicio" "$(ahora)" "$codigo"
  echo "orden $id: código $codigo"
  publicar
done 3<<< "$nuevas"

# Visto: hasta que la rama vuelva a cambiar no se mira más. (Si una orden se
# ha quedado sin hacer por la actualización en segundo plano, no se marca:
# se vuelve a mirar en la pasada siguiente.)
if ! jobs -p | grep -q .; then echo "$sha" > "$BASE/ordenes-sha"; fi
tail -n 200 "$HECHAS" > "$HECHAS.tmp" 2>/dev/null && mv -f "$HECHAS.tmp" "$HECHAS"
exit 0
