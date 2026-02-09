#!/usr/bin/env bash
# Build Hugo for both Vercel and Cloudflare Pages (correct baseURL per platform)

set -e

if [ -n "$CF_PAGES_URL" ]; then
  # Cloudflare Pages: CF_PAGES_URL is the full deployment URL
  BASE="${CF_PAGES_URL%/}"
  export HUGO_BASEURL="${BASE}/"
elif [ -n "$VERCEL_URL" ]; then
  # Vercel: VERCEL_URL is hostname only
  export HUGO_BASEURL="https://${VERCEL_URL}/"
else
  # Local or fallback: use hugo.toml default
  export HUGO_BASEURL="https://myblog.vercel.app/"
fi

hugo --minify --baseURL="$HUGO_BASEURL"
