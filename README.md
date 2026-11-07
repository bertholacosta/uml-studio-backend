# UML Studio · Backend

API de **UML Studio**, un editor colaborativo de diagramas de clases UML con asistente de IA y generación de código.
Este repositorio contiene el servidor: autenticación, proyectos y permisos, persistencia de diagramas, colaboración en tiempo real, el asistente **Trazo** (un modelo open-source propio servido con Ollama, con la conversación en MongoDB), importación/exportación XMI y los generadores de código Spring Boot y Flutter.

El cliente web está en el repositorio del frontend (`sw1_parcial1_frontend`).

## Funcionalidades

- **Cuentas y sesiones** con JWT y contraseñas cifradas con bcrypt. Todas las rutas son privadas salvo las marcadas con `@Public()`.
- **Proyectos con roles** (`OWNER`, `EDITOR`, `VIEWER`): invitar por correo, cambiar el rol o quitar miembros. El acceso se comprueba en un único servicio (`ProjectAccessService`).
- **Diagramas de clases** guardados como clases, atributos, métodos y relaciones (asociación, agregación, composición, herencia, dependencia, realización y clase de asociación) con sus multiplicidades.
- **Colaboración en tiempo real** con Socket.IO: una sala por diagrama con presencia, cursores, arrastre en vivo, bloqueo de clases mientras alguien las edita y sincronización de cambios. El estado de la sala vive en memoria.
- **Chat del equipo con Trazo** (ver [Trazo e IA local](#trazo-e-ia-local)):
  - **Canal del equipo por proyecto**, como un canal de Slack: las personas conversan entre ellas en tiempo real y **Trazo es un miembro más** que solo responde cuando lo mencionan con **@Trazo** (nunca actúa por su cuenta). Las menciones **@persona** se resaltan.
  - **Conversación privada** de cada persona con Trazo: nadie más la ve.
  - **Elige el lienzo**: con **#Diagrama** se indica en qué diagrama trabajar; si no, Trazo usa el que tiene abierto quien escribe, el único que contiene las clases mencionadas o el del hilo, y si no puede saberlo pregunta.
  - Actúa como desarrollador senior: explica conceptos con ejemplos del propio diagrama, revisa el modelo, propone ideas o **edita** el diagrama (operaciones `add_class`, `update_class`, `add_relation`…). A los lectores siempre les propone; cualquier editor aplica la propuesta con un botón.
  - **Distingue quién le habla**: cada mensaje lleva el nombre de su autor, Trazo se dirige a esa persona por su nombre y sabe quién está conectado, con qué permiso y en qué diagrama.
  - **Guarda en el servidor** los cambios que hace, aunque nadie tenga ese diagrama abierto, y los difunde a quien sí lo tiene.
  - Toda la interacción y el contexto se guardan en **MongoDB**, así que la sesión continúa al día siguiente; los mensajes antiguos se resumen solos.
  - El **administrador** del proyecto (rol `OWNER`) es quien puede reiniciar el canal del equipo.
  - Digitaliza un diagrama a partir de una foto o captura y crea automáticamente la tabla intermedia de las relaciones muchos a muchos.
- **XMI 2.1** compatible con Enterprise Architect: exportación e importación (la importación asigna ids nuevos y es atómica).
- **Generación de código** con vista previa o descarga en `.zip`:
  - **Spring Boot 3.5** (Java 21, Gradle): entidades JPA con herencia `JOINED`, relaciones 1:N y M:N, DTOs, mappers, servicios, controladores REST, autenticación JWT, migraciones Flyway, Swagger y Docker Compose con PostgreSQL.
  - **Flutter**: Clean Architecture con BLoC, CRUD por entidad, inicio de sesión y un asistente que ejecuta un modelo local (Qwen 2.5 GGUF mediante `llama.cpp`) en el propio dispositivo.
- **Protección básica**: límites de peticiones (login y registro 10/min, Trazo 20/min, resto 300/min), validación estricta de los cuerpos y tope de 500 clases y 1000 relaciones por diagrama.

## Tecnologías

| Área | Herramientas |
| --- | --- |
| Framework | NestJS 12, TypeScript 6 |
| Base de datos | PostgreSQL + TypeORM (proyectos y diagramas), MongoDB + Mongoose (conversación con Trazo) |
| Tiempo real | Socket.IO |
| IA | Modelo propio `trazo` (Qwen 2.5 Coder 7B) servido con Ollama; Google Gemini opcional (`@google/genai`) |
| Generación de código | Mustache, JSZip |
| Documentación | Swagger (OpenAPI) |
| Calidad | Jest, oxlint, Prettier |

## Requisitos

- Node.js 24 o superior
- PostgreSQL 14 o superior
- MongoDB 7 o superior
- [Ollama](https://ollama.com) en el propio equipo, en un servidor o en Google Colab (ver [Trazo e IA local](#trazo-e-ia-local))
- Una clave de [Google AI Studio](https://aistudio.google.com/apikey) solo si las imágenes las procesa Gemini

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y rellena los valores
ollama create trazo -f ollama/Modelfile
npm run start:dev
```

MongoDB debe estar en marcha en `MONGODB_URI`; las colecciones se crean solas.

Base de datos: crea una base vacía (por ejemplo `uml_studio_db`) y luego ejecuta `schema.sql`, o arranca la primera vez con `DB_SYNCHRONIZE=true` para que TypeORM cree las tablas.

```bash
psql -U postgres -d uml_studio_db -f schema.sql
```

El frontend en modo desarrollo espera la API en `http://localhost:4000`, así que pon `PORT=4000` en el `.env` (el valor por defecto es 3000).

Fuera de producción se crean usuarios de prueba al arrancar, todos con la contraseña **Pass1234!**: **demo@example.com**, y **ana@example.com** (Ana Pérez) y **luis@example.com** (Luis Rojas) para probar la pizarra compartida con Trazo desde dos navegadores.

Con el servidor en marcha:

- API: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`
- Estado: `http://localhost:4000/api/health`

### Con Docker

`docker-compose.yml` levanta la API junto a PostgreSQL y MongoDB y aplica `schema.sql` al crear la base. Necesita un `.env` con `JWT_SECRET` (y `GEMINI_API_KEY` si las imágenes van a Gemini). Ollama queda fuera de Docker: por defecto la API usa el del equipo anfitrión (`host.docker.internal:11434`).

```bash
docker compose up --build
```

La API queda en `http://localhost:3000/api`.

## Despliegue en AWS con GitHub Actions

```text
GitHub (backend)  ── push a main ──► Actions: CI ─► imagen a ECR ─► SSM Run Command ─► EC2 (API + PostgreSQL + MongoDB)
GitHub (frontend) ── push a main ──► Actions: CI ─► S3 ─► invalidación de CloudFront
Navegador ─► CloudFront (HTTPS) ─┬─► S3 (Angular)
                                 └─► /api/* y /socket.io/* ─► EC2:3000 ─► Ollama «trazo» (EC2 con GPU, red privada)
```

- **CI** (`.github/workflows/ci.yml`): en cada pull request, lint, formato, las pruebas y la compilación. El despliegue lo vuelve a ejecutar antes de publicar.
- **CD** (`.github/workflows/deploy.yml`): en cada push a `main` construye la imagen Docker, la sube a **ECR** y ordena a la EC2, mediante **SSM Run Command** (sin SSH), que descargue la imagen, aplique `schema.sql` (idempotente) y reinicie la API. Si `/api/health` no responde, el workflow falla.
- **Sin claves de AWS en GitHub**: los workflows obtienen credenciales temporales por **OIDC** con un rol que solo puede usarse desde la rama `main` de cada repositorio.
- **Un solo dominio**: CloudFront sirve el frontend y reenvía `/api` y `/socket.io` (WebSocket) a la EC2, así que no hay CORS entre dominios ni hace falta un certificado propio. La EC2 solo acepta tráfico de CloudFront.
- **Secretos** en Parameter Store (`/uml-studio/*`) y **registros** de la API en CloudWatch Logs (`/uml-studio/api`).
- Toda la infraestructura está en [`infra/uml-studio.yml`](infra/uml-studio.yml) (CloudFormation).

### Puesta en marcha (una sola vez)

Con la AWS CLI configurada en la región elegida:

```bash
# 1. Lista de prefijos de CloudFront de la región (para el grupo de seguridad de la API)
aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query "PrefixLists[0].PrefixListId" --output text

# 2. Infraestructura (tarda ~10 min por CloudFront)
aws cloudformation deploy --stack-name uml-studio --template-file infra/uml-studio.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides GitHubOwner=<usuario-de-github> CloudFrontPrefixListId=<pl-...>

# 3. Secretos (SecureString; contraseñas solo con letras y números)
aws ssm put-parameter --name /uml-studio/JWT_SECRET --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name /uml-studio/POSTGRES_PASSWORD --type SecureString --value "$(openssl rand -hex 24)"
aws ssm put-parameter --name /uml-studio/GEMINI_API_KEY --type SecureString --value "<clave-de-ai-studio>"

# 4. Salidas de la pila → variables de los repositorios
aws cloudformation describe-stacks --stack-name uml-studio --query "Stacks[0].Outputs" --output table
```

Variables de GitHub (*Settings → Secrets and variables → Actions → Variables*, o `gh variable set NOMBRE --body valor -R <repo>`):

| Repositorio | Variables |
| --- | --- |
| Backend | `AWS_REGION`, `AWS_ROLE_ARN` (`BackendRoleArn`), `ECR_REPOSITORY`, `DEPLOY_BUCKET`, `EC2_INSTANCE_ID` |
| Frontend | `AWS_REGION`, `AWS_ROLE_ARN` (`FrontendRoleArn`), `SITE_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID` |

Después, un push a `main` (o *Actions → Deploy → Run workflow*) despliega cada parte. La aplicación queda en la salida `AppUrl`. En producción no se crean usuarios de prueba: hay que registrarse.

**Servidor del modelo:** en Modal, como se explica en [Servidor del modelo en Modal](#servidor-del-modelo-en-modal). Alternativa en AWS con plan de pago (EC2 con GPU): lanza una g5.xlarge con una AMI *Deep Learning Base OSS Nvidia Driver*, clona este repositorio y ejecuta `sudo bash deploy/ollama-server.sh`. Permite el puerto 11434 solo desde el grupo de seguridad de la API (salida `ApiSecurityGroupId`) y guarda `http://<ip-privada>:11434` en `/uml-studio/OLLAMA_BASE_URL`. Las cuentas nuevas tienen cuota 0 para instancias G: pide el aumento («Running On-Demand G and VT instances») con antelación. Apágala cuando no se use.

**Límites a tener en cuenta:** CloudFront espera a la API como máximo 60 s; no afecta a Trazo porque sus respuestas llegan por el socket (`AI_TIMEOUT_MS` es 180 000 en producción). La EC2 de la API es por defecto una `m7i-flex.large` (2 vCPU, 8 GB), que entra en el plan gratuito de AWS; ese plan no permite instancias con GPU, por eso el modelo `trazo` se sirve desde Modal. Detener la EC2 fuera de las sesiones de trabajo alarga el crédito.

## Variables de entorno

La lista completa y comentada está en [`.env.example`](.env.example). Las principales:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP (por defecto 3000) |
| `NODE_ENV` | `development` o `production` |
| `CORS_ORIGINS` | Orígenes permitidos del frontend, separados por comas |
| `DATABASE_URL` | Cadena de conexión completa; si existe, tiene prioridad sobre las variables `DB_*` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME` | Conexión a PostgreSQL por partes |
| `DB_SYNCHRONIZE` | `true` para que TypeORM cree o ajuste las tablas (solo en desarrollo) |
| `DB_SSL` | `true` si la base exige TLS |
| `JWT_SECRET` | Secreto para firmar los tokens (obligatorio en producción) |
| `JWT_EXPIRES_IN` | Duración del token, por ejemplo `7d` |
| `MONGODB_URI` | Conexión a MongoDB (por defecto `mongodb://localhost:27017/uml_studio_ai`) |
| `AI_PROVIDER` | Proveedor de la conversación: `ollama` (por defecto) o `gemini` |
| `AI_VISION_PROVIDER` | Proveedor de las imágenes; por defecto, el mismo que `AI_PROVIDER` |
| `OLLAMA_BASE_URL` | Servidor Ollama: `http://localhost:11434` o la URL del túnel de Colab |
| `OLLAMA_MODEL` | Modelo de texto (por defecto `trazo`) |
| `OLLAMA_VISION_MODEL` | Modelo local con visión, p. ej. `qwen2.5vl:7b` (opcional) |
| `MODAL_KEY`, `MODAL_SECRET` | Tokens de proxy de Modal, si el servidor del modelo está en Modal |
| `OLLAMA_API_KEY` | Token si el servidor Ollama está detrás de un proxy con autenticación (opcional) |
| `GEMINI_API_KEY` | Clave de Google AI Studio |
| `GEMINI_MODEL` | Modelo principal de Gemini |
| `GEMINI_FALLBACK_MODEL` | Modelo de respaldo cuando el principal está saturado (opcional) |
| `SWAGGER_ENABLED` | `true` para publicar Swagger también en producción |

## API

Todas las rutas llevan el prefijo `/api` y, salvo registro, login y estado, requieren la cabecera `Authorization: Bearer <token>`. El detalle de cada cuerpo y respuesta está en Swagger.

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/auth/register` | Crear una cuenta |
| `POST` | `/auth/login` | Iniciar sesión |
| `GET`, `PATCH` | `/auth/me` | Ver o editar el perfil |
| `GET`, `POST` | `/projects` | Listar o crear proyectos |
| `GET`, `PATCH`, `DELETE` | `/projects/:id` | Ver, editar o borrar un proyecto |
| `GET` | `/projects/:id/activity` | Quién cambió qué en los diagramas (`since`, `userId`, `limit`) y la última conexión de quien consulta |
| `POST` | `/projects/:id/members` | Invitar a un miembro |
| `PATCH`, `DELETE` | `/projects/:id/members/:userId` | Cambiar el rol o quitar a un miembro |
| `POST` | `/diagrams` | Crear un diagrama |
| `GET` | `/diagrams/project/:projectId` | Diagramas de un proyecto |
| `GET`, `PATCH`, `DELETE` | `/diagrams/:id` | Ver, renombrar o borrar un diagrama |
| `PUT` | `/diagrams/:id/ast` | Guardar el contenido del diagrama |
| `GET` | `/chat/projects/:projectId/team` | Canal del equipo del proyecto (últimos mensajes) |
| `GET` | `/chat/projects/:projectId/direct` | Conversación privada con Trazo |
| `POST` | `/chat/projects/:projectId/messages` | Mensaje al canal (`team`) o privado (`direct`); con @Trazo (o en privado) responde Trazo (`202`: su respuesta llega por Socket.IO) |
| `POST` | `/chat/projects/:projectId/:channel/reset` | Nueva conversación (el canal del equipo, solo el administrador) |
| `POST` | `/chat/messages/:messageId/apply` | Aplicar una propuesta de Trazo |
| `POST` | `/ai/vision-diagram` | Digitalizar un diagrama desde una imagen (`202`) |
| `POST` | `/codegen/preview/:diagramId` | Vista previa del código generado |
| `POST` | `/codegen/download/:diagramId` | Descargar el código generado en `.zip` |
| `GET` | `/xmi/export/:diagramId` | Exportar a XMI |
| `POST` | `/xmi/import` | Importar un archivo XMI |
| `GET` | `/health` | Estado del servidor y de la base de datos |

### Eventos de colaboración

Socket.IO en el espacio de nombres `/collaboration`, autenticado con el mismo JWT.

| Evento | Uso |
| --- | --- |
| `join_room` / `leave_room` | Entrar o salir de la sala de un diagrama |
| `cursor_move` | Posición del cursor de cada usuario |
| `node_drag` | Movimiento de una clase en vivo |
| `lock_node` / `unlock_node` | Bloquear una clase mientras se edita |
| `diagram_sync` | Difundir los cambios del diagrama |
| `join_project` | Seguir el chat del proyecto sin abrir un diagrama (app móvil); `join_room` también une al chat del proyecto |
| `chat_message` | (servidor → proyecto o persona) Mensaje nuevo o actualizado del canal del equipo o de la conversación privada |
| `trazo_status` | (servidor → proyecto o persona) Trazo está respondiendo a alguien (`busy`, `userName`) o ha terminado |
| `chat_reset` | (servidor → proyecto o persona) Empezó una conversación nueva |
| `diagram_activity` | (servidor → proyecto) Se guardó un diagrama: quién lo cambió, nombre y número de clases (la app móvil lo notifica). Como el editor guarda solo cada pocos segundos, sale como mucho uno cada 30 s por diagrama; el último cambio de la ráfaga se avisa al cumplirse el plazo |

## Trazo e IA local

Trazo usa un **modelo open-source propio servido por el equipo**, no una API de terceros. El modelo `trazo` se define en [`ollama/Modelfile`](ollama/Modelfile): parte de **Qwen 2.5 Coder 7B** (Apache 2.0) y fija su identidad de mentor y sus parámetros (temperatura, ventana de contexto de 8192 tokens). El backend habla con la API de Ollama y le pasa un **esquema JSON** con la forma exacta de cada operación, de modo que la salida del modelo siempre es válida.

```bash
ollama pull qwen2.5-coder:7b
ollama create trazo -f ollama/Modelfile
ollama run trazo "¿Qué es un atributo derivado?"
```

Dónde puede correr el servidor del modelo (solo cambia `OLLAMA_BASE_URL`):

- **En Modal (producción)**: [`ollama/modal_app.py`](ollama/modal_app.py) sirve Ollama con `trazo` en una GPU T4 sin servidor. El contenedor se enciende al llegar una petición y se apaga tras 5 minutos sin uso, así que el modelo está siempre en línea pero solo consume crédito mientras responde (Modal regala 30 USD al mes). Ver [Modal](#servidor-del-modelo-en-modal).
- **En el propio equipo (desarrollo)**: `http://localhost:11434`. Con una GPU de 8 GB, como la RTX 5060 de desarrollo, cada respuesta tarda entre 5 y 10 segundos.
- **En un servidor controlado por el equipo**: Ollama escuchando en `0.0.0.0` (`OLLAMA_HOST=0.0.0.0`) y, si se publica, detrás de un proxy con token (`OLLAMA_API_KEY`).
- **En Google Colab**: [`ollama/trazo_colab.ipynb`](ollama/trazo_colab.ipynb) instala Ollama en una GPU T4, crea el modelo `trazo` y lo publica con un túnel de Cloudflare; la URL que imprime va en `OLLAMA_BASE_URL`.

Para cambiar de modelo base (por ejemplo `qwen3:8b`), edita la línea `FROM` del Modelfile y vuelve a ejecutar `ollama create`. Las fotos de diagramas las procesa Gemini (`AI_VISION_PROVIDER=gemini`) porque Qwen 2.5 Coder no lee imágenes; con `OLLAMA_VISION_MODEL=qwen2.5vl:7b` también pueden quedarse en local.

### Servidor del modelo en Modal

```bash
pip install modal
modal setup                                  # inicia sesión en Modal desde el navegador
modal run ollama/modal_app.py::prepare       # una vez: descarga Qwen y crea «trazo» en un volumen
modal deploy ollama/modal_app.py             # publica la API de Ollama y muestra su URL
```

La URL es privada: Modal exige los **tokens de proxy** (*Settings → Proxy Auth Tokens*) en las cabeceras `Modal-Key` y `Modal-Secret`. En el backend van en `MODAL_KEY` y `MODAL_SECRET`, y la URL en `OLLAMA_BASE_URL`. En AWS:

```bash
aws ssm put-parameter --overwrite --name /uml-studio/OLLAMA_BASE_URL --type String --value "https://<workspace>--trazo-serve.modal.run"
aws ssm put-parameter --name /uml-studio/MODAL_KEY --type SecureString --value "wk-..."
aws ssm put-parameter --name /uml-studio/MODAL_SECRET --type SecureString --value "ws-..."
```

y se vuelve a desplegar el backend (*Actions → Deploy → Run workflow*) para que lea los parámetros.

Tras unos minutos sin uso, la primera respuesta tarda más (hasta ~1 minuto) mientras Modal enciende la GPU y carga el modelo. Por eso Trazo responde de forma **asíncrona**: `POST /chat/projects/:id/messages` devuelve `202` con el mensaje guardado y la respuesta llega por Socket.IO (`chat_message` y, si hay cambios, `diagram_synced` en el lienzo); el chat avisa de que el servidor del modelo se está encendiendo.

### El orquestador: cómo conoce Trazo el contexto

Nadie habla directamente con el modelo. Entre el equipo y la única instancia de IA está el **orquestador** (`AiAssistantService`): recibe todos los mensajes del chat, los guarda y los difunde, y solo cuando alguien menciona a Trazo (o le escribe en privado) decide el lienzo, arma el contexto, llama al modelo, aplica y guarda los cambios y responde. Las peticiones de un proyecto se atienden de una en una para que cada respuesta vea las anteriores. El modelo no guarda nada entre peticiones: en cada una recibe todo lo que necesita.

```text
Ana: «@Trazo agrega Lote en #Inventario»
   │
   ▼
Orquestador (API en AWS)
   1. guarda y difunde el mensaje (MongoDB + Socket.IO)
   2. ¿menciona a Trazo? si no, termina aquí
   3. elige el lienzo: #Inventario › donde trabajó la persona nombrada › diagrama abierto › clases mencionadas › hilo › único diagrama
   4. arma el contexto ─────────────────────────────────────────────► Ollama «trazo» (Modal)
        · instrucción de mentor y formato de respuesta                         │
        · resumen de la conversación (MongoDB)                                 │
        · últimos 12 mensajes, cada uno con el nombre de su autor              │
        · proyecto, sus diagramas y quién está conectado y dónde               │
        · quién cambió qué en los lienzos (canvas_activity), si viene al caso  │
        · el lienzo elegido en texto compacto (PostgreSQL o la sala)           │
        · si piden una revisión, los problemas que detecta el sistema          │
        · el mensaje y quién lo escribe (y si puede editar)                    │
   5. ◄────────────────────────────── JSON: respuesta + operaciones ──────────┘
   6. aplica las operaciones, guarda el diagrama (PostgreSQL) y lo difunde al lienzo
   7. guarda la respuesta (MongoDB) y la envía al canal: «Ana, listo: agregué Lote en #Inventario»
```

### Qué se guarda en MongoDB

Base `uml_studio_ai`:

| Colección | Contenido |
| --- | --- |
| `chat_conversations` | El canal del equipo de cada proyecto y la conversación privada de cada persona con Trazo (las anteriores quedan como historial): quién la empezó, número de mensajes y el **resumen** de los mensajes antiguos |
| `chat_messages` | Cada mensaje: autor (id y nombre), texto, menciones, diagrama en el que actuó Trazo, intención (`answer`, `edit`, `propose`, `clarify`, `vision`), operaciones propuestas o aplicadas, estado de la propuesta y quién la aplicó, modelo, latencia y tokens |
| `canvas_activity` | **Quién hizo qué** en cada lienzo: persona (o «Trazo a pedido de X»), diagrama, cada cambio (clases, atributos, métodos y relaciones creados, cambiados o quitados, con su hora) y un resumen legible. Los cambios seguidos de la misma persona en el mismo diagrama durante 15 minutos se suman en una entrada; crear y luego borrar algo se anula |
| `project_presence` | Cuándo dejó cada persona el proyecto por última vez, para «¿qué hubo desde mi última conexión?» |

Cada petición envía al modelo: la instrucción de mentor, el resumen de la conversación, los últimos 12 mensajes (cada uno con el nombre de su autor), quién está conectado y con qué permiso, el diagrama actual en texto compacto y el mensaje nuevo. Cuando se acumulan más de 24 mensajes sin resumir, los más antiguos se resumen en segundo plano.

### Quién hizo qué

Cada edición que llega por `diagram_sync` se compara con el último estado conocido del diagrama y la diferencia se apunta a quien la envió; un guardado (`PUT /diagrams/:id/ast`) solo apunta lo que no llegó antes por el socket. Así, si Ana guarda un diagrama en el que también trabajó Luis, cada uno figura con lo suyo. Mover clases no cuenta como cambio.

Con eso Trazo responde, siempre a pedido:

- **Revisión dirigida**: «@Trazo revisa lo que hizo Marco» trabaja sobre el lienzo donde trabajó Marco, revisa solo sus cambios, nombra al autor y, si hay mejoras, deja una propuesta. Al pedir una revisión el sistema añade observaciones verificadas que un modelo de 7B suele pasar por alto: atributos que repiten una relación (`codigoProveedor` junto a la relación con `Proveedor`), clases sin `id` y dinero en `Double`.
- **Puesta al día**: «¿qué hizo Ana?», «¿qué han avanzado?» o «ponme al día» resumen la actividad por persona y diagrama; «desde mi última conexión» cuenta solo los cambios posteriores a la última vez que esa persona dejó el proyecto.

## Estructura

```text
src/
├── main.ts                 Arranque, prefijo /api, validación y Swagger
├── app.module.ts           Módulo raíz, guardias globales y límites de peticiones
├── health.controller.ts
├── common/                 Decoradores, filtro de errores, guardias e interceptor de respuestas
├── config/                 CORS, base de datos y JWT
└── modules/
    ├── auth/               Registro, login, perfil y usuario de prueba
    ├── projects/           Proyectos, miembros, control de acceso y gateway de colaboración
    ├── diagrams/           Diagramas, clases, atributos, métodos y relaciones
    ├── activity/           Quién hizo qué en los lienzos y última conexión de cada persona (MongoDB)
    ├── ai-assistant/       Trazo: proveedores (Ollama, Gemini), conversación en MongoDB, prompts y operaciones
    └── code-generator/     Generadores Spring Boot y Flutter (plantillas Mustache) y XMI
ollama/                     Modelfile del modelo propio, servidor en Modal y cuaderno de Colab
infra/                      Infraestructura de AWS (CloudFormation)
deploy/                     Compose de producción y scripts de despliegue en EC2
.github/workflows/          CI en pull requests y despliegue continuo a AWS
```

El asistente depende de la interfaz `AiProvider` (`modules/ai-assistant/providers`): `AI_PROVIDER` elige la implementación sin tocar el resto del módulo.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run start:dev` | Servidor con recarga automática |
| `npm run build` | Compilar a `dist/` |
| `npm run start:prod` | Ejecutar la versión compilada |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas de extremo a extremo (necesitan la base de datos del `.env`) |
| `npm run test:cov` | Pruebas con cobertura |
| `npm run lint` | Análisis estático con oxlint |
| `npm run format` | Formatear con Prettier |
