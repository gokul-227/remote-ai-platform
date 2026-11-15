# Privacy and data handling

## Where data lives

| Data | Location |
| --- | --- |
| Application data | PostgreSQL on the production VM (private network, no host port) |
| Files, resumes, deliverables | Private Oracle Object Storage buckets; signed URLs with short expiry; no public objects |
| Identity | WorkOS (Supabase Auth during transition). No passwords stored by the platform |
| Backups | Encrypted archives in a private OCI bucket, 14 nightly copies |
| Errors | Self-hosted GlitchTip on the VM |
| Email | Sent through Brevo; content minimal |

## Member rights

- **Export:** Settings → Privacy → Download my data. The export is an explicit list (`auth/export.py`); a test
  fails when a user-linked table is not classified.
- **Deletion:** self-service deletes app data, writes provider-separated tombstones (`deleted_identities`)
  so the account is not silently re-created, and erases the identity-provider user; failed erasures are
  retried by a task. Deletion is refused while signed contracts or payment records exist
  (`auth/retention.py`); support then suspends and removes profile content by hand.
- **Correction:** members edit their own profile.

## Rules for staff and operators

- Least access; no impersonation; every staff action audited with a reason.
- Alerts never carry personal data beyond what is needed (sign-up alerts show only the email domain).
- Logs and docs never contain secrets, tokens or member data.
- Before restoring a backup into production, re-apply erasures newer than the backup.
- Production data is never copied to a laptop or a test stack.

## Product safeguards

- Public endpoints use public-only response schemas.
- User links must be http(s); demo URLs reject private/loopback addresses; demos render in a sandboxed frame.
- Blocks are private; reporters are never revealed.
- Contacts import sends invites only with signed, rate-limited tokens.
