"""Servidor del modelo propio «trazo» en Modal: Ollama en una GPU sin servidor.

El contenedor arranca cuando llega una petición y se apaga tras unos minutos sin uso, así que
el modelo está siempre en línea pero solo consume crédito mientras responde. La API de Ollama
(/api/chat, /api/tags…) queda publicada en una URL de Modal protegida con tokens de proxy:
solo el backend de UML Studio, con sus cabeceras Modal-Key y Modal-Secret, puede usarla.

Uso, desde la carpeta del backend (con `pip install modal` y `modal setup` hechos):

    modal run ollama/modal_app.py::prepare   # una vez: descarga la base y crea «trazo» en el volumen
    modal deploy ollama/modal_app.py         # publica la URL; va en OLLAMA_BASE_URL

Para cambiar de modelo base, edita FROM en ollama/Modelfile y vuelve a ejecutar prepare.
"""

import subprocess
import time
from pathlib import Path

import modal

MODEL_NAME = "trazo"
MODELS_DIR = "/models"
MODELFILE = "/root/Modelfile"
OLLAMA_PORT = 11434
# T4 (16 GB) sobra para un 7B cuantizado y es la GPU que más estira el crédito gratuito
GPU = "T4"
# Minutos que el contenedor sigue encendido tras la última petición
IDLE_MINUTES = 5

models = modal.Volume.from_name("trazo-models", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl", "ca-certificates", "zstd")
    .run_commands("curl -fsSL https://ollama.com/install.sh | sh")
    .env(
        {
            "OLLAMA_HOST": f"0.0.0.0:{OLLAMA_PORT}",
            "OLLAMA_MODELS": MODELS_DIR,
            "OLLAMA_KEEP_ALIVE": f"{IDLE_MINUTES}m",
        }
    )
    .add_local_file(Path(__file__).parent / "Modelfile", MODELFILE)
)

app = modal.App("trazo", image=image)


def start_ollama() -> subprocess.Popen:
    """Arranca `ollama serve` y espera a que responda."""
    server = subprocess.Popen(["ollama", "serve"])
    for _ in range(60):
        if subprocess.run(["ollama", "list"], capture_output=True).returncode == 0:
            return server
        time.sleep(1)
    raise RuntimeError("Ollama no arrancó")


@app.function(gpu=GPU, volumes={MODELS_DIR: models}, timeout=1800)
def prepare() -> None:
    """Descarga el modelo base y crea «trazo» a partir del Modelfile, en el volumen persistente."""
    start_ollama()
    base = next(
        line.split()[1]
        for line in Path(MODELFILE).read_text(encoding="utf-8").splitlines()
        if line.startswith("FROM ")
    )
    subprocess.run(["ollama", "pull", base], check=True)
    subprocess.run(["ollama", "create", MODEL_NAME, "-f", MODELFILE], check=True)
    subprocess.run(["ollama", "list"], check=True)
    models.commit()
    # Prueba rápida en la GPU
    subprocess.run(
        ["ollama", "run", MODEL_NAME, "Explica en una frase qué es un atributo derivado en UML."],
        check=True,
    )


@app.function(
    gpu=GPU,
    volumes={MODELS_DIR: models},
    scaledown_window=IDLE_MINUTES * 60,
    timeout=600,
    # Un solo contenedor: las peticiones de la pizarra ya llegan en orden desde el backend
    max_containers=1,
)
@modal.concurrent(max_inputs=8)
@modal.web_server(port=OLLAMA_PORT, startup_timeout=120, requires_proxy_auth=True)
def serve() -> None:
    """API de Ollama con el modelo «trazo» (el backend la usa como OLLAMA_BASE_URL)."""
    start_ollama()
