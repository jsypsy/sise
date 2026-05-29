import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 공개 읽기용 (브라우저/서버 모두 사용 가능)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 서버/GitHub Actions 전용 — 클라이언트 번들에 절대 포함되지 않도록 할 것
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}
