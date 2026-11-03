# Backup and restore

The **Backup / Restore** page has Backup and Restore sections. Both separate Automatic and Manual snapshots. Manual creation requires `backups.create`; restoring requires the protected super admin, their current password, and typing `RESTORE`.

Backups are private SQLite `VACUUM INTO` snapshots in `storage/backups/`, with integrity/foreign-key checks and SHA-256 manifests. Incomplete snapshots are not listed. The newest 30 automatic snapshots are retained; manual snapshots and pre-restore safety snapshots are not automatically removed. Backups contain private business/user data and must not be published or committed. Their directory is excluded from Git and blocked by the app's web rules.

Restore verifies the stored checksum and database integrity, stages a candidate, records an automatic manual safety backup, then replaces the database under an exclusive workspace lock. All API requests and the CLI scheduler participate in that lock. Restore revokes user sessions. The current super admin password is preserved to prevent lockout; the rest of database data comes from the snapshot. Backup files, schedule configuration and application code remain outside the restored database. Tests restore disposable copies only. Older private backups made before this feature are not imported into these lists.

## Daily schedule

`.github/workflows/nightly-backup.yml` schedules `0 19 * * *` in UTC, equivalent to midnight Asia/Karachi. It calls the backup-only endpoint with the repository secret `APG_BACKUP_TOKEN`. The matching token is in the private `storage/backup-schedule.json`, never in Git. The endpoint cannot restore data, requires POST and constant-time token validation, and creates at most one successful automatic snapshot per Pakistan calendar date. A verification run creates the initial automatic snapshot immediately. Successful/failed checks appear on the page. Backups stay on Hostinger; the workflow receives only result metadata.

GitHub schedules are best effort: jobs can be delayed, and public-repository schedules can be disabled after 60 days without repository activity. The app displays this limitation and the last success so a stopped schedule is visible. See [GitHub scheduling documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). For an independent native Hostinger schedule, use hPanel Cron Jobs; the shared-host SSH shell does not expose `crontab`.

The native command is `/usr/bin/php /home/u729645683/domains/azadpakistangoods.com/public_html/bin/backup.php`. Set minute `0`, hour `19` if hPanel uses UTC (or `0` if configured to Asia/Karachi). Verify the panel timezone. The CLI and external scheduler share the same daily deduplication, so using both cannot create two automatic snapshots for one date. If changing scheduler, update the private driver/status configuration without exposing its token.

## Validation

- `python3 tests/backups.py`: automatic/manual snapshots, deduplication, damage/password/confirmation/access checks, safety snapshot, real restore on a copy, session revocation.
- `python3 tests/backups_browser.py`: mobile tabs, both lists, manual backup, explicit restore confirmation and sign-out. Uses the Playwright/Chrome environment documented for print tests.

A backup on the same host protects against application/data mistakes but is not off-site disaster recovery. No customer database is uploaded to GitHub.
