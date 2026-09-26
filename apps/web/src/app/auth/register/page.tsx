import { Suspense } from "react";
import { AuthLayout } from "@/components/rap/AuthLayout";
import { OtpAuthCard } from "@/features/auth/OtpAuthCard";

export default function RegisterPage() {
  return (
    <AuthLayout>
      <Suspense>
        <OtpAuthCard mode="register" />
      </Suspense>
    </AuthLayout>
  );
}
