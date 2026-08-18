#!/usr/bin/env bash

set -euo pipefail

max_attempts="${PUSH_MAX_ATTEMPTS:-4}"
base_delay_seconds="${PUSH_RETRY_DELAY_SECONDS:-5}"

for attempt in $(seq 1 "${max_attempts}"); do
  echo "Synchronizing generated-data commit with origin/main (attempt ${attempt}/${max_attempts})."

  if git fetch origin main; then
    if ! git rebase origin/main; then
      git rebase --abort || true
      echo "::error::Generated-data push stopped because the commit conflicts with origin/main. Resolve the conflicting generated data explicitly before retrying."
      exit 1
    fi

    if git push origin HEAD:main; then
      echo "Generated-data commit pushed to origin/main."
      exit 0
    fi
  else
    echo "::warning::Could not fetch origin/main on attempt ${attempt}; retrying if attempts remain."
  fi

  if [ "${attempt}" -lt "${max_attempts}" ]; then
    delay_seconds=$((base_delay_seconds * attempt))
    echo "Push did not complete; retrying in ${delay_seconds} seconds."
    sleep "${delay_seconds}"
  fi
done

echo "::error::Could not push the generated-data commit to origin/main after ${max_attempts} attempts. A concurrent update or transient Git failure may still be present."
exit 1
