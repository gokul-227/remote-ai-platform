"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useTrustScore, useUserVerifications, useAddVerification, ScoreFactor } from "@/hooks/useTrust";

const VERIFICATION_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  VERIFIED: { label: "Verified by admin", className: "bg-emerald-100 text-emerald-700" },
  SELF_REPORTED: { label: "Self-reported, not yet reviewed", className: "bg-slate-100 text-slate-600" },
  PENDING: { label: "Pending review", className: "bg-amber-100 text-amber-700" },
  REJECTED: { label: "Review rejected", className: "bg-red-100 text-red-700" },
};

export function TrustBadge({ userId, showBreakdownToggle = true }: { userId: string; showBreakdownToggle?: boolean }) {
  const { data: trust, isLoading } = useTrustScore(userId);
  const { data: verifications } = useUserVerifications(userId);
  const addVerification = useAddVerification();
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !trust) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-400 text-xs px-2.5 py-1 rounded-full animate-pulse">
        <ShieldCheck className="h-3.5 w-3.5" /> Trust Score ...
      </div>
    );
  }

  const score = trust.overall_score;

  const getScoreTier = (val: number) => {
    if (val >= 90) return { label: "Top Rated Plus", color: "bg-amber-500 text-white border-amber-600" };
    if (val >= 80) return { label: "Verified Top Talent", color: "bg-emerald-600 text-white border-emerald-700" };
    if (val >= 70) return { label: "Verified Professional", color: "bg-[#B54A2C] text-white border-[#8F3A21]" };
    return { label: "Member", color: "bg-slate-700 text-white border-slate-800" };
  };

  const tier = getScoreTier(score);
  const factors: ScoreFactor[] = trust.score_breakdown?.factors || [];

  return (
    <div className="inline-block space-y-2">
      <div className="inline-flex items-center gap-2">
        <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full shadow-xs border ${tier.color}`}>
          <ShieldCheck className="h-4 w-4" />
          <span>{score}/100 Trust Score</span>
          <span className="text-[10px] opacity-80 uppercase tracking-wider pl-1 font-semibold border-l border-white/30">
            {tier.label}
          </span>
        </div>

        {showBreakdownToggle && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-[#B54A2C] font-semibold inline-flex items-center gap-0.5"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Expanded Explainable Factors */}
      {expanded && (
        <div className="card-enterprise p-4 max-w-sm space-y-3 bg-white shadow-lg border border-slate-200 rounded-xl text-xs text-left">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#B54A2C]" /> Explainable Trust Factors
            </span>
            <span className="text-[10px] font-bold text-slate-500">{trust.review_count} Reviews</span>
          </div>

          <div className="space-y-2">
            {factors.map((factor, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>{factor.category}</span>
                  <span className="text-[#B54A2C]">{factor.points} / {factor.max} pts</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">{factor.detail}</p>
              </div>
            ))}
          </div>

          {/* Submitted credentials and their real review status */}
          {verifications && verifications.length > 0 && (
            <div className="border-t border-slate-100 pt-2 space-y-1">
              {verifications.map((v) => {
                const meta = VERIFICATION_STATUS_LABEL[v.status] || VERIFICATION_STATUS_LABEL.SELF_REPORTED;
                return (
                  <div key={v.id} className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-700">{v.verification_type}</span>
                    <span className={`px-1.5 py-0.5 rounded font-semibold ${meta.className}`}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit a credential for review — this does not verify it instantly */}
          <div className="border-t border-slate-100 pt-2 space-y-1">
            <p className="text-[10px] text-slate-400">Submitting only records your claim — an admin must review it before it counts as verified.</p>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => addVerification.mutate({ verification_type: "GITHUB" })}
                disabled={addVerification.isPending}
                className="text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1 rounded"
              >
                Submit GitHub for review
              </button>
              <button
                onClick={() => addVerification.mutate({ verification_type: "IDENTITY" })}
                disabled={addVerification.isPending}
                className="text-[10px] font-semibold bg-sky-50 text-[#B54A2C] hover:bg-sky-100 px-2 py-1 rounded"
              >
                Submit ID for review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
