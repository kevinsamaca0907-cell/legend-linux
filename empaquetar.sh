#!/usr/bin/env bash
# Genera dist/legend-linux-<fecha>.tar.gz con solo lo necesario para jugar en otro equipo:
# src/, run.sh, iconos, Electron 11.5.0 y el plugin Flash. Sin perfil/ (sesión), ni descargas, ni análisis.
# OJO: el paquete incluye el plugin Flash de Adobe, cuya licencia no permite redistribuirlo:
# es para tus propios equipos; no lo subas a GitHub Releases ni lo compartas.
set -euo pipefail
cd "$(dirname "$0")"

for f in README.md src run.sh instalar-escritorio.sh iconos/ventana.png tools/electron-v11.5.0/electron tools/flash/libpepflashplayer.so; do
  [[ -e "$f" ]] || { echo "Falta $f" >&2; exit 1; }
done

mkdir -p dist
OUT="dist/legend-linux-$(date +%Y%m%d).tar.gz"
tar -czf "$OUT" --transform 's,^,legend-linux/,' \
  --exclude='src/perfil' \
  --exclude='iconos/fuente*' \
  README.md LICENSE src run.sh instalar-escritorio.sh iconos scripts/probar-sandbox.sh tools/electron-v11.5.0 tools/flash

echo "Paquete: $PWD/$OUT ($(du -h "$OUT" | cut -f1))"
echo "En el otro equipo: tar -xzf $(basename "$OUT") && cd legend-linux && ./run.sh"
