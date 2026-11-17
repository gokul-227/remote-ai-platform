"use client";

import { useLayoutEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

function GuestAppearance() {
  const { user } = useAuth();
  useLayoutEffect(() => {
    if (!user) {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    }
  }, [user]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <GuestAppearance />
      {children}
    </AuthProvider>
  );
}
