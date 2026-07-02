"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toBlob } from "html-to-image";
import type { Digest, DigestRow } from "@/lib/digest";
import { complexHref } from "@/lib/complex";

// 회복률 → [배경, 글자] 색. 신고가/상승=빨강 관습 유지, 회복 단계는 빨강→주황→노랑.
function rateColor(rate: number): [string, string] {
  if (rate >= 100) return ["var(--red-bg)", "var(--red)"];
  if (rate >= 99) return ["#FCE7D6", "#B45309"];
  if (rate >= 95) return ["#FBF1CC", "#92750F"];
  return ["var(--paper-2)", "var(--ink-soft)"];
}

function Chip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span
      className="text-[11px] font-semibold rounded px-1.5 py-0.5 leading-none whitespace-nowrap"
      style={{ background: bg, color: fg }}
    >
      {text}
    </span>
  );
}

function SectionHeader({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mt-3.5 mb-1.5">
      <span className="w-1 h-[18px] rounded-sm" style={{ background: color }} />
      <span className="text-[15px] font-bold" style={{ color }}>
        {label}
      </span>
      <span className="text-xs font-semibold text-[var(--ink-soft)]">{count}건</span>
    </div>
  );
}

function HighRow({ r, first }: { r: DigestRow; first: boolean }) {
  return (
    <div className={`flex items-center py-1.5 ${first ? "" : "border-t border-[var(--line)]"}`}>
      <div className="flex flex-col flex-1 min-w-0 pr-2">
        <Link
          href={complexHref(r.sgg_cd, r.name)}
          className="text-sm font-bold text-[var(--ink)] leading-tight truncate hover:underline"
        >{r.name}</Link>
        <span className="text-[11px] text-[var(--ink-soft)] mt-0.5">
          {r.loc} · {r.pyeong}평{r.tt && r.tt !== "매매" ? ` · ${r.tt}` : ""}
        </span>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="text-[15px] font-bold text-[var(--red)] leading-tight">{r.price}</span>
        {r.deltaEok != null && (
          <span className="text-[11px] font-semibold text-[var(--red)] mt-0.5">
            ▲ {r.deltaEok.toFixed(1)}억
          </span>
        )}
      </div>
    </div>
  );
}

function RebRow({ r, first }: { r: DigestRow; first: boolean }) {
  const [bg, fg] = r.recovery != null ? rateColor(r.recovery) : ["var(--paper-2)", "var(--ink-soft)"];
  return (
    <div className={`flex items-center py-1.5 ${first ? "" : "border-t border-[var(--line)]"}`}>
      <div className="flex flex-col flex-1 min-w-0 pr-2">
        <Link
          href={complexHref(r.sgg_cd, r.name)}
          className="text-sm font-bold text-[var(--ink)] leading-tight truncate hover:underline"
        >{r.name}</Link>
        <span className="text-[11px] text-[var(--ink-soft)] mt-0.5">
          {r.loc} · {r.pyeong}평{r.tt && r.tt !== "매매" ? ` · ${r.tt}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.recovery != null && <Chip text={`회복 ${r.recovery}%`} bg={bg} fg={fg} />}
        <span className="text-[15px] font-bold text-[var(--ink)] text-right w-[88px]">{r.price}</span>
      </div>
    </div>
  );
}

// 화면·이미지 공통 본문(요약칩 + 섹션 + 행). 크롬(마스트헤드/푸터/액자)은 바깥에서.
function DigestBody({ total, highs, rebs }: { total: number; highs: DigestRow[]; rebs: DigestRow[] }) {
  return (
    <>
      <div className="flex gap-1.5">
        <Chip text={`총 ${total}건`} bg="var(--paper-2)" fg="var(--ink-soft)" />
        <Chip text={`신고가 ${highs.length}`} bg="var(--red-bg)" fg="var(--red)" />
        <Chip text={`반등 ${rebs.length}`} bg="#E4ECF4" fg="var(--blue)" />
      </div>

      {highs.length > 0 && (
        <>
          <SectionHeader color="var(--red)" label="신고가" count={highs.length} />
          {highs.map((r, i) => (
            <HighRow key={`h${i}`} r={r} first={i === 0} />
          ))}
        </>
      )}

      {rebs.length > 0 && (
        <>
          <SectionHeader color="var(--blue)" label="반등 · 전고점 회복" count={rebs.length} />
          {rebs.map((r, i) => (
            <RebRow key={`r${i}`} r={r} first={i === 0} />
          ))}
        </>
      )}
    </>
  );
}

type Toast = { kind: "ok" | "err"; msg: string } | null;

export default function DigestClient({ digest }: { digest: Digest }) {
  const { date, total, highs, rebs, text } = digest;
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
      // 화면 밖 브랜딩 카드의 글리프도 렌더돼 폰트가 로드된 상태 → 안정적 캡처.
      await document.fonts.ready;
      // skipFonts: Pretendard 동적 서브셋(수백 개 @font-face) 임베드를 피해 캡처를
      // 빠르고 깨짐 없이. 이미지엔 OS 한글 폰트가 쓰여 글리프 누락(□)을 방지한다.
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: "#FFFFFF",
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

  if (total === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">다이제스트</h2>
        <p className="text-sm text-[var(--ink-soft)]">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      {/* 페이지: 사이트 헤더가 브랜드를 맡으므로 여긴 데이터만 자연스럽게 */}
      <div className="flex items-baseline gap-3 mb-1">
        <h2 className="text-lg font-semibold">다이제스트</h2>
        {date && <span className="text-sm text-[var(--ink-soft)] tabular-nums">{date}</span>}
      </div>
      <p className="text-xs text-[var(--ink-soft)] mb-3">
        최근 신고 등록 기준 신고가·반등 — 일·월요일은 전 영업일 데이터. <b>이미지로 공유</b>하면 색·정렬 그대로, 텍스트 복붙도 가능합니다.
      </p>

      <div className="flex items-center gap-2 mb-4">
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
          <span className={`text-xs ${toast.kind === "ok" ? "text-[var(--ink-soft)]" : "text-red-600"}`}>
            {toast.msg}
          </span>
        )}
      </div>

      <div className="max-w-2xl">
        <div className="flex gap-1.5 mb-0.5">
          <Chip text={`총 ${total}건`} bg="var(--paper-2)" fg="var(--ink-soft)" />
          <Chip text={`신고가 ${highs.length}`} bg="var(--red-bg)" fg="var(--red)" />
          <Chip text={`반등 ${rebs.length}`} bg="#E4ECF4" fg="var(--blue)" />
        </div>
        <div className="md:grid md:grid-cols-2 md:gap-x-10">
          {highs.length > 0 && (
            <div>
              <SectionHeader color="var(--red)" label="신고가" count={highs.length} />
              {highs.map((r, i) => <HighRow key={`h${i}`} r={r} first={i === 0} />)}
            </div>
          )}
          {rebs.length > 0 && (
            <div>
              <SectionHeader color="var(--blue)" label="반등 · 전고점 회복" count={rebs.length} />
              {rebs.map((r, i) => <RebRow key={`r${i}`} r={r} first={i === 0} />)}
            </div>
          )}
        </div>
      </div>

      {/* 공유 이미지용 카드 — 화면 밖에서만 렌더되어 캡처 대상이 된다(페이지엔 안 보임).
          이미지는 단독 배포되므로 마스트헤드·출처 푸터로 브랜딩한다. */}
      <div
        ref={cardRef}
        aria-hidden
        className="bg-[var(--paper)] px-5 py-5"
        style={{ position: "fixed", left: -10000, top: 0, width: 460, pointerEvents: "none" }}
      >
        <div className="flex items-end justify-between border-b-2 border-[var(--line-strong)] pb-2.5">
          <div className="flex flex-col">
            <span
              className="text-3xl font-bold leading-none tracking-tight"
              style={{ fontFamily: "var(--font-gowun), serif" }}
            >
              시세
            </span>
            <span className="text-[10px] font-semibold text-[var(--ink-soft)] tracking-[0.2em] uppercase mt-1.5">
              APT 실거래 시그널
            </span>
          </div>
          {date && <span className="text-[13px] font-semibold text-[var(--ink-soft)] tabular-nums">{date}</span>}
        </div>

        <div className="mt-3">
          <DigestBody total={total} highs={highs} rebs={rebs} />
        </div>

        <div className="flex items-center justify-between mt-3.5 pt-2 border-t border-[var(--line)]">
          <span className="text-[10px] text-[var(--ink-soft)]">
            국토부 실거래가 기반 · 직거래/취소 제외 · 정부 공식 아님
          </span>
          <span className="text-[10px] font-bold text-[var(--ink)]">sise</span>
        </div>
      </div>
    </div>
  );
}
