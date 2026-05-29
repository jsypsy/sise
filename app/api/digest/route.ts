export const revalidate = 86400;

import { NextResponse } from "next/server";
import { buildDigestText } from "@/lib/digest";

export async function GET() {
  const { text, date } = await buildDigestText();
  return NextResponse.json({ text, date });
}
