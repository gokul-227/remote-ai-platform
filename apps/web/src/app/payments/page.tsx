"use client";

import { useState } from "react";
import {
  Wallet,
  DollarSign,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWallet, useTransactions, usePayments, PaymentTransaction } from "@/hooks/usePayments";

export default function PaymentsWalletPage() {
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
      {
        project_id: projectId.trim(),
        payee_id: payeeId.trim(),
        amount: Number(amount),
        currency: currency.toUpperCase(),
      },
      {
        onSuccess: () => {
          setShowFundModal(false);
          setProjectId("");
          setPayeeId("");
          setAmount(1500);
        },
      }
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RELEASED":
        return <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> RELEASED</span>;
      case "ESCROWED":
        return <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase flex items-center gap-1"><Lock className="h-3 w-3" /> ESCROWED</span>;
      case "REFUNDED":
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase">REFUNDED</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase">{status}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Financial Ledger & Wallet <Wallet className="h-5 w-5 text-[#0A66C2]" />
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Provider-neutral financial balances, escrow holdings, milestone settlements, and transaction history.
          </p>
        </div>

        {user?.role === "COMPANY" || user?.role === "ADMIN" ? (
          <button
            onClick={() => setShowFundModal(true)}
            className="btn-primary-brand text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Fund Escrow
          </button>
        ) : null}
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-enterprise p-5 space-y-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Escrow Funds Held</span>
            <Lock className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400">
            ${walletLoading ? "..." : wallet?.escrow_held.toLocaleString()} <span className="text-xs font-normal text-slate-300">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Funds locked safely pending task approvals</span>
        </div>

        <div className="card-enterprise p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{user?.role === "COMPANY" ? "Total Spent" : "Total Earned"}</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            ${walletLoading ? "..." : (user?.role === "COMPANY" ? wallet?.total_spent : wallet?.total_earned)?.toLocaleString()} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Settled released payments</span>
        </div>

        <div className="card-enterprise p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Released</span>
            <ShieldCheck className="h-4 w-4 text-[#0A66C2]" />
          </div>
          <p className="text-2xl font-bold text-[#0A66C2]">
            ${walletLoading ? "..." : wallet?.total_released.toLocaleString()} <span className="text-xs font-normal text-slate-500">USD</span>
          </p>
          <span className="text-[11px] text-slate-400 block">Released from escrow to engineers</span>
        </div>
      </div>

      {/* Transactions History Table */}
      <div className="card-enterprise p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
            Transaction Ledger ({transactions?.length || 0})
          </h2>
          <span className="text-xs text-slate-400 font-medium">Provider: Sandbox Escrow Engine</span>
        </div>

        {txsLoading ? (
          <p className="text-xs text-slate-400 py-6 text-center">Loading transactions...</p>
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
                      <td className="p-3 font-mono text-[11px] text-slate-700">
                        {tx.provider_reference}
                      </td>
                      <td className="p-3 font-medium text-slate-900">
                        {tx.payer?.full_name || "Client"}
                      </td>
                      <td className="p-3 font-medium text-slate-900">
                        {tx.payee?.full_name || "Engineer"}
                      </td>
                      <td className="p-3 font-bold text-slate-900">
                        ${tx.amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500">{tx.currency}</span>
                      </td>
                      <td className="p-3">{getStatusBadge(tx.status)}</td>
                      <td className="p-3 text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        {isPayer && tx.status === "ESCROWED" && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => releaseEscrow.mutate(tx.id)}
                              disabled={releaseEscrow.isPending}
                              className="btn-primary-brand text-[11px] py-1 px-2.5"
                            >
                              Release
                            </button>
                            <button
                              onClick={() => refundEscrow.mutate(tx.id)}
                              disabled={refundEscrow.isPending}
                              className="btn-secondary-brand text-[11px] py-1 px-2.5 text-red-600 hover:bg-red-50 border-red-200"
                            >
                              Refund
                            </button>
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
          <div className="p-12 text-center space-y-2">
            <Wallet className="h-8 w-8 text-slate-300 mx-auto" />
            <h3 className="font-semibold text-slate-900 text-sm">No transaction records</h3>
            <p className="text-xs text-slate-500">
              Escrow funding and milestone releases will be logged in this ledger.
            </p>
          </div>
        )}
      </div>

      {/* FUND ESCROW MODAL */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-enterprise max-w-md w-full p-6 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Lock className="h-5 w-5 text-[#0A66C2]" /> Fund Escrow Payment
              </h3>
              <button
                onClick={() => setShowFundModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project ID (UUID)
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="e.g. Project UUID"
                  required
                  className="input-enterprise text-xs py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payee Engineer User ID (UUID)
                </label>
                <input
                  type="text"
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value)}
                  placeholder="e.g. Engineer User UUID"
                  required
                  className="input-enterprise text-xs py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    required
                    className="input-enterprise text-xs py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    maxLength={3}
                    className="input-enterprise text-xs py-2 uppercase"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFundModal(false)}
                  className="btn-secondary-brand text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEscrow.isPending || !projectId.trim() || !payeeId.trim()}
                  className="btn-primary-brand text-xs py-2 px-5 disabled:opacity-50"
                >
                  {createEscrow.isPending ? "Authorizing..." : "Fund & Lock Escrow"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
