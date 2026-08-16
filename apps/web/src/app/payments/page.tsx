"use client";

import { useState } from "react";
import {
  Wallet, Lock, ArrowUpRight, ShieldCheck, Plus,
  CheckCircle2, HelpCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWallet, useTransactions, usePayments, PaymentTransaction } from "@/hooks/usePayments";
import { useProjects } from "@/hooks/useProjects";
import { useFreelancers } from "@/hooks/useFreelancers";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Input";
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
  const projectsQuery = useProjects();
  const freelancersQuery = useFreelancers();

  const [showFundModal, setShowFundModal] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState(1500);
  const [currency, setCurrency] = useState("USD");

  const isCompany = user?.role === "COMPANY" || user?.role === "ADMIN";

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId.trim() || !payeeId.trim() || amount <= 0) return;

    createEscrow.mutate(
      { project_id: projectId.trim(), payee_id: payeeId.trim(), amount: Number(amount), currency: currency.toUpperCase() },
      { onSuccess: () => { setShowFundModal(false); setProjectId(""); setPayeeId(""); setAmount(1500); } }
    );
  };

  const projects = projectsQuery.data ?? [];
  const freelancers = freelancersQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 py-6">
      <div className="lg:col-span-3 space-y-4">
        <Sidebar />
      </div>

      <div className="lg:col-span-6 space-y-6">
        {/* Header */}
        <div className="card-enterprise p-6 bg-gradient-to-r from-white via-emerald-50/20 to-white dark:from-slate-900 dark:to-slate-900 border-l-4 border-l-emerald-600 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-ent badge-ent-brand text-[10px]">Financial Settlement Ledger</span>
              <span className="badge-ent badge-ent-success text-[10px]">Sandbox Escrow Active</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Wallet & Escrow Holdings <Wallet className="h-5 w-5 text-emerald-600" />
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Guaranteed milestone payments, secured escrow reserves, and real-time transaction verification.
            </p>
          </div>
          {isCompany && (
            <Button
              icon={<Plus className="h-4 w-4" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
              onClick={() => setShowFundModal(true)}
            >
              Fund Escrow
            </Button>
          )}
        </div>

        {/* 3-Balance Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card-enterprise p-5 space-y-2 border-amber-200/60 dark:border-amber-900/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Escrow Funds Held</span>
              <Lock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-extrabold text-amber-600">
              {walletLoading ? "..." : `$${(wallet?.escrow_held ?? 0).toLocaleString()}`}{" "}
              <span className="text-xs font-normal text-slate-500">USD</span>
            </p>
            <span className="text-[11px] text-slate-400 block">Funds locked safely pending deliverable approval</span>
          </div>

          <div className="card-enterprise p-5 space-y-2 border-emerald-200/60 dark:border-emerald-900/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">{isCompany ? "Total Spent" : "Total Earned"}</span>
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-600">
              {walletLoading ? "..." : `$${((isCompany ? wallet?.total_spent : wallet?.total_earned) ?? 0).toLocaleString()}`}{" "}
              <span className="text-xs font-normal text-slate-500">USD</span>
            </p>
            <span className="text-[11px] text-slate-400 block">Settled released payments to date</span>
          </div>

          <div className="card-enterprise p-5 space-y-2 border-blue-200/60 dark:border-blue-900/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Total Settled</span>
              <ShieldCheck className="h-4 w-4 text-[#0A66C2]" />
            </div>
            <p className="text-2xl font-extrabold text-[#0A66C2]">
              {walletLoading ? "..." : `$${(wallet?.total_released ?? 0).toLocaleString()}`}{" "}
              <span className="text-xs font-normal text-slate-500">USD</span>
            </p>
            <span className="text-[11px] text-slate-400 block">Released from escrow directly to talent</span>
          </div>
        </div>

        {/* Escrow Workflow Visual Guide */}
        <div className="card-enterprise p-5 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-[#0A66C2]" /> Remote AI Platform Escrow Protection Lifecycle
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-[#0A66C2] block mb-1">1. Fund Escrow</span>
              <span className="text-slate-500 text-[11px]">Organization deposits budget into sandbox escrow before task begins.</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-amber-600 block mb-1">2. Build & Log</span>
              <span className="text-slate-500 text-[11px]">Professional records work and submits verified deliverable PR.</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-purple-600 block mb-1">3. AI Review</span>
              <span className="text-slate-500 text-[11px]">Rubric evaluator generates code quality & completeness score.</span>
            </div>
            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-emerald-600 block mb-1">4. Instant Release</span>
              <span className="text-slate-500 text-[11px]">Organization confirms approval; funds transfer immediately.</span>
            </div>
          </div>
        </div>

        {/* Transactions History Table */}
        <div className="card-enterprise p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">Transaction Ledger ({transactions?.length || 0})</h2>
              <p className="text-xs text-slate-500">Immutable record of all deposits, releases, and escrow events</p>
            </div>
            <span className="text-xs text-slate-400 font-medium">Provider: Sandbox Escrow Engine</span>
          </div>

          {txsLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : transactions && transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Reference / ID</th>
                    <th className="p-3">Payer (Organization)</th>
                    <th className="p-3">Payee (Worker)</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map((tx: PaymentTransaction) => {
                    const isPayer = user?.id === tx.payer_id;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">{tx.provider_reference}</td>
                        <td className="p-3 font-medium text-slate-900 dark:text-white">{tx.payer?.full_name || "Organization"}</td>
                        <td className="p-3 font-medium text-slate-900 dark:text-white">{tx.payee?.full_name || "Professional"}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          ${tx.amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">{tx.currency}</span>
                        </td>
                        <td className="p-3">
                          <StatusBadge label={tx.status} tone={STATUS_TONE[tx.status] ?? "neutral"} />
                        </td>
                        <td className="p-3 text-slate-500">{new Date(tx.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-right">
                          {isPayer && tx.status === "ESCROWED" && (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                loading={releaseEscrow.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => releaseEscrow.mutate(tx.id)}
                              >
                                Release
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={refundEscrow.isPending}
                                onClick={() => refundEscrow.mutate(tx.id)}
                              >
                                Refund
                              </Button>
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
            <EmptyState
              icon={Wallet}
              title="No transaction records"
              description="Escrow funding and milestone releases will be logged in this ledger."
            />
          )}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <RightSidebar />
      </div>

      {/* Fund Escrow Modal */}
      <Modal open={showFundModal} onClose={() => setShowFundModal(false)} title="Fund Escrow Milestone">
        <form onSubmit={handleFundSubmit} className="space-y-4">
          {projects.length > 0 ? (
            <Select
              label="Select Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
            >
              <option value="">Choose an active project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </Select>
          ) : (
            <Input
              label="Project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="e.g. Project UUID"
              required
            />
          )}

          {freelancers.length > 0 ? (
            <Select
              label="Select Payee Professional"
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
              required
            >
              <option value="">Choose professional...</option>
              {freelancers.map((f: { id: string; user_id?: string; headline?: string; primary_role?: string }) => (
                <option key={f.id} value={f.user_id || f.id}>
                  {f.headline || f.primary_role || "Professional"} ({f.user_id || f.id})
                </option>
              ))}
            </Select>
          ) : (
            <Input
              label="Payee Professional User ID"
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
              placeholder="e.g. Professional User UUID"
              required
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount ($)"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
            <Input
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              className="uppercase"
            />
          </div>

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Funds are held securely in sandbox escrow and only released when you approve the deliverable.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setShowFundModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createEscrow.isPending}
              disabled={!projectId.trim() || !payeeId.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Fund & Lock Escrow
            </Button>
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
