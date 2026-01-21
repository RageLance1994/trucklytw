#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="truckly-backend"
REGION="europe-west1"
PROJECT_ID="truckly-477816"
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ File .env non trovato"
  exit 1
fi

echo "🔄 Sync env vars from $ENV_FILE to Cloud Run service $SERVICE_NAME"

gcloud run services update "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --env-vars-file "$ENV_FILE"

echo "✅ Environment variables aggiornate con successo"
