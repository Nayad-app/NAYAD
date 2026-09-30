# NAYAD production protection

## Main branch

After this change is published, configure the `main` branch rule in GitHub:

- Require a pull request before merging.
- Require one approval and dismiss stale approvals.
- Require the `node-tests` status check.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Include administrators in the rule.

The repository workflow runs the complete Node test suite on every pull request and every push to `main`. The GitHub setting itself must be enabled by a repository administrator; committing this file alone cannot enforce it.

## Supabase backup and recovery

Do not export or inspect production rows until the project owner has approved the full project-wide backup scope. A database backup cannot selectively omit an unknown store while still guaranteeing complete disaster recovery.

For project `kjgtmxcxchjevzoxwqzr`, an authorized administrator should:

1. Enable Supabase automated backups and Point-in-Time Recovery when the project plan supports it.
2. Keep an encrypted, access-controlled logical backup outside the production project.
3. Back up private Storage buckets separately; database backups do not contain Storage objects.
4. Record the backup timestamp, encryption owner, retention period and checksum without recording customer row content.
5. Quarterly, restore into an isolated non-production project and run schema plus application smoke tests.
6. Delete the isolated restore after the test according to the approved retention policy.

Never restore over production as a test. Never place database credentials or backup archives in this repository.
