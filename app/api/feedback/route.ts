import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";

const URL_RE = /https?:\/\//gi;

export async function POST(req: NextRequest) {
  let body: { message?: unknown; contact?: unknown; path?: unknown; hp?: unknown; elapsed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // 1) 허니팟: 값이 차 있으면 봇 → 조용히 성공 처리(저장 안 함)
  if (String(body.hp ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  // 2) 너무 빠른 제출(자동화) 차단 — 페이지 로드 후 2초 미만
  const elapsed = Number(body.elapsed);
  if (Number.isFinite(elapsed) && elapsed < 2000) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const message = String(body.message ?? "").trim();
  const contact = String(body.contact ?? "").trim().slice(0, 200) || null;
  const path = String(body.path ?? "").slice(0, 300) || null;

  if (message.length < 5) return NextResponse.json({ error: "5자 이상 입력해 주세요." }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: "내용이 너무 깁니다." }, { status: 400 });

  // 3) 링크 도배 차단
  if ((message.match(URL_RE) || []).length >= 4) {
    return NextResponse.json({ error: "링크가 너무 많습니다." }, { status: 400 });
  }

  const user_agent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);

  const { error } = await supabase.from("feedback").insert({ message, contact, path, user_agent, ip_hash });
  if (error) {
    // DB 트리거가 비율 제한으로 막은 경우
    if (typeof error.message === "string" && error.message.includes("rate_limited")) {
      return NextResponse.json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    }
    console.error("[feedback] insert 실패:", error.message);
    return NextResponse.json({ error: "접수에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  await notify(message, contact, path);
  return NextResponse.json({ ok: true });
}

// 알림 — 각 채널은 해당 env가 있을 때만 동작(없으면 그냥 DB에만 적재).
async function notify(message: string, contact: string | null, path: string | null) {
  const text = `📝 시세 새 피드백\n\n${message}${contact ? `\n\n— 회신: ${contact}` : ""}${path ? `\n(${path})` : ""}`;

  // 이메일(Resend)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const to = process.env.FEEDBACK_EMAIL_TO ?? "jsypsy@gmail.com";
    const from = process.env.FEEDBACK_EMAIL_FROM ?? "시세 피드백 <onboarding@resend.dev>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject: "[시세] 새 피드백", text }),
      });
      if (!res.ok) {
        console.error("[feedback] Resend 발송 실패:", res.status, await res.text());
      }
    } catch (e) {
      console.error("[feedback] Resend 예외:", e);
    }
  }

  // 웹훅(디스코드/슬랙 호환)
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, text }),
      });
    } catch {
      /* 무시 */
    }
  }
}
