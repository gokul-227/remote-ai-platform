"use client";

import { useState } from "react";
import { ShieldCheck, Star, CheckCircle2, Info, ChevronDown, ChevronUp, Award, Sparkles } from "lucide-react";
import { useTrustScore, useAddVerification, ScoreFactor } from "@/hooks/useTrust";

export function TrustBadge({ userId, showBreakdownToggle = true }: { userId: string; showBreakdownToggle?: boolean }) {
  const { data: trust, isLoading } = useTrustScore(userId);
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
    if (val >= 70) return { label: "Verified Professional", color: "bg-[#0A66C2] text-white border-blue-700" };
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
            className="text-xs text-slate-500 hover:text-[#0A66C2] font-semibold inline-flex items-center gap-0.5"
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
              <Sparkles className="h-4 w-4 text-[#0A66C2]" /> Explainable Trust Factors
            </span>
            <span className="text-[10px] font-bold text-slate-500">{trust.review_count} Reviews</span>
          </div>

          <div className="space-y-2">
            {factors.map((factor, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>{factor.category}</span>
                  <span className="text-[#0A66C2]">{factor.points} / {factor.max} pts</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">{factor.detail}</p>
              </div>
            ))}
          </div>

          {/* Quick add verification badge button */}
          <div className="border-t border-slate-100 pt-2 flex flex-wrap gap-1">
            <button
              onClick={() => addVerification.mutate({ verification_type: "GITHUB" })}
              disabled={addVerification.isPending}
              className="text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1 rounded"
            >
              + Add GitHub Badge
            </button>
            <button
              onClick={() => addVerification.mutate({ verification_type: "IDENTITY" })}
              disabled={addVerification.isPending}
              className="text-[10px] font-semibold bg-sky-50 text-[#0A66C2] hover:bg-sky-100 px-2 py-1 rounded"
            >
              + Add ID Badge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
