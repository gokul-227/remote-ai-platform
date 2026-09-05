"""
Billing & Entitlements domain.

Architecture-only scaffolding (no real pricing decisions made yet): a `Plan`
concept, a `Subscription` linking a user to a plan, and a reusable
entitlement-checking mechanism (see `entitlements.py`) that other domains can
depend on later to gate features behind a plan. Nothing in this domain gates
any existing endpoint -- see `entitlements.py` module docstring for details.
"""
