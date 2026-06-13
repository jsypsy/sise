"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type Section = "high" | "rebound" | null;

const PRICE_RE = /\d+억(?:\s[\d,]+)?|[\d,]+만/;

function StyledLine({ line, section }: { line: string; section: Section }) {
  const trimmed = line.trimStart();
  if (!trimmed) return <div className="h-1" />;

  if (trimmed.startsWith("[아파트")) {
    return <div className="font-bold text-sm">{trimmed}</div>;
  }
  if (trimmed.startsWith("총 ")) {
    return <div className="text-xs text-[var(--ink-soft)]">{trimmed}</div>;
  }
  if (trimmed.startsWith("ⓘ")) {
    return <div className="text-xs text-[var(--ink-soft)] mt-2">{trimmed}</div>;
  }

  if (trimmed.startsWith("■")) {
    const isHigh = trimmed.includes("신고가");
    return (
      <div className={`font-semibold text-sm mt-3 ${isHigh ? "text-red-600" : "text-blue-600"}`}>
        {trimmed}
      </div>
    );
  }

  if (section === "high") {
    const m = trimmed.match(
      new RegExp(`^(.+? \\([^)]+\\))\\s+(\\d+평)\\s+(${PRICE_RE.source})(?:\\s+\\(직전\\s+([^)]+)\\))?$`)
    );
    if (m) {
      const [, nameAndLoc, pyeong, price, prev] = m;
      return (
        <div className="text-sm pl-2 leading-snug">
          {nameAndLoc}{" "}
          <span className="text-[var(--ink-soft)]">{pyeong}</span>{" "}
          <span className="text-red-600 font-semibold">{price}</span>
          {prev && (
            <span className="text-[var(--ink-soft)] text-xs"> (직전 {prev})</span>
          )}
        </div>
      );
    }
  }

  if (section === "rebound") {
    const m = trimmed.match(
      new RegExp(`^(.+? \\([^)]+\\))\\s+(\\d+평)\\s+(${PRICE_RE.source})(?:\\s+·\\s+회복률\\s+([\\d.]+%))?$`)
    );
    if (m) {
      const [, nameAndLoc, pyeong, price, rate] = m;
      let badge: ReactNode = null;
      if (rate) {
        const val = parseFloat(rate);
        const cls =
          val >= 100 ? "bg-red-100 text-red-700" :
          val >= 99  ? "bg-orange-100 text-orange-700" :
          val >= 95  ? "bg-yellow-100 text-yellow-700" :
                       "bg-gray-100 text-[var(--ink-soft)]";
        badge = (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>
            회복률 {rate}
          </span>
        );
      }
      return (
        <div className="text-sm pl-2 leading-snug">
          {nameAndLoc}{" "}
          <span className="text-[var(--ink-soft)]">{pyeong}</span>{" "}
          <span className="font-medium">{price}</span>
          {badge && <> · {badge}</>}
        </div>
      );
    }
  }

  return <div className="text-sm pl-2">{trimmed}</div>;
}

function renderDigest(text: string): ReactNode {
  const lines = text.split("\n");
  let section: Section = null;
  return lines.map((line, i) => {
    if (line.includes("■ 신고가")) section = "high";
    else if (line.includes("■ 반등")) section = "rebound";
    return <StyledLine key={i} line={line} section={section} />;
  });
}

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
        <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-4 pr-16 leading-relaxed">
          {renderDigest(text)}
        </div>
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
