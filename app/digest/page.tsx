export const revalidate = 86400;

import { buildDigest } from "@/lib/digest";
import DigestClient from "../digest-client";

export default async function DigestPage() {
  const digest = await buildDigest();
  return <DigestClient digest={digest} />;
}
