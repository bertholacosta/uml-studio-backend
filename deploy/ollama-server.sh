#!/usr/bin/env bash
# Prepara una EC2 con GPU (p. ej. g5.xlarge con una AMI Deep Learning que ya trae los drivers de NVIDIA)
# como servidor del modelo propio «trazo». Ejecutar como root desde la carpeta del backend:
#   sudo bash deploy/ollama-server.sh
# Después: abrir el puerto 11434 solo al grupo de seguridad de la API (salida ApiSecurityGroupId)
# y guardar http://<ip-privada>:11434 en el parámetro /uml-studio/OLLAMA_BASE_URL.
set -euo pipefail

nvidia-smi
curl -fsSL https://ollama.com/install.sh | sh

# Escuchar en la red privada y mantener el modelo cargado en la GPU
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<'CONF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_KEEP_ALIVE=24h"
CONF
systemctl daemon-reload
systemctl restart ollama
sleep 5

MODELFILE="$(dirname "$0")/../ollama/Modelfile"
BASE=$(awk '/^FROM /{print $2; exit}' "$MODELFILE")
ollama pull "$BASE"
ollama create trazo -f "$MODELFILE"
ollama run trazo "Explica en dos frases qué es un atributo derivado en UML."
