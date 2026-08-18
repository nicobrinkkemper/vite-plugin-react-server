#!/usr/bin/env bash
# Bead ids (bd-xxxx) reference a private local tracker and mean nothing to
# readers of the published repo. Keep them out of source, tests, scripts, and
# docs; commit messages are the place for issue references.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if git grep -nE '\bbd-[a-z0-9]+\b' -- plugin test scripts docs README.md \
  ':!scripts/check-no-bead-ids.sh'; then
  echo "✗ bead ids found in source (above) — keep tracker references in commit messages" >&2
  exit 1
fi
echo "✓ no bead ids in source"
