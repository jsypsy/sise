import { supabase } from "./supabase";
import type { Signal } from "./types";
import { won } from "./format";
import { CODE_TO_NAME } from "./regions";

export async function buildDigestText(): Promise<{ text: string; date: string }> {
  // 다이제스트 = '오늘 신규 등록된' 시그널 → 계약일이 아니라 first_seen(등록일) 기준.
  const { data: dateRow } = await supabase
    .from("signals_mv")
    .select("first_seen")
    .order("first_seen", { ascending: false })
    .limit(1)
    .single();

  if (!dateRow) return { text: "데이터가 없습니다.", date: "" };

  const date = dateRow.first_seen as string;

  const { data } = await supabase
    .from("signals_mv")
    .select("*")
    .eq("first_seen", date)
    .eq("dealing_gbn", "중개거래")
    .order("price", { ascending: false });

  const signals = (data as Signal[]) ?? [];
  const highSignals = signals.filter((s) => s.is_high).slice(0, 15);
  const rebSignals = signals
    .filter((s) => s.is_rebound && !s.is_high)
    .sort((a, b) => (b.recovery_rate ?? 0) - (a.recovery_rate ?? 0))
    .slice(0, 15);

  const regions = [...new Set(signals.map((s) => CODE_TO_NAME[s.sgg_cd] ?? s.sgg_cd))];
  const regionStr = regions.slice(0, 3).join("·");

  let text = `[아파트 실거래 시그널] ${date} · ${regionStr}\n`;
  text += `총 ${signals.length}건 / 신고가 ${highSignals.length}건 / 반등 ${rebSignals.length}건\n`;

  if (highSignals.length > 0) {
    text += "\n■ 신고가 TOP\n";
    for (const s of highSignals) {
      text += `  ${s.apt_nm} ${s.pyeong}평 ${won(s.price)}`;
      if (s.prev_peak) text += ` (직전최고 ${won(s.prev_peak)})`;
      text += "\n";
    }
  }

  if (rebSignals.length > 0) {
    text += "\n■ 반등 (전고점 회복 진행)\n";
    for (const s of rebSignals) {
      text += `  ${s.apt_nm} ${s.pyeong}평 ${won(s.price)}`;
      if (s.recovery_rate != null) text += ` · 회복률 ${s.recovery_rate}%`;
      text += "\n";
    }
  }

  text += "\nⓘ 국토부 실거래가 기반 · 직거래/취소거래 제외";

  return { text, date };
}
