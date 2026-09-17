import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";
import { isGoogleEnabled } from "@/lib/auth";

export const metadata: Metadata = {
  title: "로그인",
  description: "리메이커 계정을 만들거나 로그인합니다. 결제 정보는 받지 않습니다.",
};

export default function LoginPage() {
  return (
    <div className="section max-w-md">
      <Suspense fallback={<p className="muted">불러오는 중…</p>}>
        <LoginForm googleEnabled={isGoogleEnabled} />
      </Suspense>
    </div>
  );
}
