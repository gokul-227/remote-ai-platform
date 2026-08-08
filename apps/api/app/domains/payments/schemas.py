"""Payments domain Pydantic schemas."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WalletBalanceResponse(BaseModel):
    user_id: uuid.UUID
    escrow_held: float
    total_earned: float
    total_spent: float
    total_released: float
    currency: str = "USD"


class PaymentPartySummary(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class PaymentTransactionResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    task_id: Optional[uuid.UUID] = None
    payer_id: uuid.UUID
    payee_id: uuid.UUID
    payer: Optional[PaymentPartySummary] = None
    payee: Optional[PaymentPartySummary] = None
    amount: float
    currency: str
    status: str
    provider: str
    provider_reference: str
    created_at: datetime
    released_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DirectEscrowCreate(BaseModel):
    project_id: uuid.UUID
    task_id: Optional[uuid.UUID] = None
    payee_id: uuid.UUID
    amount: float = Field(gt=0)
    currency: str = Field(default="USD", max_length=3)
