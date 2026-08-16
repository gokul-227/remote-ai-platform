"use client";

import { useState } from "react";
import {
  Wallet, Lock, ArrowUpRight, ShieldCheck, Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWallet, useTransactions, usePayments, PaymentTransaction } from "@/hooks/usePayments";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { RightSidebar } from "@/components/RightSidebar";

const STATUS_TONE: Record<string, StatusTone> = {
  RELEASED: "success",
  ESCROWED: "warning",
  REFUNDED: "neutral",
};

function PaymentsWalletContent() {
  const { user } = useAuth();
  const { data: wallet, isLoading: walletLoading } = useWallet(!!user);
  const { data: transactions, isLoading: txsLoading } = useTransactions(!!user);
  const { createEscrow, releaseEscrow, refundEscrow } = usePayments();

  const [showFundModal, setShowFundModal] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState(1500);
  const [currency, setCurrency] = useState("USD");

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId.trim() || !payeeId.trim() || amount <= 0) return;

    createEscrow.mutate(
      { project_id: projectId.trim(), payee_id: payeeId.trim(), amount: Number(amount), currency: currency.toUpperCase() },
      { onSuccess: () => { setShowFundModal(false); setProjectId(""); setPayeeId(""); setAmount(1500); } }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-6">
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />
      </div>

      <div className="lg:col-span-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Wallet & Payments <Wallet className="h-5 w-5 text-[#0A66C2]" />
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Balances, escrow holdings, milestone settlements, and transaction history.
            </p>
          </div>
          {(user?.role === "COMPANY" || user?.role === "ADMIN") && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowFundModal(true)}>Fund Escrow</Button>
          )}
        </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-enterprise p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Escrow Funds Held</span>
            <Lock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {walletLoading ? "..." : `$${(wallet?.escrow_held ?? 0).toLocaleString()}`} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Funds locked safely pending task approvals</span>
        </div>

        <div className="card-enterprise p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{user?.role === "COMPANY" ? "Total Spent" : "Total Earned"}</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {walletLoading ? "..." : `$${((user?.role === "COMPANY" ? wallet?.total_spent : wallet?.total_earned) ?? 0).toLocaleString()}`} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Settled released payments</span>
        </div>

        <div className="card-enterprise p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Released</span>
            <ShieldCheck className="h-4 w-4 text-[#0A66C2]" />
          </div>
          <p className="text-2xl font-bold text-[#0A66C2]">
            {walletLoading ? "..." : `$${(wallet?.total_released ?? 0).toLocaleString()}`} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Released from escrow to engineers</span>
        </div>
      </div>

      {/* Transactions History Table */}
      <div className="card-enterprise p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-900 text-base">Transaction Ledger ({transactions?.length || 0})</h2>
          <span className="text-xs text-slate-400 font-medium">Provider: Sandbox Escrow Engine</span>
        </div>

        {txsLoading ? (
          <div className="space-y-2 py-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : transactions && transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Reference / ID</th>
                  <th className="p-3">Payer (Client)</th>
                  <th className="p-3">Payee (Worker)</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx: PaymentTransaction) => {
                  const isPayer = user?.id === tx.payer_id;
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-[11px] text-slate-700">{tx.provider_reference}</td>
                      <td className="p-3 font-medium text-slate-900">{tx.payer?.full_name || "Client"}</td>
                      <td className="p-3 font-medium text-slate-900">{tx.payee?.full_name || "Engineer"}</td>
                      <td className="p-3 font-bold text-slate-900">
                        ${tx.amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">{tx.currency}</span>
                      </td>
                      <td className="p-3"><StatusBadge label={tx.status} tone={STATUS_TONE[tx.status] ?? "neutral"} /></td>
                      <td className="p-3 text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-right">
                        {isPayer && tx.status === "ESCROWED" && (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" loading={releaseEscrow.isPending} onClick={() => releaseEscrow.mutate(tx.id)}>Release</Button>
                            <Button size="sm" variant="danger" loading={refundEscrow.isPending} onClick={() => refundEscrow.mutate(tx.id)}>Refund</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Wallet} title="No transaction records" description="Escrow funding and milestone releases will be logged in this ledger." />
        )}
      </div>
    </div>

      <div className="lg:col-span-3 space-y-4">
        <RightSidebar />
      </div>

      <Modal open={showFundModal} onClose={() => setShowFundModal(false)} title="Fund Escrow Payment">
        <form onSubmit={handleFundSubmit} className="space-y-4">
          <Input label="Project ID (UUID)" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="e.g. Project UUID" required />
          <Input label="Payee Engineer User ID (UUID)" value={payeeId} onChange={(e) => setPayeeId(e.target.value)} placeholder="e.g. Engineer User UUID" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount ($)" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required />
            <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="uppercase" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowFundModal(false)}>Cancel</Button>
            <Button type="submit" loading={createEscrow.isPending} disabled={!projectId.trim() || !payeeId.trim()}>Fund & Lock Escrow</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function PaymentsWalletPage() {
  return (
    <RequireAuth>
      <PaymentsWalletContent />
    </RequireAuth>
  );
}
