#!/usr/bin/env bash
# Despliega una imagen de la API en la EC2. Lo ejecuta GitHub Actions mediante SSM Run Command.
#   remote-deploy.sh <imagen-ecr> <región> <app-name>
set -euo pipefail

IMAGE=$1
REGION=$2
APP_NAME=$3
COMPOSE=(docker compose -f docker-compose.prod.yml)

cd "$(dirname "$0")"

# Variables de producción: todo lo que hay en Parameter Store bajo /<app-name>/
aws ssm get-parameters-by-path --region "$REGION" --path "/$APP_NAME/" --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    echo "${name##*/}=$value"
  done > .env.tmp
{
  echo "API_IMAGE=$IMAGE"
  echo "AWS_REGION=$REGION"
  echo "APP_NAME=$APP_NAME"
} >> .env.tmp
mv .env.tmp .env
chmod 600 .env

aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "${IMAGE%%/*}"

# Bases de datos primero; el esquema es idempotente y se aplica en cada despliegue
"${COMPOSE[@]}" up -d --wait db mongo
"${COMPOSE[@]}" exec -T db psql -U postgres -d uml_studio_db -v ON_ERROR_STOP=1 -q \
  -f /docker-entrypoint-initdb.d/schema.sql

"${COMPOSE[@]}" pull api
"${COMPOSE[@]}" up -d --remove-orphans api

for _ in $(seq 1 30); do
  if curl -fsS http://localhost:3000/api/health > /dev/null; then
    echo "API desplegada: $IMAGE"
    docker image prune -f > /dev/null
    exit 0
  fi
  sleep 5
done

echo "La API no respondió a /api/health" >&2
"${COMPOSE[@]}" ps
exit 1
