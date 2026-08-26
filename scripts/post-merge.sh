#!/usr/bin/env bash
set -euo pipefail

# Do not migrate the shared development database as a side effect of merging.
pnpm install --frozen-lockfile
pnpm run typecheck
