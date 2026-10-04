#!/usr/bin/env bash
# Ship the SLO roadmap price drop to $197 ($297 crossed out), built on branch slo-197.
# Run on Chris's Mac from anywhere:  bash ~/Developer/fundhub-platform/scripts/ship-slo-197.sh
# 1) merge slo-197 into main  2) show what the deploy would ship and wait for "yes"
# 3) deploy (charge becomes $197, Meta value 197)  4) push only the /roadmap sales page to ClickFunnels
set -euo pipefail
cd "$(dirname "$0")/.."
git checkout main
git merge --no-edit slo-197
echo; echo "=== What the deploy would ship (dry run, nothing changes) ==="
npm run ship -- --dry
echo
read -r -p "Ship everything above to production? Type yes: " ok
[ "$ok" = "yes" ] || { echo "Stopped. Nothing deployed. main still has the merge."; exit 1; }
npm run ship
node scripts/cf-push-custom-html.mjs push --only=slo-297-sales --dry-run
node scripts/cf-push-custom-html.mjs push --only=slo-297-sales
echo
echo "Done. Open https://apply.fundhub.ai/roadmap and check every price says \$197 (look only, don't pay)."
