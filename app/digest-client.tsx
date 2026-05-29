"use client";

import { useState } from "react";

export default function DigestClient({
  text,
  date,
}: {
  text: string;
  date: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-lg font-semibold">다이제스트</h2>
        {date && <span className="text-sm text-[var(--ink-soft)]">{date}</span>}
      </div>
      <p className="text-xs text-[var(--ink-soft)] mb-3">
        카페·단톡방에 그대로 복붙할 수 있는 텍스트입니다.
      </p>
      <div className="relative">
        <pre className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-4 pr-16 text-sm whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {text}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 bg-[var(--ink)] text-[var(--paper)] text-xs px-3 py-1 rounded hover:opacity-80 transition-opacity"
        >
          {copied ? "복사됨 ✓" : "복사"}
        </button>
      </div>
    </div>
  );
}
