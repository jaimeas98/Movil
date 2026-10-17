#!/data/data/com.termux/files/usr/bin/bash
# Sube el informe del móvil (todo lo que haya en ~/estado-movil) a la rama
# `estado-movil`. Lo usan tarea.sh al final de cada vuelta y ordenes.sh tras
# cada orden del panel, siempre con el candado de las vueltas tomado: así
# nunca hay dos procesos reescribiendo esa rama a la vez.
#
# La rama de informes guarda solo el ÚLTIMO: se reescribe siempre el mismo
# commit en vez de acumular 48 al día que no le interesan a nadie.

DIR="$HOME/Movil"
DIR_ESTADO="$HOME/estado-movil"
RAMA_ESTADO="estado-movil"

# El vigilante de GitHub se dispara con cada informe, y para eso su workflow
# tiene que estar también en esta rama (GitHub usa el de la rama empujada).
mkdir -p "$DIR_ESTADO/.github/workflows"
cp "$DIR/.github/workflows/vigilante-movil.yml" "$DIR_ESTADO/.github/workflows/" 2>/dev/null || true
# Y un vercel.json propio: Vercel lee la configuración del commit que le llega,
# y sin él intentaba desplegar cada informe como si fuera la web (un "Error"
# en la lista de despliegues cada 15 minutos).
printf '{ "git": { "deploymentEnabled": { "estado-movil": false } } }\n' > "$DIR_ESTADO/vercel.json"

git -C "$DIR_ESTADO" add -A
git -C "$DIR_ESTADO" commit -q --amend -m "Informe del recolector — $(date '+%Y-%m-%d %H:%M')"
if ! git -C "$DIR_ESTADO" push -q --force origin "$RAMA_ESTADO"; then
  # Si GitHub no deja a esta clave subir ficheros de workflow, el informe
  # (el latido) tiene que llegar igual: se reintenta sin el workflow.
  git -C "$DIR_ESTADO" rm -rq --cached .github 2>/dev/null && rm -rf "$DIR_ESTADO/.github" \
    && git -C "$DIR_ESTADO" commit -q --amend -m "Informe del recolector — $(date '+%Y-%m-%d %H:%M')" \
    && git -C "$DIR_ESTADO" push -q --force origin "$RAMA_ESTADO" \
    && echo "aviso: informe subido sin el workflow del vigilante" \
    || { echo "aviso: no se pudo subir el informe"; exit 1; }
fi
exit 0
