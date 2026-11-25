# Free encrypted database recovery

Supabase remains on its Free plan. On 2026-11-25 the linked project listed no
available managed backups and PITR was disabled. The operator requested a free
alternative. The GitHub workflow is prepared for nightly encrypted logical
exports; coverage is not active until setup and a real export succeed.

## Activate without paid usage

1. In GitHub account **Settings → Billing and licensing → Budgets and alerts**,
   verify an Actions product budget of **$0**, with **Stop usage when budget limit
   is reached** enabled. Keep any existing stricter limits. Do not add a payment
   method or increase a paid allowance for this workflow.
2. In this repository's **Settings → Secrets and variables → Actions**, add the
   secret `VERITAS_BACKUP_DB_URL`. Use this Supabase project's **Connect → Session
   pooler** PostgreSQL URL, port **5432**, with the database password filled in.
   Percent-encode special characters in the password. Never paste it in chat,
   a commit, a log or an issue. The secret grants the runner database read access;
   use only trusted workflow code. The script restricts the target project and
   requires hosted TLS. Transaction mode on port 6543 is rejected.
3. After the budget is verified, add the repository variable
   `VERITAS_BACKUPS_FREE_STORAGE_CONFIRMED` with value `true`. This explicitly
   activates the backup job. Leave it unset until the spending guard is ready.
4. Open **Actions → Encrypted database backup → Run workflow**, choose `main`,
   and inspect the run. A skipped job is not a backup. Confirm a successful upload
   of both `database.dump.age` and its SHA-256 sidecar. Verify the first production
   archive by decrypting and restoring into a controlled isolated target.
5. Enable GitHub workflow failure notifications and periodically inspect the last
   successful run and archive expiration. Schedules can be delayed or disabled by
   GitHub inactivity rules; they are not a recovery SLA.

The schedule is 20:23 UTC daily (01:53 Asia/Kolkata). Standard public-repository
Ubuntu runners are free. Artifact storage shares the account's free allowance
with other repositories and Packages, so the workflow also requires the budget
confirmation, caps each encrypted export at 20 MiB, retains it seven days, and
refuses exports if repository artifacts plus 21 MiB would exceed 250 MiB.
No cache or paid service is configured. Quota exhaustion stops backups; it does
not justify enabling paid usage. The repository-level guard cannot inspect the
whole account's shared usage and does not replace GitHub's spending limit.

See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [budget setup](https://docs.github.com/en/billing/how-tos/set-up-budgets).

## Keys and privacy

Only the public age recipient is in the repository. The private recovery key is
stored on the operator's Mac at
`~/.config/veritas-backups/veritas-age-key.txt` with mode 0600, in a mode-0700
folder. Copy this key to a trusted password manager or offline location outside
this Mac. Losing it makes the encrypted exports unusable. Never upload it to
GitHub, put it in the database secret, or paste it into chat.

This is a public repository: assume readers can download the encrypted artifact.
The runner streams pg_dump into age; no plaintext database dump is written to its
disk or uploaded. Credentials and raw database diagnostics are omitted from logs.
Only encrypted output and its checksum are uploaded.

## Coverage and limits

The custom-format PostgreSQL 17 archive includes schema definitions, rows,
sequences, policies and grants for `public`, `auth` and `storage`. These include
learner records and authentication data. It does not include other schemas,
cluster-level roles/passwords, Supabase platform configuration, Edge Function
secrets, external providers, or the Vault decryption key. Keep application
migrations and custom-role definitions separately. Do not treat this as a full
Supabase project clone or a one-click restore.

**Uploaded Storage object bytes are not included.** Attachments and recordings
need separate object coverage before claiming full recovery. See
[Supabase backups](https://supabase.com/docs/guides/platform/backups).

## Isolated restore drill

Download the artifact before its seven-day expiration. Extract the two files,
verify `shasum -a 256 -c database.dump.age.sha256`, then inspect the archive using:

```sh
age --decrypt --identity "$HOME/.config/veritas-backups/veritas-age-key.txt" database.dump.age | pg_restore --list
```

Run decryption only on a trusted local machine. A controlled restore streams the
same decrypted archive to `pg_restore` against an isolated PostgreSQL/Supabase
target. Review the table of contents first: fresh Supabase targets already have
managed Auth/Storage schemas, so select compatible data, policies and application
objects rather than blindly recreating managed objects. Reapply standard and
custom roles/grants from reviewed migrations. A plain empty PostgreSQL test must
remove its default empty `public` schema before replaying this archive.

Disable cron jobs, outbound integrations, email and AI credentials before loading
real data. Check account/profile access, classroom permissions, row counts,
sequences, grading, RLS and file references. Test actual files against the separate
object backup. Record restore duration and missing coverage. Never restore over
production without a separate incident decision.

On 2026-11-25, an isolated PostgreSQL 17 synthetic export was encrypted, decrypted
in memory, and restored successfully with Auth rows, Storage metadata, application
rows and RLS intact. Connection/TLS rejection, size limits, failed-export cleanup
and existing-archive protection passed. This local test is not proof of a usable
production backup; the first hosted export and production restore drill remain
required.
