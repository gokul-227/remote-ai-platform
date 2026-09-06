"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FileSignature,
  Clock,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useContract, useContracts } from "@/hooks/useContracts";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { RequireAuth } from "@/components/RequireAuth";

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: "success", SIGNED: "info", OFFERED: "warning", COMPLETED: "info", TERMINATED: "danger",
};

function ContractDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { data: contract, isLoading, addMilestone } = useContract(id, !!user);
  const { signContract, terminateContract } = useContracts(!!user);

  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneAmount, setMilestoneAmount] = useState(1000);

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneTitle.trim() || milestoneAmount <= 0) return;

    addMilestone.mutate(
      {
        title: milestoneTitle.trim(),
        amount: Number(milestoneAmount),
      },
      {
        onSuccess: () => {
          setShowMilestoneModal(false);
          setMilestoneTitle("");
          setMilestoneAmount(1000);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-4 animate-pulse">
        <div className="h-6 w-1/4 bg-slate-200 rounded" />
        <div className="h-40 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
        <h2 className="font-bold text-slate-900 text-lg">Contract Not Found</h2>
        <p className="text-xs text-slate-500">The contract does not exist or you do not have permission to view it.</p>
        <Link href="/contracts" className="btn-secondary-brand text-xs inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Contracts
        </Link>
      </div>
    );
  }

  const isClient = user?.id === contract.client_id;
  const isWorker = user?.id === contract.worker_id;
  const mySigned = isClient ? contract.client_signed_at : isWorker ? contract.worker_signed_at : false;

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <Link href="/contracts" className="text-xs font-semibold text-slate-600 hover:text-[#0552CC] flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Contracts List
        </Link>

        <div className="flex items-center gap-2">
          {!mySigned && contract.status !== "COMPLETED" && contract.status !== "TERMINATED" && (
            <Button size="sm" loading={signContract.isPending} icon={<FileSignature className="h-4 w-4" />} onClick={() => signContract.mutate(contract.id)}>
              Sign Contract
            </Button>
          )}

          {contract.status !== "TERMINATED" && contract.status !== "COMPLETED" && (
            <Button size="sm" variant="danger" loading={terminateContract.isPending} onClick={() => terminateContract.mutate(contract.id)}>
              Terminate
            </Button>
          )}
        </div>
      </div>

      {/* Main Contract Card */}
      <div className="card-enterprise p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <StatusBadge label={contract.status} tone={STATUS_TONE[contract.status] ?? "neutral"} />
            <h1 className="text-2xl font-bold text-slate-900 mt-1">{contract.title}</h1>
            <p className="text-xs text-slate-400 mt-0.5">Contract ID: {contract.id}</p>
          </div>

          <div className="text-right">
            <span className="text-2xl font-bold text-slate-900">
              ${contract.rate_amount.toLocaleString()} <span className="text-xs font-normal text-slate-500">{contract.currency} / {contract.rate_type.toLowerCase()}</span>
            </span>
          </div>
        </div>

        {/* Digital Signatures Box */}
        <div className="grid sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Organization</span>
            <p className="font-semibold text-slate-900 text-sm">{contract.client?.full_name || "Organization"}</p>
            <p className="text-xs text-slate-500">{contract.client?.email}</p>
            {contract.client_signed_at ? (
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Signed on {new Date(contract.client_signed_at).toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-amber-700 font-semibold flex items-center gap-1 mt-2">
                <Clock className="h-4 w-4 text-amber-600" /> Signature Pending
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Remote Professional / Worker</span>
            <p className="font-semibold text-slate-900 text-sm">{contract.worker?.full_name || "Worker"}</p>
            <p className="text-xs text-slate-500">{contract.worker?.email}</p>
            {contract.worker_signed_at ? (
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mt-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Signed on {new Date(contract.worker_signed_at).toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-amber-700 font-semibold flex items-center gap-1 mt-2">
                <Clock className="h-4 w-4 text-amber-600" /> Signature Pending
              </span>
            )}
          </div>
        </div>

        {/* Scope Description */}
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900 text-sm">Scope of Work</h3>
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-100">
            {contract.scope_description}
          </p>
        </div>

        {/* Terms & Conditions */}
        {contract.terms && (
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm">Terms & Legal Clauses</h3>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-100">
              {contract.terms}
            </p>
          </div>
        )}

        {/* Milestones Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">Payment Milestones</h3>
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowMilestoneModal(true)}>
              Add Milestone
            </Button>
          </div>

          {contract.milestones && contract.milestones.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Milestone Title</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contract.milestones.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="p-3 font-medium text-slate-900">{m.title}</td>
                      <td className="p-3 font-bold text-slate-900">${m.amount.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded text-[10px] uppercase">
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No milestones configured for this contract.</p>
          )}
        </div>
      </div>

      <Modal open={showMilestoneModal} onClose={() => setShowMilestoneModal(false)} title="Add Contract Milestone">
        <form onSubmit={handleAddMilestone} className="space-y-4">
          <Input label="Milestone Title" value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} placeholder="e.g. Milestone 1: API Core Implementation" required />
          <Input label="Amount ($)" type="number" min={1} value={milestoneAmount} onChange={(e) => setMilestoneAmount(Number(e.target.value))} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowMilestoneModal(false)}>Cancel</Button>
            <Button type="submit" loading={addMilestone.isPending} disabled={!milestoneTitle.trim()}>Add Milestone</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <RequireAuth>
      <ContractDetailContent params={params} />
    </RequireAuth>
  );
}
