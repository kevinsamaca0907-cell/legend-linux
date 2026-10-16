#!/usr/bin/env bash
# Descarga y verifica las herramientas que no van en el repositorio (por tamaño y licencia):
#  - Electron 11.5.0 (último con soporte de Flash PPAPI), desde los releases oficiales de GitHub.
#  - Flash Player 32.0.0.344 PPAPI para Linux (último sin bomba de tiempo), del archivo oficial
#    de Adobe guardado en Wayback Machine (captura de 2020-05-05). ~406 MB que se borran al terminar.
# Todo se comprueba con SHA-256 antes de usarse. Requiere: curl, python3, sha256sum, tar.
set -euo pipefail
cd "$(dirname "$0")"

ELECTRON_URL="https://github.com/electron/electron/releases/download/v11.5.0/electron-v11.5.0-linux-x64.zip"
ELECTRON_SHA256="613ef8ac00c5abda425dfa48778a68f58a2e9c7c1f82539bb1a41afabbd6193f"
FLASH_URL="https://web.archive.org/web/20200505195102id_/https://fpdownload.macromedia.com/pub/flashplayer/installers/archive/fp_32.0.0.344_archive.zip"
FLASH_ZIP_SHA256="076fc22746decc22a1b1e14460cd6ec8406f4885ca1d9f8bd5e76282ea540b6b"
FLASH_TGZ="32_0_r0_344/flashplayer32_0r0_344_linuxpep.x86_64.tar.gz"
FLASH_SO_SHA256="9fad2e23d872560d088494ce6cf9dd22c1badcf3ecb004553f69f8b607fbc07f"

for c in curl python3 sha256sum tar; do
  command -v "$c" >/dev/null || { echo "Falta '$c'" >&2; exit 1; }
done
[[ "$(uname -m)" == x86_64 ]] || { echo "Solo x86_64: no existe Flash para $(uname -m)" >&2; exit 1; }

DL="tools/dl"
mkdir -p "$DL"

verify() { # verify <archivo> <sha256>
  echo "$2  $1" | sha256sum -c --quiet - || { echo "Hash incorrecto: $1 (bórralo y reintenta)" >&2; exit 1; }
}

fetch() { # fetch <url> <archivo> <sha256>: descarga (reanudable) salvo que ya esté y sea correcto
  if [[ -f "$2" ]] && echo "$3  $2" | sha256sum -c --quiet - 2>/dev/null; then return; fi
  curl -fL --retry 5 -C - -o "$2" "$1"
  verify "$2" "$3"
}

# Extrae un zip conservando permisos de ejecución (python3 está en casi todas las distros; unzip no).
unzip_py() { # unzip_py <zip> <destino> [miembro]
  python3 -I - "$@" <<'EOF'
import sys, zipfile, os
zf, dest = zipfile.ZipFile(sys.argv[1]), sys.argv[2]
members = sys.argv[3:] or zf.namelist()
for name in members:
    path = zf.extract(name, dest)
    mode = (zf.getinfo(name).external_attr >> 16) & 0o777
    if mode:
        os.chmod(path, mode)
EOF
}

if [[ -x tools/electron-v11.5.0/electron ]]; then
  echo "Electron 11.5.0: ya instalado"
else
  echo "Descargando Electron 11.5.0 (~80 MB)..."
  fetch "$ELECTRON_URL" "$DL/electron.zip" "$ELECTRON_SHA256"
  unzip_py "$DL/electron.zip" tools/electron-v11.5.0
  rm -f "$DL/electron.zip"
  echo "Electron 11.5.0: OK"
fi

if [[ -f tools/flash/libpepflashplayer.so ]]; then
  echo "Flash 32.0.0.344: ya instalado"
else
  echo "Descargando el archivo de Flash 32.0.0.344 de Adobe vía Wayback Machine (~406 MB, puede tardar)..."
  fetch "$FLASH_URL" "$DL/fp_32.0.0.344_archive.zip" "$FLASH_ZIP_SHA256"
  unzip_py "$DL/fp_32.0.0.344_archive.zip" "$DL" "$FLASH_TGZ"
  mkdir -p tools/flash
  tar -xzf "$DL/$FLASH_TGZ" -C tools/flash
  verify tools/flash/libpepflashplayer.so "$FLASH_SO_SHA256"
  rm -rf "$DL/fp_32.0.0.344_archive.zip" "$DL/32_0_r0_344"
  echo "Flash 32.0.0.344: OK"
fi

echo
echo "Listo. Para jugar: ./run.sh"
