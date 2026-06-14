import type { Metadata } from "next";
import FeedbackForm from "./feedback-form";

export const metadata: Metadata = {
  title: "의견 보내기",
  description: "시세 개선 의견·오류 제보·기능 요청을 남겨주세요.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">의견 보내기</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        개선 의견, 오류 제보, 원하는 기능 무엇이든 환영합니다.
      </p>
      <FeedbackForm />
    </div>
  );
}
