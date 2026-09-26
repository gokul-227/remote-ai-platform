"""Contract and contract-milestone state rules, enforced server-side.

Both the contracts router and the project-milestone sync path go through
these helpers so a direct API call can never reach a state the UI would not
offer (for example approving work on an unsigned contract, or marking a
milestone paid without any payment behind it).
"""

from fastapi import HTTPException, status

from app.domains.contracts.models import Contract

# Statuses in which the agreed terms may still change. Once either party has
# signed, the terms are frozen: a signature must bind to exactly what the
# signer saw.
EDITABLE_CONTRACT_STATUSES = {"DRAFT", "OFFERED"}
SIGNABLE_CONTRACT_STATUSES = {"DRAFT", "OFFERED", "SIGNED"}
TERMINAL_CONTRACT_STATUSES = {"COMPLETED", "TERMINATED"}

# (from, to) -> which party may make that move. PAID is deliberately absent:
# it may only be recorded from payment-settlement evidence, never assigned.
_MILESTONE_TRANSITIONS: dict[tuple[str, str], str] = {
    ("PENDING", "IN_PROGRESS"): "worker",
    ("PENDING", "DELIVERED"): "worker",
    ("IN_PROGRESS", "DELIVERED"): "worker",
    ("DELIVERED", "APPROVED"): "client",
    # Client requests changes on delivered work.
    ("DELIVERED", "IN_PROGRESS"): "client",
}


def party_of(contract: Contract, user_id: object) -> str | None:
    if user_id == contract.client_id:
        return "client"
    if user_id == contract.worker_id:
        return "worker"
    return None


def terms_are_frozen(contract: Contract) -> bool:
    return (
        contract.status not in EDITABLE_CONTRACT_STATUSES
        or contract.client_signed_at is not None
        or contract.worker_signed_at is not None
    )


def ensure_terms_editable(contract: Contract) -> None:
    if terms_are_frozen(contract):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contract terms are frozen once either party has signed",
        )


def ensure_milestone_transition(
    contract: Contract, current: str, target: str, actor_party: str | None
) -> None:
    """Raise unless `actor_party` may move a milestone from `current` to `target`."""
    if target == "PAID":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A milestone is marked paid only from a settled payment, not manually",
        )
    if contract.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Milestones can only change once both parties have signed the contract",
        )
    allowed_party = _MILESTONE_TRANSITIONS.get((current, target))
    if allowed_party is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A milestone cannot move from {current} to {target}",
        )
    if actor_party != allowed_party:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only the professional can start or deliver a milestone"
                if allowed_party == "worker"
                else "Only the client can approve delivered work or request changes"
            ),
        )
