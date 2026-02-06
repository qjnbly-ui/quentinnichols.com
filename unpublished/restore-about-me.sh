#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to restore files." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git worktree." >&2
  exit 1
fi

files=(
  "index.html"
  "sitemap.xml"
  "AI/site_text_data/homepage.md"
  "AI/site_text_data/about-me.md"
  "AI/site_text_data/about-me-emt.md"
  "AI/site_text_data/about-me-guard-school.md"
  "AI/site_text_data/about-me-new-zealand.md"
  "AI/site_text_data/about-me-rorc.md"
  "AI/site_text_data/about-me-trees-llc.md"
  "about-me/index.html"
  "about-me/emt/index.html"
  "about-me/guard-school/index.html"
  "about-me/new-zealand/index.html"
  "about-me/rorc/index.html"
  "about-me/trees-llc/index.html"
)

echo "Restoring About Me pages and references from git..."

git checkout -- "${files[@]}"

echo "Done."
