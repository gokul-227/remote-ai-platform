"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";

export default function ProfileRedirectPage() {
  return (
    <RequireAuth>
      <ProfileRedirectContent />
    </RequireAuth>
  );
}

function ProfileRedirectContent() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.role === "COMPANY") {
        router.replace("/company/profile");
      } else {
        router.replace("/engineer/profile");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-[400px] items-center justify-center text-slate-500 gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading profile...
    </div>
  );
}
