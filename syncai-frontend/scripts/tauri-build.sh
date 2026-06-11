#!/bin/bash
set -e

PAGE="src/app/(app)/rooms/[id]/page.tsx"
TAURI_PAGE="src/app/(app)/rooms/[id]/page.tauri.tsx"
BACKUP="src/app/(app)/rooms/[id]/page.web.bak"

cp "$PAGE" "$BACKUP"
cp "$TAURI_PAGE" "$PAGE"

cleanup() {
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$PAGE"
    rm "$BACKUP"
  fi
}
trap cleanup EXIT

TAURI=1 next build
