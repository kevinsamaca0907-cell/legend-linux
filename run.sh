#!/usr/bin/env bash
# Arranca el cliente dentro de bubblewrap.
# Flash obliga a usar --no-sandbox en Electron 11 (ver src/main.js); bwrap compensa:
# el proceso ve el sistema y el proyecto en solo lectura, solo puede escribir en el perfil y nunca
# ve el resto del home. Comprobación: ./run.sh --probar-sandbox
# Opciones: --ligero (modo para PCs básicos, ver README).
# Variables: LO_FLASH_PATH (ruta al .so), LO_DEVTOOLS=1 (abre DevTools), LO_NO_BWRAP=1 (sin bwrap),
# LO_PERFIL (carpeta del perfil), LO_CALIDAD (calidad de Flash: low, medium, high, best).
# Los avisos de Fontconfig (fontconfig de Electron 11 más viejo que la config del sistema) se filtran.
# Registro de la última sesión: $LO_PERFIL/legend.log (la anterior en legend.log.1).
set -euo pipefail
# readlink: instalado en el sistema, /usr/bin/legend-linux es un enlace a este archivo.
cd "$(dirname "$(readlink -f "$0")")"
PROJ="$PWD"

# Perfil (sesión, usuarios recordados, ajustes): siempre fuera del proyecto, en ~/.local/share/legend-linux,
# para que la sesión no acabe nunca junto al código (git, paquetes .tar.gz) y sirva igual instalado desde el AUR.
export LO_PERFIL="${LO_PERFIL:-${XDG_DATA_HOME:-$HOME/.local/share}/legend-linux}"
PERFIL="$LO_PERFIL"

# --ligero: lo lee src/ (preload.js y main.js) como LO_LIGERO=1; no se pasa a Electron.
app_args=()
for a in "$@"; do
  if [[ "$a" == --ligero ]]; then export LO_LIGERO=1; else app_args+=("$a"); fi
done
set -- "${app_args[@]}"
ELECTRON="$PROJ/tools/electron-v11.5.0/electron"

if [[ ! -x "$ELECTRON" || ! -f "$PROJ/tools/flash/libpepflashplayer.so" ]]; then
  echo "Faltan Electron o Flash: ejecuta primero ./instalar.sh" >&2
  exit 1
fi
if [[ -z "${DISPLAY:-}" ]]; then
  echo "No hay DISPLAY: hace falta una sesión X11 o Wayland con XWayland." >&2
  exit 1
fi

# Bibliotecas del sistema que falten (lista de paquetes por distro en README.md).
missing="$(ldd "$ELECTRON" 2>/dev/null | awk '/not found/{print $1}' | sort -u | tr '\n' ' ')"
if [[ -n "$missing" ]]; then
  echo "Faltan bibliotecas del sistema: $missing" >&2
  echo "Instala los paquetes de tu distro indicados en README.md" >&2
  exit 1
fi

install -d -m 700 "$PERFIL" "$PERFIL/home"

# Registro de la última sesión (y la anterior en legend.log.1): abierto desde el menú no hay terminal
# y los fallos intermitentes (red al encender el PC, bloqueos de Cloudflare) no dejaban rastro.
# Los logs ya ocultan token, usuario y clave (redact() en src/main.js).
LOG="$PERFIL/legend.log"
[[ -f "$LOG" ]] && mv -f "$LOG" "$LOG.1"
exec > >(tee "$LOG") 2> >(grep --line-buffered -v '^Fontconfig' | tee -a "$LOG" >&2)
echo "[legend-linux] inicio $(date -Is)"

# Al encender el PC la red puede tardar unos segundos: sin DNS el login salía en blanco.
for i in {1..30}; do
  getent hosts gamebox3.creaction-network.com >/dev/null && break
  ((i == 1)) && echo "[legend-linux] esperando a la red..."
  sleep 1
done

if [[ -n "${LO_NO_BWRAP:-}" ]]; then
  exec "$ELECTRON" "$PROJ/src" "$@"
fi

if ! command -v "${BWRAP:-bwrap}" >/dev/null; then
  echo "Falta bubblewrap (bwrap). Instálalo (Arch: pacman -S bubblewrap, Fedora: dnf install bubblewrap)" >&2
  echo "o arranca sin sandbox extra: LO_NO_BWRAP=1 ./run.sh" >&2
  exit 1
fi

FIFO="$PERFIL/abrir-url.fifo"

RUN="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
args=(
  --ro-bind /usr /usr
  --symlink usr/bin /bin --symlink usr/bin /sbin --symlink usr/lib /lib --symlink usr/lib /lib64
  --ro-bind /etc /etc
  --ro-bind-try /var/cache/fontconfig /var/cache/fontconfig
  --ro-bind /sys /sys
  --proc /proc
  --dev /dev --dev-bind-try /dev/dri /dev/dri --tmpfs /dev/shm
  --tmpfs /tmp --ro-bind-try /tmp/.X11-unix /tmp/.X11-unix
  --tmpfs "$RUN"
  --ro-bind-try "$RUN/pulse" "$RUN/pulse"
  --ro-bind-try "$RUN/pipewire-0" "$RUN/pipewire-0"
  --ro-bind-try "$HOME/.local/share/fonts" "$HOME/.local/share/fonts"
  # Proyecto en solo lectura: si el Chromium viejo se viera comprometido no podría modificar
  # run.sh, src/ ni tools/ (se ejecutarían fuera del sandbox la próxima vez). Solo el perfil es escribible.
  --ro-bind "$PROJ" "$PROJ"
  --bind "$PERFIL" "$PERFIL"
  --setenv HOME "$PERFIL/home"
  --setenv LO_OPEN_FIFO "$FIFO"
  --unsetenv WAYLAND_DISPLAY
  --unshare-all --share-net
  --die-with-parent --new-session
)
# DNS: en Fedora/Ubuntu /etc/resolv.conf enlaza a /run/systemd/resolve o /run/NetworkManager,
# que no existen dentro del sandbox.
RESOLV="$(readlink -f /etc/resolv.conf || true)"
[[ -n "$RESOLV" && "$RESOLV" != /etc/* ]] && args+=(--ro-bind-try "$RESOLV" "$RESOLV")

# Autorización de XWayland/X11 (GNOME y KDE la usan; Hyprland no). Su archivo vive en /run/user
# o en el home, que el sandbox oculta: se monta solo ese archivo, en solo lectura.
XAUTH="${XAUTHORITY:-$HOME/.Xauthority}"
[[ -f "$XAUTH" ]] && args+=(--ro-bind "$XAUTH" "$XAUTH" --setenv XAUTHORITY "$XAUTH")

# GPU NVIDIA (driver propietario): sin sus dispositivos no hay aceleración.
for d in /dev/nvidia*; do [[ -e "$d" ]] && args+=(--dev-bind "$d" "$d"); done

# ./run.sh --probar-sandbox: comprueba desde dentro del sandbox qué se ve y qué se puede escribir.
if [[ "${1:-}" == --probar-sandbox ]]; then
  exec "${BWRAP:-bwrap}" "${args[@]}" --setenv REAL_HOME "$HOME" --setenv PROJ "$PROJ" --setenv PERFIL "$PERFIL" \
    /usr/bin/bash "$PROJ/scripts/probar-sandbox.sh"
fi

# Los enlaces externos (pagos, soporte...) se abren fuera del sandbox a través de una FIFO.
rm -f "$FIFO" && mkfifo -m 600 "$FIFO"
(
  while true; do
    while IFS= read -r url; do
      [[ "$url" =~ ^https?://[^[:space:]]+$ ]] || continue
      xdg-open "$url" >/dev/null 2>&1 &
      sleep 1 # como mucho un enlace por segundo (evita que una página abra pestañas sin parar)
    done < "$FIFO"
  done
) &
OPENER=$!
trap 'kill "$OPENER" 2>/dev/null; rm -f "$FIFO"' EXIT
trap 'exit 130' INT TERM HUP # cerrar la terminal o Ctrl+C también limpia

"${BWRAP:-bwrap}" "${args[@]}" "$ELECTRON" "$PROJ/src" "$@"
