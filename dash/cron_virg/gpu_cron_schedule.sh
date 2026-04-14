#!/bin/bash
# crontab -l => check current cron jobs
# crontab -e => edit cron jobs
# crontab -r => remove all cron jobs
# Add the GPU push script to crontab (runs every 2 minutes)
# This writes roughly 21,600 entries per month (fits within upstash)

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON=$(which python3)
SCRIPT="$DIR/push_gpus.py"
LOG="$DIR/push_gpus.log"

(crontab -l 2>/dev/null; echo "*/2 * * * * $PYTHON $SCRIPT >> $LOG 2>&1") | crontab -

echo "Cron job installed successfully!"
echo "Python: $PYTHON"
echo "Script: $SCRIPT"
echo "Log:    $LOG"