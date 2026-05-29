export const revalidate = 86400;

import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";
import TodayClient from "./today-client";

async function fetchTodayData(): Promise<{
  date: string;
  signals: Signal[];
  availableDates: string[];
}> {
  const { data: dateRow } = await supabase
    .from("signals_mv")
    .select("deal_date")
    .order("deal_date", { ascending: false })
    .limit(1)
    .single();

  if (!dateRow) return { date: "", signals: [], availableDates: [] };

  const [{ data: signals }, { data: dates }] = await Promise.all([
    supabase
      .from("signals_mv")
      .select("*")
      .eq("deal_date", dateRow.deal_date)
      .order("price", { ascending: false }),
    supabase.rpc("get_deal_dates", { lmt: 90 }),
  ]);

  const availableDates = (dates ?? []).map((d) => d as string);

  return {
    date: dateRow.deal_date as string,
    signals: (signals as Signal[]) ?? [],
    availableDates,
  };
}

export default async function TodayPage() {
  const { date, signals, availableDates } = await fetchTodayData();
  return (
    <Suspense>
      <TodayClient date={date} signals={signals} availableDates={availableDates} />
    </Suspense>
  );
}
