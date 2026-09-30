#!/data/data/com.termux/files/usr/bin/bash
# Arranque de cada vuelta del recolector. Lo lanza el planificador de Android
# cada 30 minutos.
#
# Este fichero se copia FUERA del repositorio (~/.recolector/ciclo.sh) y es
# mínimo a propósito: trae la última versión del código y le pasa el control a
# tarea.sh, que sí vive en el repositorio. Si la lógica estuviera aquí mismo,
# `git reset` reescribiría el fichero mientras bash lo está leyendo —bash lee
# los scripts por trozos, no de una vez— y la vuelta haría cosas imprevisibles.
#
# Por eso casi nunca hará falta tocar este fichero: todo lo que cambie va en
# tarea.sh, y el móvil lo recoge solo en la vuelta siguiente.

DIR="$HOME/Movil"
BASE="$HOME/.recolector"
RAMA="claude/puerto-santa-maria-restaurants-NxChu"
LOG="$BASE/ciclo.log"

mkdir -p "$BASE"
exec >>"$LOG" 2>&1
echo
echo "=== $(date '+%Y-%m-%d %H:%M:%S') vuelta"

# Evita dos vueltas a la vez si una se alarga (red lenta, Yelmo tardando).
# flock libera el candado solo aunque el proceso muera a medias.
exec 9>"$BASE/candado"
if ! flock -n 9; then
  echo "ya hay otra vuelta en marcha; salgo"
  exit 0
fi

cd "$DIR" || { echo "no existe $DIR"; exit 1; }

# Aquí es donde llegan los arreglos: lo que haya en el repositorio manda. Si
# no hay red se sigue con el código que ya estaba, no se aborta la vuelta.
if git fetch --quiet origin "$RAMA"; then
  git reset --hard --quiet "origin/$RAMA"
  echo "código al día: $(git rev-parse --short HEAD)"
else
  echo "aviso: sin red para actualizar el código; sigo con $(git rev-parse --short HEAD)"
fi

# exec conserva el descriptor 9, así que el candado sigue tomado durante tarea.sh.
exec bash "$DIR/scripts/movil/tarea.sh"
