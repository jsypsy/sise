import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date 파라미터 필요 (YYYY-MM-DD)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("signals_v")
    .select("*")
    .eq("deal_date", date)
    .order("price", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data as Signal[], {
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
