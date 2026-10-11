# Daily Delta production baseline — 2026-10-10

This dedicated branch checkpoints the current live source before notification-group deduplication changes. It deliberately has independent history: unrelated workspace changes and historical runtime data were not published.

## Scope
Watch Desk frontend, service worker, alert publisher and catalog builders; Reddit and RWI scanner source; Fitness source included because that server hosts the shared Watch push API. No application behavior was changed for this checkpoint.

## Rollback
Use this commit/tag as the source baseline. Restore only the files changed by the subsequent fix; do not reset the entire shared workspace. For the planned deduplication change this means the alert sender and any new helper/tests. Compare file hashes against SOURCE-MANIFEST.json before and after. Restart only affected services when needed; one-shot scanner scripts load on their next run.

Do NOT roll back runtime state routinely: restoring old notification history can replay alerts. Subscriptions, VAPID credentials, SQLite state, scanner datasets and launch configuration have a separate private local backup at .checkpoints/watch-desk-20261010/private-runtime in the original workspace. SQLite was backed up through its online backup API. Filesystem datasets were copied while services were running, so they are not an atomic cross-service snapshot.

## Continuing development
Make subsequent scoped changes on this branch in the checkpoint checkout, test offline, then deploy only reviewed files to the existing workspace paths. Commit and push each change separately. Do not commit generated data, secrets or subscription endpoints. No deduplication fix is included here. A runtime restore/redeployment has not been exercised.
