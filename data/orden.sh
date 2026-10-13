# Orden 1 — ¿Por qué bloquea Cloudflare al móvil?
# Su página de bloqueo trae un código que lo dice:
#   1006 / 1007 / 1008 → la IP está vetada
#   1010               → veta el TIPO de programa (huella del navegador)
#   1020               → regla de cortafuegos (país, red, cabeceras…)
# No se imprime la IP: este informe es público.

ua='Mozilla/5.0 (Linux; Android 12; Mi Note 10 Lite) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

probar() {
  echo "── $1"
  curl -sS -m 20 -A "$ua" -H 'Accept-Language: es-ES,es;q=0.9' -o /tmp/cuerpo -D /tmp/cabeceras "${@:2}" \
    || { echo "   curl falló"; return; }
  echo "   estado:    $(head -1 /tmp/cabeceras | tr -d '\r')"
  echo "   servidor:  $(grep -i '^server:' /tmp/cabeceras | tr -d '\r' | cut -d' ' -f2-)"
  echo "   mitigado:  $(grep -i '^cf-mitigated:' /tmp/cabeceras | tr -d '\r' | cut -d' ' -f2- || true)"
  echo "   bytes:     $(wc -c < /tmp/cuerpo)"
  codigo=$(grep -o 'cf-error-code">[0-9]*' /tmp/cuerpo | grep -o '[0-9]*$' | head -1)
  echo "   código CF: ${codigo:-ninguno}"
  sed -n 's/.*<h2[^>]*>\(What happened?\)<\/h2>.*/\1/p' /tmp/cuerpo | head -1
  grep -o 'cf-error-description[^<]*<[^>]*>[^<]*' /tmp/cuerpo | sed 's/<[^>]*>//g' | head -2
  tr -s ' \n' ' ' < /tmp/cuerpo | grep -o '<title>[^<]*</title>' | head -1
}

probar "Portada (curl)"           https://www.yelmocines.es/
probar "Cartelera Bahía Sur"      https://www.yelmocines.es/cartelera/cadiz/premium-bahia-sur
probar "API now-playing"          -X POST -H 'Content-Type: application/json; charset=utf-8' \
                                  -H 'X-Requested-With: XMLHttpRequest' --data '{"cityKey":"cadiz"}' \
                                  https://www.yelmocines.es/now-playing.aspx/GetNowPlaying
probar "Control: otra web con Cloudflare" https://www.cloudflare.com/
echo "── versiones"; curl --version | head -1; node --version
