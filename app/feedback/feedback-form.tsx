"use client";

import { useState } from "react";

export default function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    if (message.trim().length < 5) {
      setErr("5자 이상 입력해 주세요.");
      return;
    }
    setStatus("sending");
    setErr("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          contact,
          path: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "접수 실패");
      }
      setStatus("ok");
      setMessage("");
      setContact("");
    } catch (e) {
      setStatus("error");
      setErr((e as Error).message);
    }
  }

  if (status === "ok") {
    return (
      <div className="border border-[var(--line)] rounded p-5 text-sm">
        <p className="font-semibold mb-1">의견 감사합니다 🙏</p>
        <p className="text-[var(--ink-soft)]">소중히 검토하겠습니다.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-3 text-xs text-[var(--blue)] hover:underline"
        >
          또 보내기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <div>
        <label className="block text-sm font-medium mb-1">의견·제보 내용</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="개선 의견, 오류 제보, 원하는 기능 등 자유롭게 남겨주세요."
          className="w-full border border-[var(--line)] rounded px-3 py-2 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)] resize-y"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          회신받을 연락처 <span className="text-[var(--ink-soft)] font-normal">(선택)</span>
        </label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="이메일 등 — 답변이 필요하면 남겨주세요"
          className="w-full border border-[var(--line)] rounded px-3 py-2 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)]"
        />
      </div>

      {err && <p className="text-xs text-[var(--red)]">{err}</p>}

      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-[var(--ink)] text-[var(--paper)] text-sm px-4 py-2 rounded font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        {status === "sending" ? "보내는 중…" : "보내기"}
      </button>
    </form>
  );
}
