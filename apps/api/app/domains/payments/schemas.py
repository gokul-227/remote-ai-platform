"""Payments domain Pydantic schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CurrencyBalance(BaseModel):
    currency: str
    escrow_held: float
    total_earned: float
    total_spent: float
    total_released: float


class WalletBalanceResponse(BaseModel):
    user_id: uuid.UUID
    # Per currency: amounts in different currencies are never added together.
    by_currency: list[CurrencyBalance] = []
    # Filled only when every transaction shares one currency (or there are none).
    escrow_held: float | None
    total_earned: float | None
    total_spent: float | None
    total_released: float | None
    currency: str | None = "USD"
    # False while money movement is gated (see MARKETPLACE_PAYMENTS_ENABLED);
    # clients must not describe any figure here as money that moved.
    payments_enabled: bool = False


class PaymentPartySummary(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class PaymentTransactionResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    payer_id: uuid.UUID
    payee_id: uuid.UUID
    payer: PaymentPartySummary | None = None
    payee: PaymentPartySummary | None = None
    amount: float
    currency: str
    status: str
    provider: str
    provider_reference: str
    created_at: datetime
    released_at: datetime | None = None
    # Present only immediately after creation with a real (non-sandbox)
    # provider that requires client-side confirmation (e.g. Stripe) --
    # never persisted, and absent for every other response.
    client_secret: str | None = None

    model_config = {"from_attributes": True}


class DirectEscrowCreate(BaseModel):
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    payee_id: uuid.UUID
    amount: float = Field(gt=0)
    currency: str = Field(default="USD", max_length=3)
