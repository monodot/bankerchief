#!/usr/bin/env bash
# gen-indexes.sh <data-dir>
# Writes an index.json into every directory under <data-dir>.
# Format matches Caddy's file_server browse JSON: [{"name","is_dir"}]
set -euo pipefail

root="${1:?Usage: gen-indexes.sh <data-dir>}"

find "$root" -type d | while IFS= read -r dir; do
    find "$dir" -maxdepth 1 -mindepth 1 \
        ! -name '.*' ! -name 'index.json' \
        | sort \
        | while IFS= read -r f; do
            name="$(basename "$f")"
            if [ -d "$f" ]; then
                printf '{"name":"%s/","is_dir":true}\n' "$name"
            else
                printf '{"name":"%s","is_dir":false}\n' "$name"
            fi
          done \
        | jq -s '.' > "$dir/index.json"
done

echo "index.json written under $root"
