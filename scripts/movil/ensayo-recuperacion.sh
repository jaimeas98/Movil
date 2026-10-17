#!/usr/bin/env bash
# Ensayo de un CAMBIO DE MÓVIL, de principio a fin: el móvil recolector se ha
# roto (no queda nada de él) y se instala uno nuevo con el comando de siempre.
# Para ejecutar ANTES de subir cambios a scripts/movil/instalar.sh (o a lo que
# instala), igual que probar.sh para las vueltas:
#
#   bash scripts/movil/ensayo-recuperacion.sh
#
# Monta un Termux recién instalado (HOME vacío; pkg, npm, gh, ssh, getprop y
# termux-* falsos que apuntan lo que se les pide), un "GitHub" local que ya
# tiene lo que dejó el móvil anterior (sus ramas estado-movil y ordenes-movil,
# su clave, órdenes ya hechas y una a medias, una data/orden.sh ya ejecutada) y
# un Yelmo y un Chromium simulados como en probar.sh. Y ejecuta el instalar.sh
# DE VERDAD, leído por una tubería como con `curl | bash`.
#
# Lo único que cambia respecto al móvil son ENSAYO_REPO (el GitHub local en vez
# de git@github.com) y ENSAYO_TTY (lo que "teclea" Jaime). No toca la red ni
# el repositorio real.
set -u
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
RAMA=claude/puerto-santa-maria-restaurants-NxChu
SLUG=jaimeas98/Movil
S=$(mktemp -d)
limpiar() { pkill -f "$S/home/.recolector/bucle.sh" 2>/dev/null; sleep 1; rm -rf "$S"; }
trap limpiar EXIT
mkdir -p "$S/bin" "$S/usr/bin" "$S/home" "$S/reg" "$S/fuera-home"
REG="$S/reg"; DB="$S/claves-github.tsv"; H="$S/home"

fallos=0; ok(){ echo "ok    $*"; }; mal(){ echo "FALLO $*"; fallos=$((fallos+1)); }
ahora_iso(){ date -u -d "${1:-now}" +%Y-%m-%dT%H:%M:%S.000Z; }

# ── El mundo de fuera: Jaime, GitHub y lo que dejó el móvil anterior ─────────
# Con su propia configuración de git: el móvil nuevo NO la tiene (así se ve que
# instalar.sh pone la suya).
printf '[user]\n\tname = fuera\n\temail = fuera@x\n[init]\n\tdefaultBranch = main\n' > "$S/gitconfig-fuera"
fuera(){ GIT_CONFIG_GLOBAL="$S/gitconfig-fuera" HOME="$S/fuera-home" "$@"; }

# La rama de la web con el estado ACTUAL del directorio de trabajo, cambios sin
# commitear incluidos (lo que se va a subir), y una data/orden.sh que el móvil
# anterior ya ejecutó.
fuera git clone -q --bare "$RAIZ" "$S/github.git"
W="$S/fuera/web"
fuera git clone -q --branch "$RAMA" "$S/github.git" "$W" 2>/dev/null || { fuera git clone -q "$S/github.git" "$W"; fuera git -C "$W" checkout -q -B "$RAMA"; }
cp -r "$RAIZ/scripts" "$RAIZ/data" "$RAIZ/lib" "$RAIZ/.github" "$W/"
rm -f "$W/data/forzar-recogida"
printf 'touch "$HOME/orden-vieja-ejecutada"\necho orden del movil anterior\n' > "$W/data/orden.sh"
( cd "$W" && fuera git add -A && fuera git commit -qm "estado a ensayar" --allow-empty && fuera git push -q -f origin "HEAD:$RAMA" )
INICIO_WEB=$(git -C "$W" rev-parse HEAD)

# estado-movil tal como la dejó el móvil anterior: callado desde hace 3 h, con
# la batería al 7 %, 7 días de historial y una orden ya hecha.
E="$S/fuera/estado"; mkdir -p "$E"
( cd "$E" && fuera git init -q && fuera git remote add origin "$S/github.git" && fuera git checkout -q --orphan estado-movil )
echo "Informes del recolector del móvil (rama del móvil anterior)." > "$E/LEEME.txt"
cat > "$E/estado.json" <<EOF
{ "vuelta": "$(ahora_iso '3 hours ago')", "resultado": "sin recogida: no tocaba", "motivo": null, "error": null,
  "ultimaRecogida": "$(ahora_iso '10 hours ago')", "proximaRecogida": "$(ahora_iso '2 hours')", "codigo": "viejo00",
  "dispositivo": { "modelo": "Mi Note 10 Lite", "android": "12", "node": "v24.0.0" },
  "bateria": { "porcentaje": 7, "cargando": false, "estado": "GOOD", "temperatura": 30, "ritmoPorHora": 4, "horasHastaReserva": 0, "desenchufadoDesde": "$(ahora_iso '20 hours ago')" } }
EOF
for h in 4 3 2; do echo "{\"t\":\"$(ahora_iso "$h hours ago")\",\"resultado\":\"vuelta del movil anterior\",\"bateria\":7,\"cargando\":false,\"codigo\":\"viejo00\",\"orden\":null}"; done > "$E/historial.jsonl"
echo "{\"t\":\"$(ahora_iso '10 hours ago')\",\"motivo\":\"turno de las 07:00\",\"resultado\":\"recogida y publicada\",\"duracionS\":60,\"orden\":null,\"partes\":[\"yelmo\",\"respaldo\"],\"cines\":{}}" > "$E/recogidas.jsonl"
echo "[{\"t\":$(( ($(date +%s) - 3*3600) * 1000 )),\"pct\":7,\"cargando\":false}]" > "$E/bateria-historial.json"
OA=o-20261017-0900-aa01; OC=o-20261017-1150-cc03
cat > "$E/ordenes-resultado.json" <<EOF
{ "actualizado": "$(ahora_iso '3 hours ago')", "resultados": [
  { "id": "$OA", "accion": "diagnostico", "estado": "hecha", "inicio": "$(ahora_iso '3 hours ago')", "fin": "$(ahora_iso '3 hours ago')", "codigo": 0, "salida": "hecha por el movil anterior" } ] }
EOF
( cd "$E" && fuera git add -A && fuera git commit -qm "Informe del recolector" && fuera git push -q -u origin estado-movil )

# ordenes-movil: una orden que el anterior ya hizo y otra que se quedó sin hacer
# (se pidió cuando ya había muerto).
O="$S/fuera/ordenes"; mkdir -p "$O"
( cd "$O" && fuera git init -q && fuera git remote add origin "$S/github.git" && fuera git checkout -q --orphan ordenes-movil )
cat > "$O/ordenes.json" <<EOF
{ "ordenes": [
  { "id": "$OA", "accion": "diagnostico", "pedida": "$(ahora_iso '3 hours ago')", "parametros": {} },
  { "id": "$OC", "accion": "recoger", "pedida": "$(ahora_iso '20 minutes ago')", "parametros": {} } ] }
EOF
( cd "$O" && fuera git add -A && fuera git commit -qm "órdenes" && fuera git push -q origin ordenes-movil )
# orden id accion: la añade como lo hace el panel.
orden(){
  ( cd "$O" && fuera git pull -q --rebase origin ordenes-movil && ID="$1" ACCION="$2" PEDIDA="$(ahora_iso)" node -e '
    const fs=require("fs"); const d=JSON.parse(fs.readFileSync("ordenes.json","utf8"));
    d.ordenes.push({id:process.env.ID,accion:process.env.ACCION,pedida:process.env.PEDIDA,parametros:{}});
    fs.writeFileSync("ordenes.json",JSON.stringify({ordenes:d.ordenes.slice(-20)},null,2));' \
    && fuera git add -A && fuera git commit -qm "orden $1" && fuera git push -q origin ordenes-movil )
}

# Las claves de GitHub (deploy keys): la del móvil roto y otra que no es suya.
printf '101\trecolector-movil (Mi Note 10 Lite)\tssh-ed25519 AAAAvieja-del-movil-roto\n102\totra-cosa (no tocar)\tssh-ed25519 AAAAotra-que-no-es-del-movil\n' > "$DB"

# ── El Termux falso del móvil nuevo ─────────────────────────────────────────
b(){ cat > "$S/bin/$1"; chmod +x "$S/bin/$1"; }
b getprop <<'EOF'
#!/bin/sh
case "$1" in
  ro.product.model) echo "Pixel 7" ;;
  ro.product.manufacturer) echo "Google" ;;
  ro.build.version.release) echo "14" ;;
  persist.sys.timezone) echo "Europe/Madrid" ;;
esac
EOF
for c in termux-wake-lock termux-wake-unlock; do printf '#!/bin/sh\nexit 0\n' | b "$c"; done
b termux-job-scheduler <<EOF
#!/bin/sh
echo "\$*" >> "$REG/job"
EOF
b termux-battery-status <<'EOF'
#!/bin/sh
echo '{"percentage": 64, "plugged": "PLUGGED_AC", "health": "GOOD", "temperature": 28.0}'
EOF
# Sin red: curl solo para ficheros locales.
b curl <<EOF
#!/bin/sh
for a in "\$@"; do case "\$a" in http://*|https://*) exit 7;; esac; done
exec $(command -v curl) "\$@"
EOF
# pkg apunta lo que se le pide; «instalar» Chromium deja un chromium-browser.
b pkg <<EOF
#!/bin/sh
echo "\$*" >> "$REG/pkg"
case " \$* " in *" install "*" chromium "*)
  printf '#!/bin/sh\necho "Chromium 155.0.8059.39"\n' > "$S/usr/bin/chromium-browser"; chmod +x "$S/usr/bin/chromium-browser" ;;
esac
exit 0
EOF
# npm: «instalar» puppeteer-core deja el simulado (abajo).
b npm <<EOF
#!/bin/sh
echo "\$*" >> "$REG/npm"
case "\$1" in
  init) echo '{"name":"navegador","version":"1.0.0"}' > package.json ;;
  install) for a in "\$@"; do [ "\$a" = puppeteer-core ] && { mkdir -p node_modules && cp -r "$S/puppeteer-simulado" node_modules/puppeteer-core; }; done ;;
esac
exit 0
EOF
b ssh-keygen <<EOF
#!/bin/sh
while [ \$# -gt 0 ]; do case "\$1" in -f) f=\$2; shift;; -C) c=\$2; shift;; esac; shift; done
printf -- '-----BEGIN OPENSSH PRIVATE KEY-----\nENSAYO-CLAVE-PRIVADA\n-----END OPENSSH PRIVATE KEY-----\n' > "\$f"; chmod 600 "\$f"
echo "ssh-ed25519 AAAAnueva-\$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n') \$c" > "\$f.pub"
echo "\$f" >> "$REG/ssh-keygen"
EOF
b ssh-keyscan <<'EOF'
#!/bin/sh
echo "github.com ssh-ed25519 AAAAhuella-de-github"
EOF
# `ssh -T git@github.com`: GitHub acepta la clave si está entre las suyas.
b ssh <<EOF
#!/bin/sh
pub=\$(cut -d' ' -f1,2 "\$HOME/.ssh/id_recolector.pub" 2>/dev/null)
if [ -n "\$pub" ] && cut -f3 "$DB" | grep -qxF "\$pub"; then
  echo "Hi $SLUG! You've successfully authenticated, but GitHub does not provide shell access."; exit 1
fi
echo "git@github.com: Permission denied (publickey)."; exit 255
EOF
# gh: el flujo del código, deploy keys y la API de claves, contra $DB.
# ENSAYO_GH_FALLA=login: escribe el token y luego falla (un corte a medias).
b gh <<EOF
#!/usr/bin/env bash
T="\$HOME/.config/gh/hosts.yml"
echo "\$*" >> "$REG/gh"
sesion(){ [ -f "\$T" ] || { echo "gh: no has iniciado sesión" >&2; exit 4; }; }
case "\$1 \$2" in
  "auth login")
    [ "\${BROWSER:-}" = true ] || echo "BROWSER no es true" >> "$REG/gh-mal"
    case " \$* " in *" --web "*) ;; *) echo "sin --web" >> "$REG/gh-mal" ;; esac
    echo "! First copy your one-time code: ENSA-YO42"; printf 'Press Enter to open github.com in your browser... '
    read -r _ || echo "no había teclado" >> "$REG/gh-mal"
    mkdir -p "\$(dirname "\$T")"; printf 'github.com:\n    oauth_token: gho_EnsayoTokenTemporal0123456789abcdef\n    user: jaimeas98\n' > "\$T"
    [ "\${ENSAYO_GH_FALLA:-}" = login ] && { echo "error de red a medias" >&2; exit 1; }
    echo "✓ Logged in as jaimeas98" ;;
  "auth logout") rm -f "\$T"; echo "✓ Logged out" ;;
  "repo deploy-key")
    sesion; f=\$4; titulo=""; shift 4
    while [ \$# -gt 0 ]; do case "\$1" in --title) titulo=\$2; shift;; --allow-write) rw=1;; esac; shift; done
    clave=\$(cut -d' ' -f1,2 "\$f")
    if cut -f3 "$DB" | grep -qxF "\$clave"; then echo "key is already in use" >&2; exit 1; fi
    id=\$(( \$(cut -f1 "$DB" | sort -n | tail -n1) + 1 ))
    printf '%s\t%s\t%s\n' "\$id" "\$titulo" "\$clave" >> "$DB"; echo "✓ Deploy key added" ;;
  "api repos/$SLUG/keys")
    sesion; jq_expr=""; shift 2
    while [ \$# -gt 0 ]; do case "\$1" in --jq) jq_expr=\$2; shift;; esac; shift; done
    json=\$(node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean).map(x=>x.split("\t"));console.log(JSON.stringify(l.map(([id,title,key])=>({id:Number(id),title,key,read_only:false}))))' "$DB")
    # Con jq de verdad si lo hay: así se prueba la expresión que usa instalar.sh.
    if [ -n "\$jq_expr" ] && command -v jq >/dev/null; then printf '%s' "\$json" | jq -r "\$jq_expr"
    else printf '%s' "\$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>JSON.parse(s).forEach(k=>console.log([k.id,k.title,k.key].join("\t"))))'; fi ;;
  "api -X")
    sesion; [ "\$3" = DELETE ] || exit 2; id=\${4##*/}
    case "\$4" in repos/$SLUG/keys/*) ;; *) exit 2 ;; esac
    grep -q "^\$id	" "$DB" || exit 1
    grep -v "^\$id	" "$DB" > "$DB.tmp"; mv "$DB.tmp" "$DB" ;;
  *) echo "gh simulado: no sé hacer «\$*»" >&2; exit 2 ;;
esac
EOF

# puppeteer-core simulado: el recolector real se ejecuta entero; apunta con qué
# identidad se presenta Chromium.
P="$S/puppeteer-simulado"; mkdir -p "$P"
echo '{"name":"puppeteer-core","version":"0.0.0-ensayo","type":"module","exports":"./index.js"}' > "$P/package.json"
cat > "$P/index.js" <<'EOF'
import { appendFileSync } from 'node:fs';
const hoy = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid' }).format(new Date());
const cine = (Key) => ({ Key, VistaId: '1', Dates: [{ Movies: [{ Title: 'Peli ' + Key, RunTime: 100,
  Formats: [{ Name: '2D', Language: 'Español', Showtimes: [{ Time: '20:00', ShowtimeId: '1', TimeFilter: hoy + ' 22:30:00' }] }] }] }] });
let chrome = null;
const pagina = {
  setUserAgent: async (ua, meta) => { appendFileSync(process.env.ENSAYO_UA, JSON.stringify({ ua, meta, chrome }) + '\n'); },
  setViewport: async () => {}, setExtraHTTPHeaders: async () => {},
  evaluateOnNewDocument: async () => {}, title: async () => 'Yelmo Cines',
  goto: async () => ({ status: () => 200 }),
  createCDPSession: async () => ({ send: async (m) => {
    if (m === 'Page.getFrameTree') return { frameTree: { frame: { id: 'f' } } };
    if (m === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    return { result: { value: { status: 200, texto: JSON.stringify({ d: { Cinemas: [cine('premium-bahia-sur'), cine('area-sur')] } }) } } };
  } }),
};
export default { launch: async (o) => { chrome = o.executablePath; return { newPage: async () => pagina, version: async () => 'Chrome/155.0.8059.39', close: async () => {} }; } };
EOF
echo "globalThis.fetch = async () => { throw new Error('sin red en el ensayo'); };" > "$S/sin-red.mjs"

printf '\n' > "$S/teclado"   # el Intro que pide gh
export HOME="$H" PATH="$S/usr/bin:$S/bin:$PATH" ENSAYO_REPO="$S/github.git" ENSAYO_TTY="$S/teclado" \
  ENSAYO_UA="$REG/ua" NODE_OPTIONS="--import $S/sin-red.mjs" \
  RECOLECTOR_MINUTO_S=1 RECOLECTOR_VUELTA_S=3600   # el bucle, deprisa (ver bucle.sh)
unset GIT_CONFIG_GLOBAL RECOLECTOR_SIN_BUCLE AHORA_PRUEBA

instalar(){ cat "$RAIZ/scripts/movil/instalar.sh" | timeout 300 bash > "$S/salida-$1.txt" 2>&1; }
G(){ git -C "$S/github.git" "$@"; }
E_(){ G show "estado-movil:$1" 2>/dev/null; }
campo(){ E_ estado.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)$1)}catch{console.log('')}})"; }
R(){ E_ ordenes-resultado.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const r=JSON.parse(s).resultados.find(x=>x.id==='$1');console.log(r?r$2:'')}catch{console.log('')}})"; }
bucles(){ pgrep -fc "$H/.recolector/bucle.sh" 2>/dev/null; true; }

# ── 1er intento: la autorización se corta a medias ──────────────────────────
export ENSAYO_GH_FALLA=login; instalar 1; r=$?; unset ENSAYO_GH_FALLA
[ "$r" != 0 ] && [ ! -f "$H/.config/gh/hosts.yml" ] && ! grep -rqs --exclude-dir=Movil gho_Ensayo "$H" \
  && ok "si la instalación se corta con el permiso temporal puesto, no se queda en el móvil" \
  || mal "corte a medias: salida $r, hosts.yml $( [ -f "$H/.config/gh/hosts.yml" ] && echo SIGUE || echo borrado)"

# ── 2º intento: el mismo comando, de principio a fin ────────────────────────
instalar 2; r=$?
[ "$r" = 0 ] && ok "el mismo comando, otra vez, instala de principio a fin" || { mal "instalar.sh salió con $r"; tail -n 40 "$S/salida-2.txt"; }

# Paquetes
p=$(cat "$REG/pkg" 2>/dev/null)
falta=""; for x in git nodejs-lts openssh termux-api util-linux procps gh x11-repo; do echo "$p" | grep -E "^install .* $x( |$)" -q || falta="$falta $x"; done
echo "$p" | grep -q '^update -y' && echo "$p" | grep -q '^upgrade -y' && [ -z "$falta" ] \
  && ok "pide los paquetes (update, upgrade y git nodejs-lts openssh termux-api util-linux procps gh x11-repo)" || mal "paquetes: faltan$falta"
lx=$(grep -n 'x11-repo' "$REG/pkg" | head -n1 | cut -d: -f1); lc=$(grep -n ' chromium' "$REG/pkg" | head -n1 | cut -d: -f1)
[ -n "$lc" ] && [ "$lc" -gt "$lx" ] && sed -n "$((lx+1)),$((lc-1))p" "$REG/pkg" | grep -q '^update' \
  && ok "Chromium, después de x11-repo y de leer su índice" || mal "orden de Chromium: x11-repo en $lx, chromium en $lc"
grep -q 'install .*puppeteer-core' "$REG/npm" 2>/dev/null && [ -d "$H/navegador/node_modules/puppeteer-core" ] \
  && ok "puppeteer-core en ~/navegador" || mal "puppeteer-core"

# Clave y permiso temporal
[ -f "$H/.ssh/id_recolector" ] && [ -f "$H/.ssh/id_recolector.pub" ] && grep -q "IdentityFile ~/.ssh/id_recolector" "$H/.ssh/config" \
  && ok "crea la clave del móvil y la configura para github.com" || mal "clave del móvil"
nueva=$(cut -d' ' -f1,2 "$H/.ssh/id_recolector.pub")
grep -qF "$nueva" "$DB" && grep -F "$nueva" "$DB" | cut -f2 | grep -q '^recolector-movil (Pixel 7, [0-9-]*)$' \
  && ok "registra la clave nueva en GitHub («$(grep -F "$nueva" "$DB" | cut -f2)»)" || mal "clave nueva en GitHub: $(cat "$DB")"
! grep -q 'AAAAvieja-del-movil-roto' "$DB" && ok "BORRA de GitHub la clave del móvil roto" || mal "la clave del móvil roto sigue en GitHub"
grep -q 'AAAAotra-que-no-es-del-movil' "$DB" && ok "y deja las claves que no son de un móvil recolector" || mal "¡ha borrado una clave que no era suya!"
[ "$(grep -c 'recolector-movil' "$DB")" = 1 ] && ok "queda una sola clave de móvil" || mal "claves de móvil: $(grep -c recolector-movil "$DB")"
# (El token falso sí aparece en ~/Movil: es este mismo script, clonado.)
[ ! -f "$H/.config/gh/hosts.yml" ] && grep -q '^auth logout' "$REG/gh" && ! grep -rqs --exclude-dir=Movil gho_Ensayo "$H" \
  && ok "el permiso temporal se borra del móvil (logout y hosts.yml)" || mal "el token temporal sigue en el móvil"
[ ! -s "$REG/gh-mal" ] && ok "gh: con el código (--web), sin abrir navegador y leyendo de la terminal" || mal "gh: $(cat "$REG/gh-mal")"

# Repositorio y ramas
[ "$(git -C "$H/Movil" rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$RAMA" ] && [ "$(git -C "$H/Movil" config user.name)" = "Recolector (móvil)" ] \
  && ok "el código, clonado en la rama de la web y con su identidad" || mal "rama del código: $(git -C "$H/Movil" rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ "$(git -C "$H/estado-movil" rev-parse --abbrev-ref HEAD 2>/dev/null)" = estado-movil ] && E_ LEEME.txt | grep -q "rama del móvil anterior" \
  && [ "$(G rev-list --count estado-movil)" = 1 ] \
  && ok "estado-movil se CLONA (la del móvil anterior), no se crea de nuevo, y sigue con un solo commit" || mal "estado-movil: $(E_ LEEME.txt)"

# Programado
esperado="#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
termux-job-scheduler --job-id 7 --script $H/.recolector/ciclo.sh --period-ms 900000 --persisted true --network any
nohup bash $H/.recolector/bucle.sh </dev/null >/dev/null 2>&1 &"
[ "$(cat "$H/.termux/boot/recolector.sh" 2>/dev/null)" = "$esperado" ] && [ -x "$H/.termux/boot/recolector.sh" ] \
  && ok "Termux:Boot: wake lock, tarea de Android y bucle al encender" || mal "Termux:Boot: $(cat "$H/.termux/boot/recolector.sh" 2>/dev/null)"
grep -q -- "--job-id 7 --script $H/.recolector/ciclo.sh --period-ms 900000 --persisted true --network any" "$REG/job" 2>/dev/null \
  && ok "tarea de Android cada 15 min (red de seguridad)" || mal "planificador: $(cat "$REG/job" 2>/dev/null)"
for f in ciclo.sh bucle.sh ordenes.sh; do cmp -s "$H/Movil/scripts/movil/$f" "$H/.recolector/$f" || mal "falta ~/.recolector/$f al día"; done
sleep 1
! flock -n "$H/.recolector/bucle.candado" true && [ "$(bucles)" = 1 ] && kill -0 "$(cat "$H/.recolector/bucle.pid" 2>/dev/null)" 2>/dev/null \
  && ok "el bucle queda en marcha (uno solo)" || mal "bucle: $(bucles) en marcha"

# Primera vuelta del móvil nuevo
[ "$(campo .dispositivo.modelo)" = "Pixel 7" ] && [ "$(campo .dispositivo.android)" = 14 ] \
  && ok "el primer informe ya es del móvil nuevo (Pixel 7, Android 14)" || mal "informe: modelo '$(campo .dispositivo.modelo)'"
E_ historial.jsonl | grep -q '"recogida y publicada"' && E_ recogidas.jsonl | tail -n1 | grep -q '"turno de las' \
  && ok "la primera vuelta RECOGE (sin esperas ni límites heredados)" || mal "primera vuelta sin recogida: '$(campo .resultado)'"
G show "$RAMA:data/yelmo.js" | grep -q 'Peli premium-bahia-sur' && G log -1 --format=%s "$RAMA" | grep -q '(móvil)' \
  && ok "y publica la cartelera de Yelmo en la rama de la web" || mal "yelmo.js sin publicar"
ua=$(tail -n1 "$REG/ua" 2>/dev/null)
echo "$ua" | grep -q 'Android 14; Pixel 7)' && echo "$ua" | grep -q '"model":"Pixel 7"' && echo "$ua" | grep -q '"platformVersion":"14.0.0"' \
  && echo "$ua" | grep -q 'Chrome/155.0.0.0' && echo "$ua" | grep -q "\"chrome\":\"$S/usr/bin/chromium-browser\"" \
  && ok "Chromium se presenta como el Chrome del móvil nuevo (Android 14, Pixel 7, Chrome 155)" || mal "identidad: $ua"
[ "$(E_ historial.jsonl | grep -c 'vuelta del movil anterior')" = 3 ] \
  && ok "el historial de vueltas del panel sigue (las 3 del anterior + las nuevas)" || mal "historial: $(E_ historial.jsonl | grep -c 'vuelta del movil anterior') del anterior"
! E_ bateria-historial.json | grep -q '"pct":7' && ok "la batería del móvil anterior no se mezcla con la del nuevo" || mal "historial de batería mezclado"

# Nada de lo que se le pidió al móvil anterior se repite
[ ! -e "$H/orden-vieja-ejecutada" ] && ok "data/orden.sh, ya ejecutada por el anterior, no se repite" || mal "¡ha repetido data/orden.sh!"
! grep -q "orden $OA\|orden $OC" "$H/.recolector/ciclo.log" && ! E_ recogidas.jsonl | grep -q "$OC" \
  && ok "las órdenes del panel del móvil anterior no se ejecutan otra vez" || mal "¡ha ejecutado una orden del móvil anterior!"
[ "$(R $OA .estado)" = hecha ] && [ "$(R $OA .salida)" = "hecha por el movil anterior" ] \
  && ok "la orden que hizo el anterior conserva su resultado" || mal "resultado de $OA: '$(R $OA .estado)'"
[ "$(R $OC .estado)" = caducada ] && R $OC .salida | grep -q "cambio de móvil" \
  && ok "la que se quedó sin hacer se anota «caducada» (el panel no la ve pendiente para siempre)" || mal "$OC: '$(R $OC .estado)'"

# El vigilante: el aviso de "no responde" del móvil roto se cierra solo.
E_ estado.json > "$S/estado-nuevo.json"
v=$(SIMULAR=1 ESTADO="$S/estado-nuevo.json" ABIERTOS='[{"number":7,"body":"<!-- vigilante:sin-senal nivel:critico -->"}]' node "$RAIZ/scripts/vigilante/revisar.mjs" 2>&1)
echo "$v" | grep -q "alertas: ninguna" && echo "$v" | grep -q "cerrado: #7" \
  && ok "el vigilante ve vivo al móvil nuevo y cierra el aviso del anterior" || mal "vigilante: $v"

# Lo publicado es público: ni la clave privada ni el token.
G log -p estado-movil ordenes-movil "$INICIO_WEB..$RAMA" | grep -q 'ENSAYO-CLAVE-PRIVADA\|gho_Ensayo' && mal "¡la clave privada o el token han llegado a GitHub!" || ok "ni la clave privada ni el token llegan a GitHub"

# ── Después: el panel y Claude ya mandan en el móvil nuevo ─────────────────
OD=o-20261017-1230-dd04
orden "$OD" diagnostico
for _ in $(seq 1 40); do [ "$(R $OD .estado)" = hecha ] && break; sleep 0.5; done
[ "$(R $OD .estado)" = hecha ] && R $OD .salida | grep -q "Pixel 7" \
  && ok "una orden NUEVA del panel la recoge el bucle del móvil nuevo en su minuto" || mal "orden nueva: '$(R $OD .estado)'"
for _ in $(seq 1 20); do [ "$(cat "$H/.recolector/ordenes-sha" 2>/dev/null)" = "$(G rev-parse ordenes-movil)" ] && break; sleep 0.5; done
( cd "$W" && fuera git pull -q --rebase origin "$RAMA" && printf 'echo orden-nueva-de-claude\ntouch "$HOME/orden-nueva-ejecutada"\n' > data/orden.sh \
  && fuera git commit -qam "orden nueva" && fuera git push -q origin "HEAD:$RAMA" )
bash "$H/.recolector/ciclo.sh"
[ -e "$H/orden-nueva-ejecutada" ] && E_ orden-salida.txt | grep -q orden-nueva-de-claude \
  && ok "una data/orden.sh NUEVA sí se ejecuta (el acceso de Claude funciona)" || mal "data/orden.sh nueva sin ejecutar"

# ── 3er intento: volver a ejecutarlo en el mismo móvil no rompe nada ───────
date +%s > "$H/.recolector/ultima-recogida"; date +%s > "$H/.recolector/ultimo-intento"   # "acaba de recoger"
n_gh=$(wc -l < "$REG/gh"); n_rec=$(E_ recogidas.jsonl | wc -l); pid=$(cat "$H/.recolector/bucle.pid")
instalar 3; r=$?
[ "$r" = 0 ] && [ "$(wc -l < "$REG/gh")" = "$n_gh" ] && [ "$(grep -c recolector-movil "$DB")" = 1 ] \
  && ok "repetir la instalación no vuelve a pedir el código ni toca las claves" || mal "repetir: salida $r, gh $(wc -l < "$REG/gh") vs $n_gh"
[ "$(E_ recogidas.jsonl | wc -l)" -gt "$n_rec" ] && ok "y su primera vuelta recoge igual, aunque acabara de recoger" || mal "repetir: no recogió"
[ "$(bucles)" = 1 ] && [ "$(cat "$H/.recolector/bucle.pid")" = "$pid" ] && ok "y no arranca un segundo bucle" || mal "repetir: $(bucles) bucles"
[ "$(R $OD .estado)" = hecha ] && [ "$(R $OC .estado)" = caducada ] && ok "ni vuelve a heredar órdenes" || mal "repetir: órdenes tocadas"
grep -q "Yelmo: recogida y publicada" "$S/salida-3.txt" && grep -q "primer informe publicado" "$S/salida-3.txt" && grep -q "bucle en marcha" "$S/salida-3.txt" \
  && ok "al acabar dice lo que ha comprobado (informe, Yelmo, bucle)" || mal "resumen final: $(tail -n 30 "$S/salida-3.txt")"
grep -q "Uso de batería de la" "$S/salida-3.txt" && ok "y los ajustes de Android de su marca (Google)" || mal "ajustes por marca"

echo; [ $fallos -eq 0 ] && echo "Todo correcto" || { echo "$fallos FALLOS (salida de la instalación: $S/salida-2.txt, se borra al salir)"; sed 's/^/  | /' "$S/salida-2.txt" | tail -n 60; exit 1; }
