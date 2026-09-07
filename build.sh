#!/usr/bin/env bash
# Build with the deployment's public URL; keep Vercel analytics off other hosts.
set -euo pipefail

if [ "${VERCEL:-}" = "1" ]; then
  export HUGO_PARAMS_VERCELANALYTICS=true
  if [ "${VERCEL_ENV:-}" = "production" ]; then
    export HUGO_BASEURL="https://${VERCEL_PROJECT_PRODUCTION_URL:-myblog-snowy-three.vercel.app}/"
  else
    export HUGO_BASEURL="https://${VERCEL_URL}/"
  fi
elif [ -n "${CF_PAGES_URL:-}" ]; then
  export HUGO_BASEURL="${CF_PAGES_URL%/}/"
fi

hugo --minify
