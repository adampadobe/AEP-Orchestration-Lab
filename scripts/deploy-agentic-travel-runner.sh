#!/usr/bin/env bash
# Deploy services/agentic-travel-runner to Cloud Run (prod lab project).
# Prerequisites: gcloud auth, Secret Manager secret AGENTIC_TRAVEL_RUNNER_HMAC_SECRET.
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-aep-orchestration-lab}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-agentic-travel-runner}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PN="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${PN}-compute@developer.gserviceaccount.com"

for SEC in AGENTIC_TRAVEL_RUNNER_HMAC_SECRET; do
  gcloud secrets add-iam-policy-binding "$SEC" --project="$PROJECT_ID" \
    --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null || true
done

cd "$ROOT/services/agentic-travel-runner"
gcloud builds submit --tag "gcr.io/${PROJECT_ID}/${SERVICE}" --project="$PROJECT_ID" .

gcloud run deploy "${SERVICE}" \
  --image "gcr.io/${PROJECT_ID}/${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --set-secrets "RUNNER_HMAC_SECRET=AGENTIC_TRAVEL_RUNNER_HMAC_SECRET:latest" \
  --memory 1Gi \
  --timeout 900 \
  --min-instances 0 \
  --max-instances 5 \
  --vpc-connector snowflake-egress \
  --vpc-egress all-traffic

echo "Runner URL: $(gcloud run services describe "${SERVICE}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
echo "Set functions/.env.${PROJECT_ID} AGENTIC_TRAVEL_RUNNER_URL to that URL, then redeploy Snowflake functions."
