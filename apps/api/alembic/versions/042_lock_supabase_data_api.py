"""Close the Supabase Data API to app tables (DATA-03).

Revision ID: 042_lock_supabase_data_api
Revises: 041_identity_erasure_state

The browser talks to Supabase only for Auth; every table is read and written
by the API, which connects as the role that ran these migrations and owns the
tables. Supabase also serves the public schema over its Data API (PostgREST)
to the `anon` and `authenticated` roles, whose key is public in the frontend
bundle. No migration ever enabled row level security or revoked those roles,
so whether the tables were reachable depended on project defaults.

- RLS is enabled, with no policies, on every public table owned by the
  migrating role: `anon`/`authenticated` see nothing. The owner (the API)
  bypasses RLS because it is not FORCEd, so the app is unaffected.
- Where the Supabase roles exist, their table/sequence privileges and the
  schema's default privileges for them are revoked.
Plain PostgreSQL (local, CI, E2E) has no such roles: only the RLS flag is set.
"""

from alembic import op


revision = "042_lock_supabase_data_api"
down_revision = "041_identity_erasure_state"
branch_labels = None
depends_on = None

_ROLES = ("anon", "authenticated")


def upgrade() -> None:
    op.execute(
        """
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN
            SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
              AND pg_get_userbyid(c.relowner) = current_user
          LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
          END LOOP;
        END $$;
        """
    )
    for role in _ROLES:
        op.execute(
            f"""
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
                REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role};
                REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {role};
                ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {role};
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    # Turns RLS off again. Privileges are deliberately not re-granted to the
    # public Data API roles: nothing in the app uses them.
    op.execute(
        """
        DO $$
        DECLARE t record;
        BEGIN
          FOR t IN
            SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
              AND pg_get_userbyid(c.relowner) = current_user
          LOOP
            EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.relname);
          END LOOP;
        END $$;
        """
    )
