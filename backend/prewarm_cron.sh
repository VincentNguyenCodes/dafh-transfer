#!/bin/bash
cd "/Users/vincentnguyen/Documents/Coding/Personal Projects/DAFH Transfer/backend"
source ../venv/bin/activate
python manage.py prewarm_advisories >> /tmp/dafh_prewarm.log 2>&1
echo "--- $(date) ---" >> /tmp/dafh_prewarm.log
