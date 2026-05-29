export const revalidate = 86400;

import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import TodayClient from "./today-client";

async function fetchTodaySignals(): Promise<{ date: string; signals: Signal[] }> {
  const { data: dateRow } = await supabase
    .from("signals_v")
    .select("deal_date")
    .order("deal_date", { ascending: false })
    .limit(1)
    .single();

  if (!dateRow) return { date: "", signals: [] };

  const { data } = await supabase
    .from("signals_v")
    .select("*")
    .eq("deal_date", dateRow.deal_date)
    .order("price", { ascending: false });

  return {
    date: dateRow.deal_date as string,
    signals: (data as Signal[]) ?? [],
  };
}

export default async function TodayPage() {
  const { date, signals } = await fetchTodaySignals();
  return (
    <Suspense>
      <TodayClient date={date} signals={signals} />
    </Suspense>
  );
}
