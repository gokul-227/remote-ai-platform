"""
Application Configuration — Pydantic Settings
All configuration is loaded from environment variables or .env file.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ADMIN_CONSOLE_ORIGINS = {
    "production": ("https://admin.remoteaiplatform.com",),
    "development": (
        "https://dev.admin.remoteaiplatform.com",
        "https://admin-dev.remoteaiplatform.com",
    ),
    # The hosted dev API runs with APP_ENV=staging.
    "staging": ("https://dev.admin.remoteaiplatform.com", "https://admin-dev.remoteaiplatform.com"),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────────────────
    APP_ENV: str = "development"
    APP_NAME: str = "Remote AI Platform"
    APP_VERSION: str = "0.1.0"
    # Commit being run: Render sets RENDER_GIT_COMMIT on every deploy; other
    # environments may pass GIT_SHA. Never a hard-coded commit (it would tag
    # Sentry releases and /health/version with the wrong code).
    GIT_SHA: str = Field(
        default="unknown", validation_alias=AliasChoices("RENDER_GIT_COMMIT", "GIT_SHA")
    )
    APP_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:8000"
    DEBUG: bool = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Stored as a raw comma-separated string, not List[str]: pydantic-settings
    # (2.6.1, pinned) treats List-typed fields as "complex" and tries to
    # JSON-decode any env var value for them before any validator runs,
    # raising SettingsError on a plain string like "https://example.com".
    # A str field skips that entirely; CORS_ORIGINS below parses it on read.
    CORS_ORIGINS_RAW: str = Field(
        default="http://localhost:3000,http://localhost:8000,http://localhost:8080",
        validation_alias="CORS_ORIGINS",
    )

    # GitHub OAuth app (users connect their own account). Unset = feature off.
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_CALLBACK_URL: str = ""

    # Comma-separated emails that become ADMIN on their next sign-in (Supabase only
    # issues sessions for confirmed emails). Grants only; never demotes. Set in Infisical.
    ADMIN_EMAILS_RAW: str = Field(default="", validation_alias="ADMIN_EMAILS")

    @property
    def ADMIN_EMAILS(self) -> set[str]:  # noqa: N802
        return {e.strip().lower() for e in self.ADMIN_EMAILS_RAW.split(",") if e.strip()}

    @property
    def CORS_ORIGINS(self) -> list[str]:  # noqa: N802
        origins = [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]
        # The staff console (apps/admin) of the same environment only; a dev
        # console can never call the production API and vice versa.
        for admin in ADMIN_CONSOLE_ORIGINS.get(self.APP_ENV, ()):
            if admin not in origins:
                origins.append(admin)
        return origins

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost:5432/remote_ai_platform"
    # Keep connections open between requests (production uses Supabase's
    # session-mode pooler, where that is safe). False = a new connection per
    # request (the old behaviour): the rollback switch.
    DATABASE_POOL_ENABLED: bool = True
    # Per uvicorn worker. Supabase's free session pooler allows ~15 backend
    # connections in total: 2 workers x (3 + 2) = 10 leaves room for
    # migrations, job sync and admin tools. Beyond that, requests queue.
    DATABASE_POOL_SIZE: int = 8
    DATABASE_MAX_OVERFLOW: int = 4
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800
    # Longest a single SQL statement may run before the request fails.
    DATABASE_COMMAND_TIMEOUT_SECONDS: int = 30
    # None = automatic (see database._statement_cache_size); 0 disables.
    DATABASE_STATEMENT_CACHE_SIZE: int | None = None

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    # Legacy name for the Redis URL, from when Celery used Redis as a broker.
    # Only read as a fallback when REDIS_URL is not configured (see redis_url).
    CELERY_BROKER_URL: str | None = None

    # ── MinIO ─────────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin_dev_password"
    MINIO_BUCKET_RESUMES: str = "remote-ai-platform-resumes"
    MINIO_BUCKET_ASSETS: str = "remote-ai-platform-assets"
    MINIO_BUCKET_DELIVERABLES: str = "remote-ai-platform-deliverables"
    MINIO_SECURE: bool = False
    # Object storage provider: "s3" uses MINIO_* (MinIO / Supabase Storage); "r2" uses R2_*.
    STORAGE_PROVIDER: str = "s3"
    R2_ENDPOINT: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    # "auto" for Cloudflare R2; the region name (e.g. eu-frankfurt-1) for any other
    # S3-compatible store such as Oracle Object Storage, which signs per region.
    R2_REGION: str = "auto"
    # Migration window: keep the MINIO_* provider reachable for reads, links and deletes.
    STORAGE_LEGACY_FALLBACK: bool = False
    # JSON map new bucket -> old bucket name when the names differ between providers.
    STORAGE_LEGACY_BUCKETS: str = ""
    # R2 bucket names per purpose; empty means "same name as the MINIO_BUCKET_* / FILES_BUCKET value".
    R2_BUCKET_RESUMES: str = ""
    R2_BUCKET_ASSETS: str = ""
    R2_BUCKET_DELIVERABLES: str = ""
    R2_BUCKET_FILES: str = ""
    # Files application (private bucket; signed URLs only). R2/S3/Supabase Storage/MinIO all work.
    FILES_BUCKET: str = "remote-ai-platform-files"
    FILES_MAX_UPLOAD_MB: int = 25
    FILES_USER_QUOTA_MB: int = 2048
    FILES_TRASH_RETENTION_DAYS: int = 30
    # Browser push via the standard Web Push protocol (RFC 8030/8291/8292, VAPID).
    # Disabled while either key is empty. Public key: base64url uncompressed P-256
    # point (given to browsers); private key: base64url raw 32-byte scalar or PEM.
    WEB_PUSH_VAPID_PUBLIC_KEY: str = ""
    WEB_PUSH_VAPID_PRIVATE_KEY: str = ""
    WEB_PUSH_SUBJECT: str = "mailto:contact@remoteaiplatform.com"
    # Shared with ops/backup scripts so they can report run evidence (never a user credential).
    BACKUP_REPORT_TOKEN: str = ""
    PUSH_MAX_PER_USER_PER_HOUR: int = 20

    # ── Supabase Auth (the only identity provider) ──────────────────────────────
    # Sign-in happens entirely against Supabase from the frontend; this API
    # verifies Supabase's asymmetrically signed access tokens via JWKS and
    # never issues tokens itself.
    SUPABASE_URL: str | None = None
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    # JWKS responses are cached in-process for this long (Supabase's own edge
    # cache is ~10 minutes; matching that avoids re-fetching more often than
    # the keys could plausibly rotate).
    SUPABASE_JWKS_CACHE_SECONDS: int = 600
    # Additional token issuers accepted next to Supabase (Phase 7 dual validation),
    # as a JSON list: [{"provider":"workos","issuer":"https://api.workos.com/user_management/client_xxx",
    # "jwks_url":"https://api.workos.com/sso/jwks/client_xxx","audience":"client_xxx"}].
    # Empty (the default) means Supabase is the only identity provider.
    AUTH_EXTRA_ISSUERS: str = ""
    # Optional. When set, deleting an account also deletes the Supabase Auth
    # user (email, OAuth links, sessions) through the Admin API. Server-side
    # secret: never exposed to the browser.
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # ── WorkOS AuthKit (migration target for sign-in) ───────────────────────────
    # Set WORKOS_CLIENT_ID to accept WorkOS access tokens next to Supabase's.
    # AUTH_PRIMARY_PROVIDER decides which provider the web/admin apps sign in
    # with ("supabase" until cut-over, then "workos"); AUTH_ACCEPT_SUPABASE=false
    # turns Supabase tokens off once every active user has moved.
    WORKOS_CLIENT_ID: str = ""
    # Server-side secret (sk_...): magic-auth codes, OAuth code exchange,
    # refresh, sign-out and user erasure. Never exposed to the browser.
    WORKOS_API_KEY: str = ""
    # Google OAuth client used only for the opt-in contacts read (People API).
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    # Signs OAuth state, contact tokens and stop-invites links. Empty = derived
    # from GOOGLE_OAUTH_CLIENT_SECRET.
    INVITE_SIGNING_KEY: str = ""
    # Contact invitations a member may send per rolling 24 hours.
    CONTACT_INVITES_PER_DAY: int = 25
    WORKOS_API_URL: str = "https://api.workos.com"
    # Social sign-in providers configured in the WorkOS dashboard (comma list, "*" = all).
    WORKOS_OAUTH_PROVIDERS: str = "*"
    # Where browsers are sent to start an OAuth sign-in. Empty = WORKOS_API_URL;
    # set it to a WorkOS custom auth domain (or the E2E mock's host address).
    WORKOS_AUTHORIZE_URL: str = ""
    # Comma-separated accepted `iss` values; empty means WorkOS's defaults for
    # this client (the per-client issuer and the generic one). Add a custom
    # auth domain here when one is configured.
    WORKOS_ISSUERS_RAW: str = Field(default="", validation_alias="WORKOS_ISSUERS")
    AUTH_PRIMARY_PROVIDER: str = "supabase"
    AUTH_ACCEPT_SUPABASE: bool = True

    @property
    def workos_enabled(self) -> bool:
        return bool(self.WORKOS_CLIENT_ID)

    @property
    def WORKOS_JWKS_URL(self) -> str:  # noqa: N802
        return f"{self.WORKOS_API_URL.rstrip('/')}/sso/jwks/{self.WORKOS_CLIENT_ID}"

    @property
    def workos_issuers(self) -> set[str]:
        raw = {i.strip().rstrip("/") for i in self.WORKOS_ISSUERS_RAW.split(",") if i.strip()}
        if raw:
            return raw
        base = self.WORKOS_API_URL.rstrip("/")
        return {f"{base}/user_management/{self.WORKOS_CLIENT_ID}", base}

    @property
    def auth_primary_provider(self) -> str:
        primary = self.AUTH_PRIMARY_PROVIDER.strip().lower()
        if primary == "workos" and self.workos_enabled:
            return "workos"
        return "supabase"

    @property
    def SUPABASE_JWKS_URL(self) -> str | None:  # noqa: N802
        if not self.SUPABASE_URL:
            return None
        return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def extra_issuers(self) -> list[dict[str, str]]:
        """Parsed AUTH_EXTRA_ISSUERS; malformed entries are dropped, never accepted."""
        import json

        if not self.AUTH_EXTRA_ISSUERS.strip():
            return []
        try:
            raw = json.loads(self.AUTH_EXTRA_ISSUERS)
        except ValueError:
            return []
        out: list[dict[str, str]] = []
        for item in raw if isinstance(raw, list) else []:
            if not isinstance(item, dict):
                continue
            if all(
                isinstance(item.get(k), str) and item[k]
                for k in ("provider", "issuer", "jwks_url", "audience")
            ):
                out.append({k: item[k] for k in ("provider", "issuer", "jwks_url", "audience")})
        return out

    # ── AI / LiteLLM ─────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL_DEFAULT: str = "qwen2.5"
    OLLAMA_MODEL_CODER: str = "qwen2.5-coder"
    OLLAMA_MODEL_REASONING: str = "deepseek-coder"

    AI_PROVIDER: str = "auto"
    AI_MODEL: str = "qwen2.5"
    AI_API_KEY: str | None = None
    LITELLM_BASE_URL: str | None = None
    AI_FALLBACK_PROVIDERS: str = "ollama/qwen2.5"
    AI_MAX_RETRIES: int = 3
    AI_TIMEOUT_SECONDS: int = 60
    # Total time allowed for resume parsing across all models tried; the
    # web client waits longer than this for the upload request.
    RESUME_PARSE_BUDGET_SECONDS: int = 45

    # ── Security ─────────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_REQUESTS: int = 60
    MAX_RESUME_SIZE_BYTES: int = 5 * 1024 * 1024

    # Optional: production AI providers via LiteLLM
    GROQ_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    GEMINI_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    CEREBRAS_API_KEY: str | None = None
    MISTRAL_API_KEY: str | None = None

    # AI_PROVIDER="auto": try these free-tier models in order, skipping any
    # provider whose API key is not set. Override the list via env to follow
    # the providers' current free model names.
    AI_FREE_TIER_CHAIN: str = (
        "groq/openai/gpt-oss-120b,"
        "groq/openai/gpt-oss-20b,"
        "gemini/gemini-2.0-flash,"
        "cerebras/llama-3.3-70b,"
        "openrouter/meta-llama/llama-3.3-70b-instruct:free,"
        "mistral/mistral-small-latest"
    )
    # Upper bound for one completion across every model tried.
    AI_TOTAL_BUDGET_SECONDS: int = 45

    # Token allowances (prompt + completion). Checked before each call, so a
    # user can overshoot by at most one request.
    AI_FREE_MONTHLY_TOKENS: int = 20_000
    AI_PRO_MONTHLY_TOKENS: int = 50_000
    # Platform-wide cap per UTC day, protecting the providers' free quotas.
    AI_GLOBAL_DAILY_TOKENS: int = 300_000
    # Held against allowances while a call is in flight (replaced by the real
    # count when it settles), so concurrent calls can't all slip under a limit.
    AI_RESERVATION_TOKENS: int = 2000

    # ── Job Aggregator ────────────────────────────────────────────────────────
    REMOTEOK_API_URL: str = "https://remoteok.com/api"
    ARBEITNOW_API_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_API_URL: str = "https://remotive.com/api/remote-jobs"
    USAJOBS_API_URL: str = "https://data.usajobs.gov/api/search"
    USAJOBS_USER_AGENT: str = "RemoteAIPlatform/0.1 (contact@remoteaiplatform.com)"
    USAJOBS_AUTH_KEY: str | None = None
    THEMUSE_API_URL: str = "https://www.themuse.com/api/public/jobs"
    THEMUSE_API_KEY: str | None = None
    # Public endpoints do not establish redistribution rights. Enable only
    # after the operator has the applicable written permission/licence.
    ADZUNA_LICENSE_CONFIRMED: bool = False
    WORKINGNOMADS_PERMISSION_CONFIRMED: bool = False
    # Arbeitnow serves 100 jobs per page; read this many pages per sync.
    ARBEITNOW_MAX_PAGES: int = 200
    # Public company career boards (comma-separated board names). The original lists
    # were verified live; later additions are best-effort (a missing board is skipped).
    GREENHOUSE_BOARDS: str = (
        "stripe,gitlab,cloudflare,datadog,figma,discord,duolingo,reddit,coinbase,robinhood,elastic,"
        "mongodb,twilio,dropbox,asana,instacart,gusto,vercel,anthropic,databricks,samsara,okta,brex,"
        "hellofresh,braze,toast,canonical,adyen,affirm,celonis,airbnb,lyft,fivetran,scaleai,pinterest,"
        "klaviyo,doctolib,grafanalabs,mozilla,intercom,zoominfo,smartsheet,carta,getyourguide,chime,"
        "monzo,faire,wrike,peloton,tailscale,sofi,newrelic,workato,fastly,pagerduty,mixpanel,n26,"
        "salesloft,cultureamp,bitwarden,coursera,attentive,squarespace,algolia,gocardless,betterment,"
        "honeycomb,contentful,bandwidth,vonage,wise,dialpad,cockroachlabs,trivago,wikimedia,yugabyte,"
        "planetscale,typeform,calendly,lattice,abnormalsecurity,applovin,axios,axon,billcom,bitpanda,"
        "blend,blockchain,carvana,catawiki,checkr,circleci,classpass,clear,cleo,cognite,collibra,"
        "consensys,coreweave,cresta,dataiku,deliveroo,descript,dremio,earnin,epicgames,everlaw,fetch,"
        "flexport,formlabs,forter,gemini,gofundme,gostudent,greenhouse,hudl,jumio,justworks,launchdarkly,"
        "lithic,masterclass,mercury,mirakl,modernhealth,motive,nuro,onetrust,oscar,pendo,raisin,"
        "relativity,ripple,roblox,rubrik,salsify,seatgeek,splice,stackadapt,stitchfix,sweetgreen,tanium,"
        "tide,tripactions,twitch,upgrade,upstart,veriff,verkada,wolt,yext,zocdoc,zuora,"
        "hubspot,nextdoor,niantic,opendoor,quizlet,remitly,riotgames,scopely,thoughtworks,"
        "unity3d,whoop,zillow,airtable,hashicorp,netlify,postman,sourcegraph,gitguardian,"
        "segment,webflow,benchling,chainalysis,kraken,plaid,niche,sezzle,remote,doordash"
    )
    # Company boards are split into this many groups; each import handles one group in
    # full (rotating every run), so every company refreshes twice a day on the
    # 3-hourly schedule without one run overloading the small API instance.
    ATS_BOARD_SHARDS: int = 4
    # Long descriptions are cut here (every source, at import): the detail page links
    # to the original posting for the rest. The main lever on per-row size.
    JOB_DESCRIPTION_MAX_CHARS: int = 5000
    # Boards fetched at once per source, and a polite pause before each request.
    ATS_BOARD_CONCURRENCY: int = 4
    JOB_SOURCE_REQUEST_DELAY_SECONDS: float = 0.25
    # Workable public job-board accounts (apply.workable.com/<account>).
    WORKABLE_ACCOUNTS: str = (
        "workable,hotjar,taxfix,personio,blueground,omnipresent,remote,deel,papaya-global,"
        "toggl,doist,automattic,buffer,zapier,hubstaff,teamviewer,skroutz,efood,beat,pollfish,"
        "viva-wallet,epignosis,orfium,hackthebox,instashop,plum,huspy,yassir,kaizen-gaming"
    )
    # We Work Remotely publishes public RSS feeds per category (attribution kept).
    WEWORKREMOTELY_FEEDS: str = (
        "remote-programming-jobs,remote-full-stack-programming-jobs,remote-back-end-programming-jobs,"
        "remote-front-end-programming-jobs,remote-devops-sysadmin-jobs,remote-design-jobs,"
        "remote-product-jobs,remote-customer-support-jobs,remote-sales-and-marketing-jobs,"
        "remote-management-and-finance-jobs,all-other-remote-jobs"
    )
    # Cross-source dedup: skip a posting another source already lists (same
    # normalized title + company + location, or same canonical apply URL).
    JOB_DEDUP_ACROSS_SOURCES: bool = True
    # Re-listing an unchanged job rewrites its row at most this often.
    JOB_LAST_SEEN_REFRESH_HOURS: int = 20
    # Retention works in batches of this many rows (each its own transaction).
    JOB_RETENTION_BATCH_SIZE: int = 5000
    # Scale (docs/operations/capacity.md). Shared Redis tier for public job lists
    # and facets (off in tests/dev without Redis; on in docker-compose.prod.yml).
    JOB_CACHE_REDIS_ENABLED: bool = False
    JOB_CACHE_REDIS_URL: str = ""
    JOB_LIST_CACHE_SECONDS: int = Field(default=120, ge=1)
    JOB_FACETS_CACHE_SECONDS: int = Field(default=600, ge=1)
    # Celery precomputes facets for common searches and the employer read model.
    JOB_STATS_REFRESH_MINUTES: int = Field(default=60, ge=1)
    JOB_STATS_TOP_VALUES: int = Field(default=5, ge=0, le=50)
    JOB_EMPLOYER_STATS_MAX: int = Field(default=100000, ge=1)
    # Deepest OFFSET the public list accepts; deeper pages use the `after` cursor.
    JOB_LIST_MAX_SKIP: int = Field(default=10000, ge=0)
    # Keyword-search totals stop counting here (X-Total-Count-Capped: true).
    JOB_KEYWORD_COUNT_CAP: int = Field(default=1000, ge=1)
    JOB_RETENTION_MAX_BATCHES: int = 2000
    LEVER_BOARDS: str = (
        "spotify,outreach,gopuff,aircall,wealthfront,contentsquare,neon,arcadia,blablacar,houzz,metabase,"
        "olo,palantir,pipedrive,swile,tala,netflix,shopify,kraken,lucidmotors,"
        "matchgroup,coupa,eventbrite,mistral,whoop,zoox,veeva"
    )
    ASHBY_BOARDS: str = (
        "openai,ramp,notion,linear,vanta,supabase,posthog,zapier,cursor,snowflake,clickhouse,doctolib,"
        "plaid,perplexity,alan,cohere,1password,docker,mollie,clickup,writer,sentry,modal,qonto,"
        "amplitude,n8n,render,snyk,backmarket,redis,strava,nerdwallet,oyster,miro,anyscale,gorgias,"
        "astronomer,paddle,airbyte,iterable,deepl,prefect,helpscout,railway,airwallex,alchemy,appfolio,"
        "atlan,benchling,betterup,circle,close,consensys,crusoe,deliveroo,forto,fullstory,handshake,"
        "headway,hopper,kayak,ledger,lemonade,mural,outschool,patreon,persona,poshmark,quora,replit,"
        "skydio,thumbtack,wealthsimple,webflow"
    )
    SMARTRECRUITERS_COMPANIES: str = (
        "ServiceNow,Canva,justworks,palantir,splice,together,wise,workato"
    )
    # ── Global sources (docs/product/job-sources.md) ─────────────────────────
    # Bundled company board lists (app/domains/jobs/aggregators/boards/*.txt).
    ATS_BUNDLED_LISTS: bool = True
    # Long board lists are walked this many boards per run (checkpointed offset);
    # a run also stops starting boards when JOB_IMPORT_FETCH_BUDGET_SECONDS is spent
    # and the checkpoint moves only past the boards it actually fetched.
    ATS_BOARDS_PER_RUN: int = 6000
    JOB_SOURCE_USER_AGENT: str = "RemoteAIPlatformBot/1.0 (+https://remoteaiplatform.com/bot)"
    # Check robots.txt (cached per host for 24 h) before every board/feed fetch.
    JOB_SOURCE_RESPECT_ROBOTS: bool = True
    # Extra boards on top of the bundled lists (comma-separated tokens).
    RECRUITEE_COMPANIES: str = ""
    PERSONIO_COMPANIES: str = ""
    TEAMTAILOR_COMPANIES: str = ""
    BAMBOOHR_COMPANIES: str = ""
    BREEZY_COMPANIES: str = ""
    RIPPLING_BOARDS: str = ""
    # Workday career sites as "tenant/wdN/site" (e.g. "nvidia/wd5/NVIDIAExternalCareerSite").
    WORKDAY_SITES: str = ""
    # Bundesagentur für Arbeit Jobsuche: the public client id documented for the
    # open Jobsuche API (not a secret). Pages of 100; a query reaches at most 10,000
    # results, so the full catalogue is swept in partitions across runs (government.py).
    BUNDESAGENTUR_API_KEY: str = "jobboerse-jobsuche"
    BUNDESAGENTUR_MAX_PAGES: int = 3000
    # JobTech (Arbetsförmedlingen open data, CC0): pages of 100, offset <= 2000 per
    # query, so every run sweeps publication-date windows over the retention period.
    JOBTECH_MAX_PAGES: int = 1500
    # NAV stillingsfeed: optional token; without it the public token endpoint is used.
    NAV_FEED_TOKEN: str | None = None
    # Feed pages of 1,000 entries read per run (the run's time budget also bounds it).
    NAV_MAX_PAGES: int = 3000
    # Re-read the whole NAV feed from its first page this often, so unchanged open
    # ads are seen again before JOB_UNSEEN_EXPIRY_DAYS.
    NAV_REWALK_DAYS: int = 7
    # France Travail Offres d'emploi v2 (free partner account, OAuth client credentials).
    FRANCE_TRAVAIL_CLIENT_ID: str | None = None
    FRANCE_TRAVAIL_CLIENT_SECRET: str | None = None
    # Requests per run (a query reaches 3,150 results; busy windows go per département).
    FRANCE_TRAVAIL_MAX_PAGES: int = 2500
    # Careerjet partner API v4 (affiliate API key via HTTP basic auth).
    CAREERJET_API_KEY: str | None = None
    CAREERJET_LOCALES: str = "en_GB,en_US,de_DE,fr_FR,en_IN,en_CA,en_AU,es_ES,it_IT,nl_NL"
    CAREERJET_MAX_PAGES: int = 20
    ADZUNA_MAX_PAGES: int = 20
    USAJOBS_MAX_PAGES: int = 100
    # Remote boards' public RSS feeds (terms reviewed per feed; source starts paused).
    REMOTE_RSS_FEEDS: str = (
        "https://nodesk.co/remote-jobs/index.xml,"
        "https://www.realworkfromanywhere.com/rss.xml,"
        "https://remotefirstjobs.com/rss/jobs.rss"
    )
    GETONBOARD_MAX_PAGES: int = 50
    # Optional aggregators with free developer keys (Infisical); skipped when unset.
    ADZUNA_APP_ID: str | None = None
    ADZUNA_APP_KEY: str | None = None
    ADZUNA_COUNTRIES: str = "gb,us,de,in,ca,au,nl,fr,at,be,br,ch,es,it,mx,nz,pl,sg,za"
    JOOBLE_API_KEY: str | None = None
    JOOBLE_KEYWORDS: str = "remote"
    # Search-engine notifications for new job pages (production only).
    # Base64 of a Google service-account JSON that owns the Search Console property.
    GOOGLE_INDEXING_CREDENTIALS_B64: str | None = None
    GOOGLE_INDEXING_PER_RUN: int = 24  # 8 runs a day stays under Google's free 200/day
    # Shared per-UTC-day budget across all runs (Redis); headroom under the 200/day quota.
    GOOGLE_INDEXING_DAILY_QUOTA: int = 180
    # Sitemaps list only jobs posted within this many days (stale listings aren't promoted).
    SITEMAP_JOB_MAX_AGE_DAYS: int = 90
    # A job expired longer ago than this (or removed) answers 410 Gone on its public page.
    JOB_GONE_AFTER_DAYS: int = 30
    # Weekly Search Console summary to Slack (#seo, else #signups), Mondays 07:30 UTC.
    # Uses the Indexing API service account, which needs read access to the property.
    SEO_WEEKLY_REPORT_ENABLED: bool = False
    # Catch-up sweep every 4 h: announce indexable jobs from the last 2 days that no
    # import run has announced yet (per-run caps and quota misses), within the budget.
    SEO_INDEXING_SWEEP_ENABLED: bool = True
    # IndexNow key: public by design, served by the web app at /indexnow.txt.
    INDEXNOW_KEY: str = "bd088b5c4cf346dbf16c906aff9aeb97"
    # Keep as many imported jobs as the free database allows: above this size the oldest
    # imported jobs nobody applied to are removed after each import (Supabase Free = 500 MB).
    # 0 disables the budget (self-hosted PostgreSQL holding millions of jobs).
    DATABASE_SIZE_BUDGET_MB: int = 420
    # Imported jobs posted longer ago than this are removed (or, if someone applied, hidden).
    JOB_RETENTION_DAYS: int = 180

    JOB_SYNC_SCHEDULE: str = (
        "17 */3 * * *"  # Every 3 hours (default cron for job_sources rows)
    )
    # Per-run ceiling for one source (job_sources.max_per_run defaults to it). Runs
    # are really bounded by JOB_IMPORT_FETCH_BUDGET_SECONDS and checkpoints.
    JOB_SYNC_MAX_PER_SOURCE: int = 250000
    # Time one import run may spend fetching before it stops and checkpoints; the
    # rest of the slot is for saving (bulk upserts). Import tasks have a 55-minute
    # soft limit (app/worker/tasks.py).
    JOB_IMPORT_FETCH_BUDGET_SECONDS: int = Field(default=1500, ge=10)
    # ATS board discovery (app/domains/jobs/board_discovery.py, every 6 hours).
    JOB_BOARD_DISCOVERY_ENABLED: bool = True
    # Candidate boards validated per discovery run (one request each).
    JOB_BOARD_VALIDATE_PER_RUN: int = 3000
    JOB_BOARD_DISCOVERY_BUDGET_SECONDS: int = Field(default=1500, ge=10)
    # Minimum gap between two requests to one ATS (robots.txt Crawl-delay wins if larger).
    JOB_BOARD_HOST_INTERVAL_SECONDS: float = 1.0
    # A board (candidate or live) is dropped after this many 404/410 answers in a row.
    JOB_BOARD_DEAD_AFTER_404S: int = 3
    # Stored jobs scanned for outbound ATS links per discovery run.
    JOB_BOARD_SCAN_ROWS_PER_RUN: int = 200000
    # Optional public lists of career-site URLs (comma-separated http(s) URLs; plain
    # text, HTML or XML). Only lists whose terms allow reuse; robots.txt is checked.
    JOB_BOARD_SEED_URLS: str = ""
    # Freshness policy: imported jobs that no sync has seen among their
    # source's recent listings (each sync reads each source's newest ~30) for
    # this long are taken off the public list; they may still be open.
    JOB_UNSEEN_EXPIRY_DAYS: int = 30

    # Background processing (Celery + PostgreSQL task history, app/domains/tasks)
    TASKS_ALWAYS_EAGER: bool = False  # run tasks inline (tests/local without a worker)
    TASKS_DISPATCH_DISABLED: bool = False  # record runs but never contact the broker
    WORKER_HEARTBEAT_STALE_SECONDS: int = 180
    TASK_RUN_RETENTION_DAYS: int = 30

    # ── Payments ──────────────────────────────────────────────────────────────
    # "sandbox" (default, no real payment network contact) or "stripe". Never
    # flips to real money processing just because STRIPE_SECRET_KEY is set --
    # that also requires explicitly setting PAYMENT_PROVIDER=stripe, and
    # whether STRIPE_SECRET_KEY itself is a test (sk_test_...) or live
    # (sk_live_...) key is a separate, deliberate choice made in the Stripe
    # dashboard, not by this app.
    PAYMENT_PROVIDER: str = "sandbox"
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    # Master switch for funding and releasing money through the platform.
    # Off by default: the marketplace lifecycle (recipient onboarding,
    # transfers to engineers, payouts, disputes, reconciliation) is not
    # complete, so neither provider may move or pretend to move money until
    # the product owner deliberately enables it. Refunds of existing holds
    # stay available regardless so no funds are ever stranded.
    MARKETPLACE_PAYMENTS_ENABLED: bool = False

    # ── Billing (paid features, Stripe Checkout) ──────────────────────────────
    # Separate from marketplace money movement. Off: pricing shows "coming
    # soon", checkout answers 404 and nothing is chargeable. A live Stripe key
    # is refused unless APP_ENV=production AND BILLING_ENABLED
    # (app/services/billing/stripe_gateway.py). See docs/operations/billing.md.
    BILLING_ENABLED: bool = False
    BILLING_FREE_PROPOSALS_MONTHLY: int = 20
    BILLING_SPONSORED_DEFAULT_CPC_CENTS: int = 50
    BILLING_REFERRAL_CREDIT_CENTS: int = 1000
    BILLING_MESSAGE_REFUND_DAYS: int = 14

    # ── Email ─────────────────────────────────────────────────────────────────
    # "none" (default, honest no-op -- matches the behavior this app has always
    # had; no email was ever actually sent before this) or "resend".
    EMAIL_PROVIDER: str = "none"
    RESEND_API_KEY: str | None = None
    BREVO_API_KEY: str | None = None  # EMAIL_PROVIDER=brevo
    # Resend's own sandbox sender -- works with zero domain setup, but can only
    # deliver to the account owner's verified email until a real sending
    # domain is added.
    EMAIL_FROM_ADDRESS: str = "onboarding@resend.dev"
    EMAIL_FROM_NAME: str = "Remote AI Platform"
    # Public web address for links in emails (e.g. https://remoteaiplatform.com).
    FRONTEND_URL: str = ""
    # Where people write for support, privacy requests and moderation appeals.
    SUPPORT_EMAIL: str = "contact@remoteaiplatform.com"

    # ── Feature Flags ─────────────────────────────────────────────────────────
    FEATURE_AI_RESUME_PARSING: bool = True
    FEATURE_AI_MATCHING: bool = True
    FEATURE_JOB_AGGREGATOR: bool = True
    # The web app polls for messages and notifications; the WebSocket
    # endpoints stay closed until the UI uses them. Their access token rides
    # in the URL, so enabling this needs short-lived connection tickets.
    FEATURE_REALTIME_WEBSOCKETS: bool = False
    # "Find people you know from Google": off until Google has verified the
    # OAuth app for the contacts scopes (see the internal runbook).
    FEATURE_CONTACTS_IMPORT: bool = False

    # ── Error monitoring (Sentry) ────────────────────────────────────────────
    # Empty string (default) means Sentry is never initialized -- a complete
    # no-op with no network calls, warnings, or overhead. Only set SENTRY_DSN
    # (Render env var / secret) once a real Sentry project exists.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # ── Slack (owner notifications; app/services/slack.py) ───────────────────
    # Disabled while SLACK_BOT_TOKEN is empty; a channel with an empty id is skipped.
    SLACK_BOT_TOKEN: str = ""
    SLACK_CHANNEL_ALERTS_CRITICAL: str = ""
    SLACK_CHANNEL_ALERTS_ERRORS: str = ""
    SLACK_CHANNEL_DEPLOYS: str = ""
    SLACK_CHANNEL_BACKUPS: str = ""
    SLACK_CHANNEL_JOB_IMPORTS: str = ""
    SLACK_CHANNEL_SIGNUPS: str = ""
    SLACK_CHANNEL_SECURITY: str = ""
    SLACK_CHANNEL_COSTS: str = ""
    SLACK_CHANNEL_SEO: str = ""  # weekly Search Console summary; empty -> #signups
    ADMIN_URL: str = ""  # staff console base URL, linked from Slack messages
    SLACK_DEDUP_SECONDS: int = 900  # identical dedup keys are dropped inside this window
    SLACK_MAX_PER_MINUTE: int = 20  # per channel, per process
    SLACK_TIMEOUT_SECONDS: float = 5.0
    # Sign-ups in one hour above this post a spike alert.
    SLACK_SIGNUP_SPIKE_PER_HOUR: int = 25
    # Failed bearer authentications from one client IP inside 10 minutes.
    SLACK_AUTH_FAILURE_BURST: int = 30
    # UptimeRobot (and any monitor) webhook relay: POST /ops/uptime-hook?token=...
    UPTIME_HOOK_TOKEN: str = ""

    # ── Free-tier guard (worker task ops.cost_guard) ─────────────────────────
    COST_WARN_PERCENT: int = 70
    COST_CRITICAL_PERCENT: int = 90
    COST_DB_LIMIT_MB: int = (
        20_480  # VM PostgreSQL budget (Always Free block volume is 200 GB in all)
    )
    COST_STORAGE_LIMIT_GB: float = 20.0  # OCI Always Free object storage
    COST_DISK_PATH: str = "/"
    COST_EMAIL_DAILY_LIMIT: int = 100  # Resend free: 100/day, 3000/month
    COST_EMAIL_MONTHLY_LIMIT: int = 3000
    OCI_S3_ENDPOINT: str = ""  # set in Infisical prod /vm
    OCI_S3_REGION: str = "eu-frankfurt-1"
    OCI_S3_ACCESS_KEY_ID: str = ""
    OCI_S3_SECRET_ACCESS_KEY: str = ""
    # Comma-separated buckets to measure; empty = every bucket the key can list.
    COST_BUCKETS: str = ""

    # ── Pagination ────────────────────────────────────────────────────────────
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @property
    def redis_url(self) -> str:
        """REDIS_URL, or the legacy CELERY_BROKER_URL when only that is set."""
        if self.REDIS_URL.startswith("redis://localhost") and self.CELERY_BROKER_URL:
            return self.CELERY_BROKER_URL
        return self.REDIS_URL

    def redis_key(self, key: str) -> str:
        """Prefix every Redis key/channel with the environment, so dev and prod
        never collide even when they share one Redis instance."""
        return f"{self.APP_ENV}:{key}"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"

    @property
    def is_production(self) -> bool:
        # Render sets RENDER=true on every service it runs, regardless of
        # whether APP_ENV was also configured. Treating a Render deployment
        # as production even if APP_ENV is missing closes a real incident:
        # an env-var wipe that dropped APP_ENV silently disarmed every check
        # below (dev JWT secret, dev MinIO creds, etc.) because is_production
        # depended on APP_ENV alone.
        import os

        return self.APP_ENV == "production" or os.environ.get("RENDER") == "true"

    def validate_production_settings(self) -> None:
        """Fail fast instead of booting with known development credentials."""
        if not self.is_production:
            return
        errors = []
        if self.DATABASE_URL.startswith(
            "postgresql+asyncpg://remote_ai_platform:remote_ai_platform_dev_password@localhost"
        ):
            errors.append("DATABASE_URL is still the local development default")
        elif "localhost" in self.DATABASE_URL or "127.0.0.1" in self.DATABASE_URL:
            # Broader than the exact-default check above: catches any
            # locally-pointed DATABASE_URL, even one with different
            # credentials, which can never be reachable from production.
            errors.append("DATABASE_URL must not point at localhost/127.0.0.1 in production")
        if self.DEBUG:
            errors.append(
                "DEBUG must not be enabled in production (it exposes verbose tracebacks/internals to clients)"
            )
        if not self.SUPABASE_URL and self.AUTH_ACCEPT_SUPABASE:
            errors.append("SUPABASE_URL must be configured while Supabase sign-in is accepted")
        if not self.AUTH_ACCEPT_SUPABASE and not self.workos_enabled:
            errors.append(
                "AUTH_ACCEPT_SUPABASE=false needs WORKOS_CLIENT_ID (no sign-in path left)"
            )
        if self.AUTH_PRIMARY_PROVIDER.strip().lower() == "workos" and not (
            self.workos_enabled and self.WORKOS_API_KEY
        ):
            errors.append("AUTH_PRIMARY_PROVIDER=workos needs WORKOS_CLIENT_ID and WORKOS_API_KEY")
        uses_minio = self.STORAGE_PROVIDER != "r2" or self.STORAGE_LEGACY_FALLBACK
        if self.STORAGE_PROVIDER not in {"s3", "r2"}:
            errors.append("STORAGE_PROVIDER must be 's3' or 'r2'")
        if self.STORAGE_PROVIDER == "r2":
            for name in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
                if not getattr(self, name):
                    errors.append(f"{name} must be configured when STORAGE_PROVIDER=r2")
            if self.R2_ENDPOINT and not self.R2_ENDPOINT.startswith("https://"):
                errors.append("R2_ENDPOINT must be an https:// URL")
        if uses_minio and self.MINIO_SECRET_KEY in {"minioadmin", "minioadmin_dev_password", ""}:
            errors.append("MINIO_SECRET_KEY must be configured")
        # MINIO_ENDPOINT/MINIO_PUBLIC_ENDPOINT double as the real object-storage
        # endpoint in production (Supabase Storage's S3-compatible endpoint --
        # see storage.py), so a localhost value here is never correct in prod,
        # not just a "still using MinIO" smell.
        if uses_minio and (
            "localhost" in self.MINIO_ENDPOINT or "127.0.0.1" in self.MINIO_ENDPOINT
        ):
            errors.append("MINIO_ENDPOINT must not point at localhost/127.0.0.1 in production")
        if uses_minio and (
            "localhost" in self.MINIO_PUBLIC_ENDPOINT or "127.0.0.1" in self.MINIO_PUBLIC_ENDPOINT
        ):
            errors.append(
                "MINIO_PUBLIC_ENDPOINT must not point at localhost/127.0.0.1 in production"
            )
        if "*" in self.CORS_ORIGINS:
            errors.append(
                "CORS_ORIGINS must not contain a wildcard in production (combined with allow_credentials=True, this permits credentialed cross-origin requests from any site)"
            )
        # Warn (non-fatal) if Redis is pointing at localhost — the app will boot but
        # rate limiting, caching and the job queue will silently degrade to in-memory
        # fallbacks.  Operators should set REDIS_URL to a real
        # Redis instance (e.g. Upstash free tier) or accept the degraded behaviour.
        if self.workos_enabled and not self.WORKOS_API_KEY:
            errors.append(
                "WORKOS_CLIENT_ID is set without WORKOS_API_KEY (sign-in and deletion need it)"
            )
        if self.AUTH_ACCEPT_SUPABASE and not self.SUPABASE_SERVICE_ROLE_KEY:
            import warnings

            # The privacy notice says deletion removes the sign-in account too.
            warnings.warn(
                "SUPABASE_SERVICE_ROLE_KEY is not set: deleting an account will not remove "
                "the user from Supabase Auth, which the privacy notice promises.",
                stacklevel=2,
            )
        _redis_localhost_warning: list[str] = []
        if self.redis_url.startswith("redis://localhost"):
            _redis_localhost_warning.append("REDIS_URL")
        if _redis_localhost_warning:
            import warnings

            warnings.warn(
                f"Production broker/cache config uses localhost for: {', '.join(_redis_localhost_warning)}. "
                "Rate limiting, caching and background tasks will run in degraded in-memory fallback mode. "
                "Set these env vars to a hosted Redis URL (e.g. Upstash) to enable full functionality.",
                stacklevel=2,
            )
        if errors:
            raise RuntimeError("Invalid production configuration: " + "; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
