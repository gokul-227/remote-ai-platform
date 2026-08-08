"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkspaceRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/engineer/workspace");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-xs text-slate-400 animate-pulse">Redirecting to execution workspace...</p>
    </div>
  );
}
