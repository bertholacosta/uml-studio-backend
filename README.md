# UML Studio · Backend

API de **UML Studio**, un editor colaborativo de diagramas de clases UML con asistente de IA y generación de código.
Este repositorio contiene el servidor: autenticación, proyectos y permisos, persistencia de diagramas, colaboración en tiempo real, el asistente **Trazo** (un modelo open-source propio servido con Ollama, con la conversación en MongoDB), importación/exportación XMI y los generadores de código Spring Boot y Flutter.

El cliente web está en el repositorio del frontend (`sw1_parcial1_frontend`).

## Funcionalidades

- **Cuentas y sesiones** con JWT y contraseñas cifradas con bcrypt. Todas las rutas son privadas salvo las marcadas con `@Public()`.
- **Proyectos con roles** (`OWNER`, `EDITOR`, `VIEWER`): invitar por correo, cambiar el rol o quitar miembros. El acceso se comprueba en un único servicio (`ProjectAccessService`).
- **Diagramas de clases** guardados como clases, atributos, métodos y relaciones (asociación, agregación, composición, herencia, dependencia, realización y clase de asociación) con sus multiplicidades.
- **Colaboración en tiempo real** con Socket.IO: una sala por diagrama con presencia, cursores, arrastre en vivo, bloqueo de clases mientras alguien las edita y sincronización de cambios. El estado de la sala vive en memoria.
- **Trazo, mentor del equipo en la pizarra** (ver [Trazo e IA local](#trazo-e-ia-local)):
  - Actúa como desarrollador senior: explica conceptos (atributo derivado, composición, multiplicidades…) con ejemplos del propio diagrama, revisa el modelo y propone mejoras.
  - **Conversación compartida**: la pregunta de cualquier colaborador y la respuesta de Trazo llegan en tiempo real a todos los que tienen abierto el diagrama, en cualquier navegador.
  - **Distingue quién le habla**: cada mensaje lleva el nombre de su autor, Trazo se dirige a esa persona por su nombre y conoce quién está conectado y con qué permiso.
  - Según el mensaje, **responde**, **edita** el diagrama (operaciones `add_class`, `update_class`, `add_relation`…) o deja una **propuesta** que cualquier editor aplica con un botón. A los lectores siempre les propone, nunca edita.
  - Toda la interacción y el contexto se guardan en **MongoDB**; los mensajes antiguos se resumen solos para no perder el hilo.
  - Atiende las peticiones de un mismo diagrama en orden y trabaja sobre el diagrama más reciente de la sala.
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

- Node.js 22 o superior
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

**Servidor del modelo (opcional, EC2 con GPU):** lanza una g5.xlarge con una AMI *Deep Learning Base OSS Nvidia Driver*, clona este repositorio y ejecuta `sudo bash deploy/ollama-server.sh`. Permite el puerto 11434 solo desde el grupo de seguridad de la API (salida `ApiSecurityGroupId`) y guarda `http://<ip-privada>:11434` en `/uml-studio/OLLAMA_BASE_URL`. Las cuentas nuevas tienen cuota 0 para instancias G: pide el aumento («Running On-Demand G and VT instances») con antelación. Apágala cuando no se use.

**Límites a tener en cuenta:** CloudFront espera a la API como máximo 60 s, por eso `AI_TIMEOUT_MS` es 55 000 en producción. La EC2 t3.medium cuesta del orden de 30 USD al mes encendida todo el tiempo; detenerla fuera de las sesiones de trabajo alarga el crédito.

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
| `POST` | `/projects/:id/members` | Invitar a un miembro |
| `PATCH`, `DELETE` | `/projects/:id/members/:userId` | Cambiar el rol o quitar a un miembro |
| `POST` | `/diagrams` | Crear un diagrama |
| `GET` | `/diagrams/project/:projectId` | Diagramas de un proyecto |
| `GET`, `PATCH`, `DELETE` | `/diagrams/:id` | Ver, renombrar o borrar un diagrama |
| `PUT` | `/diagrams/:id/ast` | Guardar el contenido del diagrama |
| `GET` | `/ai/diagrams/:diagramId/conversation` | Conversación compartida con Trazo (últimos mensajes) |
| `POST` | `/ai/diagrams/:diagramId/conversation` | Empezar una conversación nueva para toda la pizarra |
| `POST` | `/ai/prompt` | Pregunta o instrucción a Trazo |
| `POST` | `/ai/messages/:messageId/apply` | Aplicar una propuesta de Trazo |
| `POST` | `/ai/vision-diagram` | Digitalizar un diagrama desde una imagen |
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
| `ai_message` | (servidor → sala) Mensaje nuevo o actualizado de la conversación con Trazo |
| `ai_status` | (servidor → sala) Trazo está respondiendo a alguien (`busy`, `userName`) o ha terminado |
| `ai_conversation_reset` | (servidor → sala) Alguien empezó una conversación nueva |

## Trazo e IA local

Trazo usa un **modelo open-source propio servido por el equipo**, no una API de terceros. El modelo `trazo` se define en [`ollama/Modelfile`](ollama/Modelfile): parte de **Qwen 2.5 Coder 7B** (Apache 2.0) y fija su identidad de mentor y sus parámetros (temperatura, ventana de contexto de 8192 tokens). El backend habla con la API de Ollama y le pasa un **esquema JSON** con la forma exacta de cada operación, de modo que la salida del modelo siempre es válida.

```bash
ollama pull qwen2.5-coder:7b
ollama create trazo -f ollama/Modelfile
ollama run trazo "¿Qué es un atributo derivado?"
```

Dónde puede correr el servidor del modelo (solo cambia `OLLAMA_BASE_URL`):

- **En el propio equipo**: `http://localhost:11434`. Con una GPU de 8 GB, como la RTX 5060 de desarrollo, cada respuesta tarda entre 5 y 10 segundos.
- **En un servidor controlado por el equipo**: Ollama escuchando en `0.0.0.0` (`OLLAMA_HOST=0.0.0.0`) y, si se publica, detrás de un proxy con token (`OLLAMA_API_KEY`).
- **En Google Colab**: [`ollama/trazo_colab.ipynb`](ollama/trazo_colab.ipynb) instala Ollama en una GPU T4, crea el modelo `trazo` y lo publica con un túnel de Cloudflare; la URL que imprime va en `OLLAMA_BASE_URL`.

Para cambiar de modelo base (por ejemplo `qwen3:8b`), edita la línea `FROM` del Modelfile y vuelve a ejecutar `ollama create`. Las fotos de diagramas las procesa Gemini (`AI_VISION_PROVIDER=gemini`) porque Qwen 2.5 Coder no lee imágenes; con `OLLAMA_VISION_MODEL=qwen2.5vl:7b` también pueden quedarse en local.

### Qué se guarda en MongoDB

Base `uml_studio_ai`:

| Colección | Contenido |
| --- | --- |
| `ai_conversations` | Una conversación activa por diagrama (las anteriores quedan como historial): quién la empezó, número de mensajes y el **resumen** de los mensajes antiguos |
| `ai_messages` | Cada pregunta y respuesta: autor (id y nombre), texto, intención (`answer`, `edit`, `propose`, `clarify`, `vision`), operaciones propuestas o aplicadas, estado de la propuesta y quién la aplicó, modelo, latencia y tokens |

Cada petición envía al modelo: la instrucción de mentor, el resumen de la conversación, los últimos 12 mensajes (cada uno con el nombre de su autor), quién está conectado y con qué permiso, el diagrama actual en texto compacto y el mensaje nuevo. Cuando se acumulan más de 24 mensajes sin resumir, los más antiguos se resumen en segundo plano.

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
    ├── ai-assistant/       Trazo: proveedores (Ollama, Gemini), conversación en MongoDB, prompts y operaciones
    └── code-generator/     Generadores Spring Boot y Flutter (plantillas Mustache) y XMI
ollama/                     Modelfile del modelo propio y cuaderno de Colab
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
