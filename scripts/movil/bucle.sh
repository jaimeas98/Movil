#!/data/data/com.termux/files/usr/bin/bash
# Bucle propio del recolector: una vuelta cada 15 minutos, sin depender del
# planificador de Android, y entre vuelta y vuelta, cada minuto, las órdenes
# del panel de control.
#
# POR QUÉ (13-10-2026)
# Con el móvil bloqueado, MIUI retrasa o se salta las tareas del planificador
# de Android: hubo huecos de 40 minutos y luego más de una hora sin ninguna
# vuelta. Un proceso de Termux con el "wake lock" tomado y la batería "sin
# restricciones" sí se mantiene despierto, así que el ritmo lo lleva este
# bucle. El planificador sigue programado como red de seguridad: si este bucle
# muere, la siguiente vuelta que consiga lanzar Android lo vuelve a arrancar
# (ver tarea.sh).
#
# ÓRDENES DEL PANEL (17-10-2026)
# Cada minuto se lanza ~/.recolector/ordenes.sh, que mira (barato) si el panel
# ha dejado órdenes nuevas en la rama `ordenes-movil`. Las vueltas siguen
# empezando cada 15 minutos, contados desde el principio de la anterior.
#
# SE ACTUALIZA SOLO
# tarea.sh copia este fichero a ~/.recolector/bucle.sh en cada vuelta. Entre
# minuto y minuto, si el fichero ha cambiado, el bucle se vuelve a ejecutar a
# sí mismo (exec: mismo proceso, mismo candado) con la versión nueva, sin
# perder el ritmo de las vueltas.
#
# Es mínimo a propósito: lo que cambie va en tarea.sh u ordenes.sh.

BASE="$HOME/.recolector"
YO="$BASE/bucle.sh"
# Solo para probar.sh: acortar los tiempos. En el móvil no existen.
VUELTA_S=${RECOLECTOR_VUELTA_S:-900}
MINUTO_S=${RECOLECTOR_MINUTO_S:-60}

# Un solo bucle a la vez: si ya hay uno, este sale. Se espera un poco por si
# el anterior se está cerrando (reinicio pedido desde el panel).
exec 8>"$BASE/bucle.candado"
flock -w 10 8 || exit 0
echo $$ > "$BASE/bucle.pid"

# El wake lock mantiene la CPU despierta con la pantalla apagada. El móvil está
# siempre enchufado, así que el gasto de batería da igual.
termux-wake-lock 2>/dev/null

huella() { cksum < "$YO" 2>/dev/null; }
mia=$(huella)

# Al volver de un exec, la vuelta siguiente es la que ya tocaba.
siguiente=${RECOLECTOR_SIGUIENTE_VUELTA:-0}
unset RECOLECTOR_SIGUIENTE_VUELTA

while true; do
  if [ "$(date +%s)" -ge "$siguiente" ]; then
    siguiente=$(( $(date +%s) + VUELTA_S ))
    bash "$BASE/ciclo.sh" </dev/null >/dev/null 2>&1 8>&-
  fi
  # Sin el candado (8>&-): si a este bucle lo matan mientras duerme, un sleep
  # huérfano no puede seguir reteniéndolo y dejar al siguiente sin arrancar.
  sleep "$MINUTO_S" 8>&-
  [ -f "$BASE/ordenes.sh" ] && bash "$BASE/ordenes.sh" </dev/null >/dev/null 2>&1 8>&-
  nueva=$(huella)
  if [ -n "$nueva" ] && [ "$nueva" != "$mia" ]; then
    RECOLECTOR_SIGUIENTE_VUELTA=$siguiente exec bash "$YO"
  fi
done
