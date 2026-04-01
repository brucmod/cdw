#!/bin/bash
# cdw-sync.sh
# Checks the remote git repo for changes to CDW JSON data files and pulls
# them if any are found.  Run via cron every 5 minutes (or adjust as needed).
#
# ── Setup ────────────────────────────────────────────────────────────────────
# 1. Copy this file to the VM:        scp server/cdw-sync.sh user@vm:/opt/cdw-sync.sh
# 2. Make it executable:              chmod +x /opt/cdw-sync.sh
# 3. Open the crontab for www-data:   sudo crontab -u www-data -e
# 4. Add this line (runs every 5 min):
#       */5 * * * * /opt/cdw-sync.sh >> /var/log/cdw-sync.log 2>&1
# 5. Create the log file:             sudo touch /var/log/cdw-sync.log
#                                     sudo chown www-data:www-data /var/log/cdw-sync.log
# ─────────────────────────────────────────────────────────────────────────────

# Directory where the git repo is checked out (web root)
REPO_DIR="/var/www/html/cdw"

# Files to watch for changes
DATA_FILES=(
  "CDW_data_.json"
  "dcs_data.json"
  "canada_data.json"
  "CDW_accounts.json"
)

TIMESTAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$REPO_DIR" || { echo "$TIMESTAMP ERROR: Cannot cd to $REPO_DIR"; exit 1; }

# Fetch latest refs from origin (quiet — only log errors)
git fetch origin 2>&1 | grep -v '^$' | sed "s/^/$TIMESTAMP FETCH: /"

# Determine the remote tracking branch (e.g. origin/main)
BRANCH="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)"
if [ -z "$BRANCH" ]; then
  BRANCH="origin/main"
fi

# Check if any watched data file differs between local HEAD and remote
CHANGED=0
CHANGED_FILES=()
for f in "${DATA_FILES[@]}"; do
  if ! git diff --quiet HEAD "$BRANCH" -- "$f" 2>/dev/null; then
    CHANGED=1
    CHANGED_FILES+=("$f")
  fi
done

# Pull only if something changed
if [ "$CHANGED" -eq 1 ]; then
  echo "$TIMESTAMP Changes detected in: ${CHANGED_FILES[*]}"
  git pull origin 2>&1 | sed "s/^/$TIMESTAMP PULL: /"
  echo "$TIMESTAMP Pull complete."
fi
# No log entry when nothing changed — keeps the log file clean

