import { Suspense } from "react";
import { AuthLayout } from "@/components/rap/AuthLayout";
import { OtpAuthCard } from "@/features/auth/OtpAuthCard";

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <OtpAuthCard mode="login" />
      </Suspense>
    </AuthLayout>
  );
}
