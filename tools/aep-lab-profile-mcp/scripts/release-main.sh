#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'release-main: %s\n' "$*" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail 'usage: bash tools/aep-lab-profile-mcp/scripts/release-main.sh <40-character SHA>'
[[ "$1" =~ ^[[:xdigit:]]{40}$ ]] || fail 'expected one 40-character SHA'
readonly SHA="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
readonly PROJECT_ID='aep-orchestration-lab'
readonly REGION='us-central1'
readonly SERVICE='aep-lab-profile-mcp'
readonly IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}:${SHA}"
readonly REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")/../../.." rev-parse --show-toplevel)"

cd "$REPO_ROOT"
origin_url="$(git remote get-url origin)"
case "$origin_url" in
  https://github.com/adampadobe/AEP-Orchestration-Lab.git|git@github.com:adampadobe/AEP-Orchestration-Lab.git) ;;
  *) fail "origin must be the adampadobe/AEP-Orchestration-Lab repository (got ${origin_url})" ;;
esac

git fetch origin
current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == 'main' ]] || fail "releases are allowed only from main (current branch: ${current_branch})"
[[ -z "$(git status --porcelain)" ]] || fail 'the working tree must be clean'
origin_main="$(git rev-parse origin/main)"
[[ "$origin_main" == "$SHA" ]] || fail "requested SHA must equal freshly fetched origin/main (${origin_main})"
git merge --ff-only origin/main
[[ "$(git rev-parse HEAD)" == "$SHA" ]] || fail 'HEAD must equal the requested SHA after fast-forward'

account="$(CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration --project=aep-orchestration-lab config get-value account 2>/dev/null)"
project="$(CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration --project=aep-orchestration-lab config get-value project 2>/dev/null)"
[[ "$account" == 'apalmer@adobe.com' ]] || fail "gcloud account must be apalmer@adobe.com (got ${account})"
[[ "$project" != 'adbe-gcp0819' ]] || fail 'refusing the unrelated adbe-gcp0819 project'
[[ "$project" == 'aep-orchestration-lab' ]] || fail "gcloud configuration project must be aep-orchestration-lab (got ${project})"

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/aep-mcp-release.XXXXXX")"
before_json="${temp_dir}/service-before.json"
after_json="${temp_dir}/service-after.json"
cleanup() {
  rm -f "$before_json" "$after_json"
  rmdir "$temp_dir"
}
trap cleanup EXIT

cd "${REPO_ROOT}/tools/aep-lab-profile-mcp"
CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration \
  run services describe "$SERVICE" --region="$REGION" --project=aep-orchestration-lab \
  --format=json >"$before_json"

binding_names() {
  python3 - "$1" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    service = json.load(source)

names = set()
containers = service.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
for container in containers:
    for entry in container.get("env", []):
        env_name = entry.get("name")
        if env_name:
            names.add(f"env:{env_name}")
        secret = entry.get("valueFrom", {}).get("secretKeyRef", {})
        if env_name and secret.get("name"):
            names.add(f"secret:{env_name}:{secret['name']}")
print("\n".join(sorted(names)))
PY
}

before_bindings="$(binding_names "$before_json")"
[[ -n "$before_bindings" ]] || fail 'the existing service has no runtime bindings to verify'

CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration \
  builds submit --tag "$IMAGE" --project=aep-orchestration-lab .

CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration \
  run services update "$SERVICE" \
  --image "$IMAGE" \
  --region="$REGION" \
  --project=aep-orchestration-lab \
  --platform=managed

CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration gcloud --configuration=aep-orchestration \
  run services describe "$SERVICE" --region="$REGION" --project=aep-orchestration-lab \
  --format=json >"$after_json"
after_bindings="$(binding_names "$after_json")"
[[ "$after_bindings" == "$before_bindings" ]] || fail 'environment or secret binding names changed during the image-only update'

readback="$(python3 - "$after_json" "$IMAGE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    service = json.load(source)
expected_image = sys.argv[2]

status = service.get("status", {})
revision = status.get("latestReadyRevisionName")
url = status.get("url")
traffic = status.get("traffic", [])
images = {
    container.get("image")
    for container in service.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    if container.get("image")
}
if not revision or not url:
    raise SystemExit("Cloud Run readback omitted the latest ready revision or service URL")
if expected_image not in images:
    raise SystemExit("Cloud Run service does not reference the requested immutable SHA image")
if not any(entry.get("revisionName") == revision and int(entry.get("percent", 0)) == 100 for entry in traffic):
    raise SystemExit("the latest ready revision does not receive 100% of traffic")
print(f"{revision}\n{url}")
PY
)" || fail 'Cloud Run revision or traffic verification failed'
revision="${readback%%$'\n'*}"
service_url="${readback#*$'\n'}"

curl --fail --silent --show-error "${service_url%/}/health" >/dev/null
printf 'Cloud Run release verified: %s (%s)\n' "$revision" "$SHA"
