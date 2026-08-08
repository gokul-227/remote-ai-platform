"""Provider-neutral payment boundaries with an explicit no-real-money sandbox."""

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID, uuid4


@dataclass(frozen=True)
class PaymentProviderResult:
    reference: str
    status: str


class PaymentProvider(Protocol):
    async def authorize(self, amount: float, currency: str) -> PaymentProviderResult: ...
    async def release(self, reference: str) -> PaymentProviderResult: ...
    async def refund(self, reference: str) -> PaymentProviderResult: ...


class EscrowProvider(Protocol):
    async def hold(self, reference: str, amount: float, currency: str) -> PaymentProviderResult: ...
    async def release(self, reference: str) -> PaymentProviderResult: ...


class PayoutProvider(Protocol):
    async def payout(self, reference: str, amount: float, currency: str) -> PaymentProviderResult: ...


class SandboxPaymentProvider:
    """Deterministic adapter for development and tests; it never contacts a payment network."""

    async def authorize(self, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=f"sandbox_auth_{uuid4().hex}", status="AUTHORIZED")

    async def hold(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="ESCROWED")

    async def release(self, reference: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="RELEASED")

    async def refund(self, reference: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="REFUNDED")

    async def payout(self, reference: str, amount: float, currency: str) -> PaymentProviderResult:
        return PaymentProviderResult(reference=reference, status="PAID_OUT")
