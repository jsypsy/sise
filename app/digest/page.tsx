export const revalidate = 86400;

import { buildDigestText } from "@/lib/digest";
import DigestClient from "../digest-client";

export default async function DigestPage() {
  const { text, date } = await buildDigestText();
  return <DigestClient text={text} date={date} />;
}
