#!/usr/bin/env bash
set -euo pipefail

# codepolicy benchmark runner
# Usage: bash tools/benchmark.sh [config]
#   config: codepolicy config file (default: .codepolicy.self.yml)

CONFIG="${1:-.codepolicy.self.yml}"
DATE="$(date +%Y-%m-%d)"
TIMEOUT=600

# Find next version number: docs/benchmark/{DATE}-v{NNN}
next_version=1
for d in docs/benchmark/${DATE}-v[0-9][0-9][0-9]/; do
  [[ -d "$d" ]] || continue
  v="${d##*-v}"
  v="${v%/}"
  v=$((10#$v))  # strip leading zeros
  (( v >= next_version )) && next_version=$((v + 1))
done
OUTDIR="docs/benchmark/${DATE}-v$(printf '%03d' "$next_version")"

MODELS=(
 "github-copilot/gpt-4.1"
 # "openai/gpt-5.3-codex"
 # "openai/gpt-5.2-codex"
 # "openai/gpt-5.4"
 # "claude-haiku-4-5"
 # "claude-sonnet-4-6"
 # "claude-opus-4-6"
 # "opencode/minimax-m2.5-free"
 # "opencode/gpt-5-nano"
 # "openai/codex-mini-latest"
 # "cerebras/gpt-oss-120b"
 # "cerebras/zai-glm-4.7"
)

model_to_filename() {
  echo "$1" | tr '/' '--'
}

cleanup_opencode() {
  pkill -9 -f opencode 2>/dev/null || true
  sleep 1
  local pid
  pid=$(lsof -ti:4096 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
  fi
}

print_summary() {
  echo ""
  echo "=== Benchmark Summary (${DATE}) ==="
  if [[ ${#RESULTS[@]} -eq 0 ]]; then
    echo "(no results)"
  else
    for line in "${RESULTS[@]}"; do
      echo "$line"
    done
  fi
  echo ""
  echo "Logs saved to: ${OUTDIR}/"
}

CHILD_PID=""

kill_tree() {
  local pid=$1
  local children
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  for cpid in $children; do
    kill_tree "$cpid"
  done
  kill -KILL "$pid" 2>/dev/null || true
}

on_sigint() {
  trap '' INT  # prevent re-entry during cleanup
  echo ""
  echo "*** Interrupted (Ctrl+C) ***"
  if [[ -n "$CHILD_PID" ]]; then
    kill_tree "$CHILD_PID"
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  cleanup_opencode
  print_summary
  exit 130
}

trap on_sigint INT

mkdir -p "$OUTDIR"

echo "=== codepolicy benchmark ==="
echo "date:   ${DATE}"
echo "config: ${CONFIG}"
echo "models: ${#MODELS[@]}"
echo "outdir: ${OUTDIR}"
echo ""

declare -a RESULTS=()

for model in "${MODELS[@]}"; do
  filename="$(model_to_filename "$model")"
  logfile="${OUTDIR}/${filename}.log"

  echo "--- Running: ${model} ---"
  cleanup_opencode

  start_ts="$(date +%s)"
  start_iso="$(date --iso-8601=seconds)"

  {
    echo "=== codepolicy benchmark ==="
    echo "model: ${model}"
    echo "date: ${start_iso}"
    echo "config: ${CONFIG}"
    echo "====================================="
    echo ""
  } > "$logfile"

  env -u CLAUDECODE timeout "$TIMEOUT" \
    bun run src/cli/entry.ts --config="$CONFIG" --agent="$model" --verbose \
    >> "$logfile" 2>&1 &
  CHILD_PID=$!
  set +e
  wait "$CHILD_PID" 2>/dev/null
  exit_code=$?
  set -e
  CHILD_PID=""

  end_ts="$(date +%s)"
  wall_time=$(( end_ts - start_ts ))

  {
    echo ""
    echo "====================================="
    echo "exit_code: ${exit_code}"
    echo "wall_time_seconds: ${wall_time}"
  } >> "$logfile"

  pass_count=$(grep -c '^\[codepolicy\]   PASS' "$logfile" || true)
  fail_count=$(grep -c '^\[codepolicy\]   FAIL' "$logfile" || true)

  RESULTS+=("$(printf "%-35s exit=%-3s time=%3ss  pass=%-2s fail=%s" \
    "$model" "$exit_code" "$wall_time" "$pass_count" "$fail_count")")

  echo "  -> exit=${exit_code}  time=${wall_time}s  pass=${pass_count} fail=${fail_count}"
  echo "  -> ${logfile}"
  echo ""

  sleep 3
done

cleanup_opencode
print_summary
