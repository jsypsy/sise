"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { toBlob } from "html-to-image";

type Section = "high" | "rebound" | null;

const PRICE_RE = /\d+억(?:\s[\d,]+)?|[\d,]+만/;

function StyledLine({ line, section }: { line: string; section: Section }) {
  const trimmed = line.trimStart();
  if (!trimmed) return <div className="h-1" />;

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
  // 카드 헤더가 제목·날짜를 보여주므로 "[아파트 …]" 첫 줄은 카드 본문에서 생략한다.
  const lines = text.split("\n").filter((l) => !l.trimStart().startsWith("[아파트"));
  let section: Section = null;
  return lines.map((line, i) => {
    if (line.includes("■ 신고가")) section = "high";
    else if (line.includes("■ 반등")) section = "rebound";
    return <StyledLine key={i} line={line} section={section} />;
  });
}

type Toast = { kind: "ok" | "err"; msg: string } | null;

export default function DigestClient({
  text,
  date,
}: {
  text: string;
  date: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function flash(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleCopyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareImage() {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      // 카드에 쓰인 글리프는 화면에 이미 렌더돼 폰트가 로드된 상태 → 안정적 캡처.
      await document.fonts.ready;
      // skipFonts: Pretendard 동적 서브셋(수백 개 @font-face) 임베드를 피해 캡처를
      // 빠르고 깨짐 없이. 이미지엔 OS 한글 폰트가 쓰여 글리프 누락(□)을 방지한다.
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: "#FAF7F0",
        cacheBust: true,
        skipFonts: true,
      });
      if (!blob) throw new Error("render failed");
      const file = new File([blob], `sise-${date || "digest"}.png`, { type: "image/png" });

      // 1) 모바일: 네이티브 공유 시트(카톡·SNS로 바로 전송, 저장 단계 없음)
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "시세 — 아파트 실거래 시그널",
          text: `아파트 실거래 시그널 ${date}`,
        });
        return; // 공유 시트가 떴으면 토스트는 생략
      }

      // 2) 데스크톱: 클립보드에 이미지 복사(카톡 PC에서 Ctrl+V)
      if (navigator.clipboard && typeof window.ClipboardItem === "function") {
        await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
        flash({ kind: "ok", msg: "이미지 복사됨 — 붙여넣기 하세요" });
        return;
      }

      // 3) 폴백: 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      flash({ kind: "ok", msg: "이미지 저장됨" });
    } catch (e) {
      // 사용자가 공유 시트를 닫으면 AbortError → 무시
      if ((e as Error).name !== "AbortError") {
        flash({ kind: "err", msg: "이미지 생성 실패" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-lg font-semibold">다이제스트</h2>
        {date && <span className="text-sm text-[var(--ink-soft)]">{date}</span>}
      </div>
      <p className="text-xs text-[var(--ink-soft)] mb-3">
        카톡·단톡방에 <b>이미지로 공유</b>하면 색·정렬이 그대로 보입니다. 텍스트 복붙도 가능합니다.
      </p>

      {/* 공유 카드 (이 영역 그대로 PNG로 캡처) */}
      <div
        ref={cardRef}
        className="bg-[var(--paper)] border border-[var(--line)] rounded-lg px-5 py-4 max-w-md"
      >
        <div className="flex items-end justify-between border-b-2 border-double border-[var(--line-strong)] pb-2 mb-3">
          <div>
            <div
              className="text-2xl font-bold leading-none tracking-tight"
              style={{ fontFamily: "var(--font-gowun), serif" }}
            >
              시세
            </div>
            <div className="text-[10px] text-[var(--ink-soft)] tracking-widest uppercase mt-1">
              아파트 매매 실거래 시그널
            </div>
          </div>
          {date && (
            <div className="text-xs text-[var(--ink-soft)] tabular-nums">{date}</div>
          )}
        </div>
        <div className="leading-relaxed">{renderDigest(text)}</div>
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleShareImage}
          disabled={busy}
          className="bg-[var(--ink)] text-[var(--paper)] text-sm px-4 py-2 rounded font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "이미지로 공유"}
        </button>
        <button
          onClick={handleCopyText}
          className="border border-[var(--line-strong)] text-sm px-4 py-2 rounded hover:bg-[var(--paper-2)] transition-colors"
        >
          {copied ? "복사됨 ✓" : "텍스트 복사"}
        </button>
        {toast && (
          <span
            className={`text-xs ${toast.kind === "ok" ? "text-[var(--ink-soft)]" : "text-red-600"}`}
          >
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  );
}
