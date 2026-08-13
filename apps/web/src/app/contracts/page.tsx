"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText, Plus, CheckCircle2, FileSignature, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useContracts, Contract } from "@/hooks/useContracts";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SIGNED: "info",
  OFFERED: "warning",
  COMPLETED: "info",
  TERMINATED: "danger",
};

export default function ContractsPage() {
  const { user } = useAuth();
  const { data: contracts, isLoading, createContract, signContract } = useContracts(!!user);

  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      { worker_id: workerId.trim(), title: title.trim(), scope_description: scopeDescription.trim(), rate_type: rateType, rate_amount: Number(rateAmount), currency, terms: terms.trim() || undefined },
      { onSuccess: () => { setShowCreateModal(false); setWorkerId(""); setTitle(""); setScopeDescription(""); setRateAmount(5000); setTerms(""); } }
    );
  };

  const allContracts: Contract[] = contracts ?? [];
  const filteredContracts = allContracts.filter((c) => filterStatus === "ALL" || c.status === filterStatus);

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            Contracts <FileText className="h-5 w-5 text-[#0A66C2]" />
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Digital contracts, scope agreements, milestone escrow terms, and signing records.
          </p>
        </div>
        {(user?.role === "COMPANY" || user?.role === "ADMIN") && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>Issue New Contract</Button>
        )}
      </div>

      <Tabs
        items={["ALL", "OFFERED", "SIGNED", "ACTIVE", "COMPLETED", "TERMINATED"].map((st) => ({
          key: st, label: st, count: st === "ALL" ? allContracts.length : allContracts.filter((c) => c.status === st).length,
        }))}
        active={filterStatus}
        onChange={setFilterStatus}
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}</div>
      ) : filteredContracts.length > 0 ? (
        <div className="space-y-4">
          {filteredContracts.map((contract) => {
            const isClient = user?.id === contract.client_id;
            const isWorker = user?.id === contract.worker_id;
            const mySigned = isClient ? contract.client_signed_at : isWorker ? contract.worker_signed_at : false;

            return (
              <div key={contract.id} className="card-enterprise p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={contract.status} tone={STATUS_TONE[contract.status] ?? "neutral"} />
                      <span className="text-xs text-slate-400 font-medium">ID: {contract.id.slice(0, 8)}...</span>
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

                <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-2">
                  <div className="text-xs text-slate-400">Created {new Date(contract.created_at).toLocaleDateString()}</div>
                  <div className="flex items-center gap-2">
                    {!mySigned && contract.status !== "COMPLETED" && contract.status !== "TERMINATED" && (
                      <Button size="sm" loading={signContract.isPending} icon={<FileSignature className="h-4 w-4" />} onClick={() => signContract.mutate(contract.id)}>
                        Sign Contract
                      </Button>
                    )}
                    <Link href={`/contracts/${contract.id}`}>
                      <Button size="sm" variant="secondary">View Terms <ArrowRight className="h-3.5 w-3.5" /></Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-enterprise">
          <EmptyState icon={FileText} title="No contracts found" description="Work agreements between companies and remote workers will appear here." />
        </div>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Issue Work Contract" size="lg">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <Input label="Worker User ID (UUID)" value={workerId} onChange={(e) => setWorkerId(e.target.value)} placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" required />
          <Input label="Contract Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Senior Full-Stack React & FastAPI Engagement" required />
          <Textarea label="Scope of Work & Deliverables" value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)} placeholder="Describe the project scope, technical responsibilities, and expected outcomes..." rows={4} required />

          <div className="grid grid-cols-3 gap-3">
            <Select label="Rate Type" value={rateType} onChange={(e) => setRateType(e.target.value)}>
              <option value="FIXED">FIXED</option>
              <option value="HOURLY">HOURLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </Select>
            <Input label="Rate Amount" type="number" min={1} value={rateAmount} onChange={(e) => setRateAmount(Number(e.target.value))} required />
            <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="uppercase" />
          </div>

          <Textarea label="Terms & Conditions (Optional)" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="IP ownership, payment milestone terms, notice period..." rows={3} />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={createContract.isPending} disabled={!title.trim() || !workerId.trim()}>Issue Contract Offer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
