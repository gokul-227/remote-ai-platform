"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSignature,
  DollarSign,
  UserCheck,
  Calendar,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useContracts, Contract } from "@/hooks/useContracts";

export default function ContractsPage() {
  const { user } = useAuth();
  const { data: contracts, isLoading, createContract, signContract, terminateContract } = useContracts(!!user);

  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [workerId, setWorkerId] = useState("");
  const [title, setTitle] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [rateType, setRateType] = useState("FIXED");
  const [rateAmount, setRateAmount] = useState(5000);
  const [currency, setCurrency] = useState("USD");
  const [terms, setTerms] = useState("");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId.trim() || !title.trim() || !scopeDescription.trim() || rateAmount <= 0) return;

    createContract.mutate(
      {
        worker_id: workerId.trim(),
        title: title.trim(),
        scope_description: scopeDescription.trim(),
        rate_type: rateType,
        rate_amount: Number(rateAmount),
        currency,
        terms: terms.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowCreateModal(false);
          setWorkerId("");
          setTitle("");
          setScopeDescription("");
          setRateAmount(5000);
          setTerms("");
        },
      }
    );
  };

  const filteredContracts = contracts?.filter((c: Contract) => {
    if (filterStatus === "ALL") return true;
    return c.status === filterStatus;
  }) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE</span>;
      case "SIGNED":
        return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"><FileSignature className="h-3.5 w-3.5" /> PARTIALLY SIGNED</span>;
      case "OFFERED":
        return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> OFFERED</span>;
      case "COMPLETED":
        return <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> COMPLETED</span>;
      case "TERMINATED":
        return <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> TERMINATED</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{status}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Work Contracts & Engagements <FileText className="h-5 w-5 text-[#0A66C2]" />
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Vendor-independent digital contracts, scope agreements, milestone escrow terms, and legal signing records.
          </p>
        </div>

        {user?.role === "COMPANY" || user?.role === "ADMIN" ? (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary-brand text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Issue New Contract
          </button>
        ) : null}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap border-b border-slate-200 gap-2 text-xs font-medium">
        {["ALL", "OFFERED", "SIGNED", "ACTIVE", "COMPLETED", "TERMINATED"].map((st) => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`pb-2.5 px-3 border-b-2 font-semibold transition-colors ${
              filterStatus === st
                ? "border-[#0A66C2] text-[#0A66C2]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Contract List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-enterprise p-5 space-y-3 animate-pulse">
              <div className="h-4 w-1/3 bg-slate-200 rounded" />
              <div className="h-3 w-1/2 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : filteredContracts.length > 0 ? (
        <div className="space-y-4">
          {filteredContracts.map((contract: Contract) => {
            const isClient = user?.id === contract.client_id;
            const isWorker = user?.id === contract.worker_id;
            const mySigned = isClient ? contract.client_signed_at : isWorker ? contract.worker_signed_at : false;

            return (
              <div key={contract.id} className="card-enterprise p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(contract.status)}
                      <span className="text-xs text-slate-400 font-medium">
                        ID: {contract.id.slice(0, 8)}...
                      </span>
                    </div>
                    <h2 className="font-bold text-slate-900 text-lg">{contract.title}</h2>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-bold text-slate-900">
                      ${contract.rate_amount.toLocaleString()} <span className="text-xs font-normal text-slate-500">{contract.currency} / {contract.rate_type.toLowerCase()}</span>
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{contract.scope_description}</p>

                {/* Parties info */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px] block">Client / Company</span>
                    <span className="font-semibold text-slate-900">{contract.client?.full_name || "Client"}</span>
                    {contract.client_signed_at ? (
                      <span className="text-[10px] text-emerald-600 block flex items-center gap-1 font-medium mt-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Signed {new Date(contract.client_signed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 block italic mt-0.5">Pending Signature</span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] block">Remote Engineer / Worker</span>
                    <span className="font-semibold text-slate-900">{contract.worker?.full_name || "Engineer"}</span>
                    {contract.worker_signed_at ? (
                      <span className="text-[10px] text-emerald-600 block flex items-center gap-1 font-medium mt-0.5">
                        <CheckCircle2 className="h-3 w-3" /> Signed {new Date(contract.worker_signed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 block italic mt-0.5">Pending Signature</span>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-2">
                  <div className="text-xs text-slate-400">
                    Created {new Date(contract.created_at).toLocaleDateString()}
                  </div>

                  <div className="flex items-center gap-2">
                    {!mySigned && contract.status !== "COMPLETED" && contract.status !== "TERMINATED" && (
                      <button
                        onClick={() => signContract.mutate(contract.id)}
                        disabled={signContract.isPending}
                        className="btn-primary-brand text-xs py-1.5 px-4 flex items-center gap-1.5"
                      >
                        <FileSignature className="h-4 w-4" /> Sign Contract
                      </button>
                    )}

                    <Link
                      href={`/contracts/${contract.id}`}
                      className="btn-secondary-brand text-xs py-1.5 px-3 flex items-center gap-1"
                    >
                      View Terms <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-enterprise p-12 text-center space-y-2">
          <FileText className="h-8 w-8 text-slate-300 mx-auto" />
          <h3 className="font-semibold text-slate-900 text-sm">No contracts found</h3>
          <p className="text-xs text-slate-500">
            Work agreements between companies and remote workers will appear here.
          </p>
        </div>
      )}

      {/* CREATE CONTRACT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-enterprise max-w-xl w-full p-6 space-y-4 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-[#0A66C2]" /> Issue Work Contract
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Worker User ID (UUID)
                </label>
                <input
                  type="text"
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  required
                  className="input-enterprise text-xs py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contract Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Senior Full-Stack React & FastAPI Engagement"
                  required
                  className="input-enterprise text-xs py-2"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Scope of Work & Deliverables
                </label>
                <textarea
                  value={scopeDescription}
                  onChange={(e) => setScopeDescription(e.target.value)}
                  placeholder="Describe the project scope, technical responsibilities, and expected outcomes..."
                  rows={4}
                  required
                  className="input-enterprise w-full text-xs p-3"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rate Type</label>
                  <select
                    value={rateType}
                    onChange={(e) => setRateType(e.target.value)}
                    className="input-enterprise text-xs py-2"
                  >
                    <option value="FIXED">FIXED</option>
                    <option value="HOURLY">HOURLY</option>
                    <option value="MONTHLY">MONTHLY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rate Amount</label>
                  <input
                    type="number"
                    min={1}
                    value={rateAmount}
                    onChange={(e) => setRateAmount(Number(e.target.value))}
                    required
                    className="input-enterprise text-xs py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    maxLength={3}
                    className="input-enterprise text-xs py-2 uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Terms & Conditions (Optional)
                </label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="IP ownership, payment milestone terms, notice period..."
                  rows={3}
                  className="input-enterprise w-full text-xs p-3"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary-brand text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createContract.isPending || !title.trim() || !workerId.trim()}
                  className="btn-primary-brand text-xs py-2 px-5 disabled:opacity-50"
                >
                  {createContract.isPending ? "Issuing..." : "Issue Contract Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
