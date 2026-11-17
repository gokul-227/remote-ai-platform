"use client";

import { useAuth } from "@/lib/auth";
import { rememberReturnTo } from "@/figma/live";

export function JobApplyLink({ id }: { id: string }) {
  const { user } = useAuth();
  const route = `jobdetail/${id}`;
  return (
    <a
      href={user ? `/#${route}` : "/#register"}
      onClick={() => {
        if (!user) rememberReturnTo(route);
      }}
      className="inline-flex rounded-full bg-brand px-5 py-2.5 font-semibold text-white hover:bg-brand-hover"
    >
      {user ? "View and apply" : "Sign up to apply"}
    </a>
  );
}
