#!/data/data/com.termux/files/usr/bin/bash
# Bucle propio del recolector: una vuelta cada 15 minutos, sin depender del
# planificador de Android.
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
# Se copia a ~/.recolector/bucle.sh. Es mínimo a propósito: lo que cambie va
# en tarea.sh, que se actualiza solo en cada vuelta.

BASE="$HOME/.recolector"

# Un solo bucle a la vez: si ya hay uno, este sale.
exec 8>"$BASE/bucle.candado"
flock -n 8 || exit 0

# El wake lock mantiene la CPU despierta con la pantalla apagada. El móvil está
# siempre enchufado, así que el gasto de batería da igual.
termux-wake-lock 2>/dev/null

while true; do
  bash "$BASE/ciclo.sh" </dev/null >/dev/null 2>&1 8>&-
  sleep 900
done
