import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import VoiceManager from "@/components/VoiceManager";

export const metadata: Metadata = {
  title: "내 목소리",
  description: "파일 속 목소리를 떠내 대본 읽기 목소리로 씁니다.",
};

export default async function VoicesPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/voices");

  return (
    <div className="section">
      <p className="eyebrow">목소리</p>
      <h1 className="h1 text-3xl sm:text-4xl">내 목소리</h1>
      <p className="muted mt-3 max-w-2xl">
        파일에 담긴 목소리를 떠내 두면, 재구성·더빙에서 기본 목소리 대신 그 목소리로 읽힐 수 있습니다.
        참고 음성은 내 계정에만 보이고, 원본 파일은 떠낸 뒤 바로 지웁니다.
      </p>

      <div className="mt-8 max-w-3xl">
        <VoiceManager />
      </div>

      <p className="muted mt-10 max-w-2xl text-xs">
        다른 사람의 목소리를 허락 없이 흉내 내는 것은 법으로 문제가 될 수 있습니다. 본인 목소리이거나
        사용 허락을 받은 목소리만 올려 주세요. 신고가 들어오면 해당 목소리는 삭제됩니다.
      </p>
    </div>
  );
}
