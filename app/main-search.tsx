"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MainSearch() {
  const [q, setQ] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/complex?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="단지명 검색 (예: 래미안, 자이…)"
        className="flex-1 border border-[var(--line)] rounded px-3 py-2 text-sm bg-[var(--paper)] focus:outline-none focus:border-[var(--ink-soft)]"
      />
      <button
        type="submit"
        className="px-4 py-2 text-sm border border-[var(--line)] rounded bg-[var(--paper)] hover:bg-[var(--paper-2)] whitespace-nowrap"
      >
        검색
      </button>
    </form>
  );
}
