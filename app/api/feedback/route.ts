import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 의견 접수: anon INSERT(RLS 정책 허용) + 선택적 알림(서버 env가 있을 때만).
export async function POST(req: NextRequest) {
  let body: { message?: unknown; contact?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  const contact = String(body.contact ?? "").trim().slice(0, 200) || null;
  const path = String(body.path ?? "").slice(0, 300) || null;

  if (message.length < 5) {
    return NextResponse.json({ error: "5자 이상 입력해 주세요." }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "내용이 너무 깁니다." }, { status: 400 });
  }

  const user_agent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const { error } = await supabase.from("feedback").insert({ message, contact, path, user_agent });
  if (error) {
    return NextResponse.json({ error: "접수에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  // 알림 — FEEDBACK_WEBHOOK_URL(디스코드/슬랙 호환)이 설정된 경우에만. 실패해도 접수는 성공 처리.
  const hook = process.env.FEEDBACK_WEBHOOK_URL;
  if (hook) {
    const text = `📝 [시세 피드백]\n${message}${contact ? `\n— 회신: ${contact}` : ""}${path ? `\n(${path})` : ""}`;
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, text }), // Discord=content, Slack=text
      });
    } catch {
      /* 알림 실패는 무시 */
    }
  }

  return NextResponse.json({ ok: true });
}
