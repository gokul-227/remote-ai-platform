"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText, Plus, CheckCircle2, FileSignature, ArrowRight,
  Building2, User,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useContracts, Contract } from "@/hooks/useContracts";
import { useFreelancers } from "@/hooks/useFreelancers";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RequireAuth } from "@/components/RequireAuth";

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SIGNED: "info",
  OFFERED: "warning",
  COMPLETED: "info",
  TERMINATED: "danger",
};

function ContractsPageContent() {
  const { user } = useAuth();
  const { data: contracts, isLoading, createContract, signContract } = useContracts(!!user);
  const freelancersQuery = useFreelancers();

  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [workerId, setWorkerId] = useState("");
  const [title, setTitle] = useState("");
  const [scopeDescription, setScopeDescription] = useState("");
  const [rateType, setRateType] = useState("FIXED");
  const [rateAmount, setRateAmount] = useState(5000);
  const [currency, setCurrency] = useState("USD");
  const [terms, setTerms] = useState("");

  const isCompany = user?.role === "COMPANY" || user?.role === "ADMIN";

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

  const allContracts: Contract[] = contracts ?? [];
  const filteredContracts = allContracts.filter((c) => filterStatus === "ALL" || c.status === filterStatus);
  const freelancers = freelancersQuery.data ?? [];

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Header Banner */}
      <div className="card-enterprise p-6 bg-gradient-to-r from-white via-blue-50/20 to-white dark:from-slate-900 dark:to-slate-900 border-l-4 border-l-[#0552CC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="badge-ent badge-ent-brand text-[10px]">Agreements Hub</span>
            <span className="badge-ent badge-ent-success text-[10px]">Digital Sign-Off</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            Contracts & Agreements <FileText className="h-5 w-5 text-[#0552CC]" />
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Digital work agreements between organizations and remote talent, with timestamped sign-off from both parties.
          </p>
        </div>
        {isCompany && (
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Issue New Contract
          </Button>
        )}
      </div>

      <Tabs
        items={[
          { key: "ALL", label: "All Agreements", count: allContracts.length },
          { key: "ACTIVE", label: "Active", count: allContracts.filter((c) => c.status === "ACTIVE").length },
          { key: "OFFERED", label: "Pending Signatures", count: allContracts.filter((c) => c.status === "OFFERED").length },
          { key: "COMPLETED", label: "Completed", count: allContracts.filter((c) => c.status === "COMPLETED").length },
        ]}
        active={filterStatus}
        onChange={(k) => setFilterStatus(k)}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredContracts.length > 0 ? (
        <div className="space-y-4">
          {filteredContracts.map((contract) => {
            const isClientSigner = user?.id === contract.client_id;
            const mySigned = isClientSigner ? contract.client_signed_at : contract.worker_signed_at;

            return (
              <div
                key={contract.id}
                className="card-enterprise p-5 space-y-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={contract.status} tone={STATUS_TONE[contract.status] ?? "neutral"} />
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        ${contract.rate_amount.toLocaleString()} {contract.currency} ({contract.rate_type})
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{contract.title}</h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      <span>{contract.client?.full_name || "Client"}:</span>
                      {contract.client_signed_at ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <span className="text-amber-500 font-semibold">Pending</span>
                      )}
                    </div>
                    <span className="text-slate-300">·</span>
                    <div className="flex items-center gap-1 text-slate-500">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>{contract.worker?.full_name || "Professional"}:</span>
                      {contract.worker_signed_at ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <span className="text-amber-500 font-semibold">Pending</span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {contract.scope_description}
                </p>

                <div className="flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 gap-2">
                  <div className="text-[11px] text-slate-400">
                    Created {new Date(contract.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    {!mySigned && contract.status !== "COMPLETED" && contract.status !== "TERMINATED" && (
                      <Button
                        size="sm"
                        loading={signContract.isPending}
                        icon={<FileSignature className="h-4 w-4" />}
                        onClick={() => signContract.mutate(contract.id)}
                      >
                        Sign Agreement
                      </Button>
                    )}
                    <Link href={`/contracts/${contract.id}`}>
                      <Button size="sm" variant="secondary">
                        View Terms <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-enterprise">
          <EmptyState
            icon={FileText}
            title="No contracts found"
            description="Work agreements between organizations and remote talent will appear here."
          />
        </div>
      )}

      {/* Issue Work Contract Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Issue Service Agreement" size="lg">
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {freelancers.length > 0 ? (
            <Select
              label="Select Professional / Contractor"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
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
              label="Worker User ID (UUID)"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              required
            />
          )}

          <Input
            label="Contract Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Senior Full-Stack React & Cloud Infrastructure Engagement"
            required
          />

          <Textarea
            label="Scope of Work & Deliverables"
            value={scopeDescription}
            onChange={(e) => setScopeDescription(e.target.value)}
            placeholder="Describe the technical outcomes, architecture requirements, and milestones..."
            rows={4}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <Select label="Rate Type" value={rateType} onChange={(e) => setRateType(e.target.value)}>
              <option value="FIXED">FIXED</option>
              <option value="HOURLY">HOURLY</option>
              <option value="MONTHLY">MONTHLY</option>
            </Select>
            <Input
              label="Rate Amount ($)"
              type="number"
              min={1}
              value={rateAmount}
              onChange={(e) => setRateAmount(Number(e.target.value))}
              required
            />
            <Input
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              className="uppercase font-mono"
            />
          </div>

          <Textarea
            label="Standard Terms & IP Assignment (Optional)"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Work for hire IP assignment, confidentiality, payment release conditions..."
            rows={3}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createContract.isPending}
              disabled={!title.trim() || !workerId.trim()}
            >
              Issue Contract Offer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function ContractsPage() {
  return (
    <RequireAuth>
      <ContractsPageContent />
    </RequireAuth>
  );
}
