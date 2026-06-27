# 환경변수 레퍼런스

이 프로젝트가 쓰는 **모든 키**, 어디에 넣는지, 값은 **어디서 가져오는지**.
시크릿 **값은 git에 절대 올리지 않는다** — 여기엔 "출처"만 적는다.

## 핵심 원칙 (왜 값을 다시 못 보나)
- 비밀키는 "한 곳에 저장해두고 꺼내 보는 것"이 아니다. **각 발급처(provider)가 원천**이고,
  Vercel·Cloudflare·GitHub의 env 칸은 **주입 지점일 뿐 write-only(다시 못 읽음)**.
- 이유: 대시보드 세션 탈취·화면공유·읽기권한 협업자가 시크릿을 빼가지 못하게.
- 그래서 **Vercel에서 값이 안 보이는 건 정상.** 값이 필요하면 **발급처로 가서 복사하거나 재발급**한다.
  (자체 생성 시크릿은 그냥 새로 만들고 쓰는 곳 전부 교체.)

## 어디에 무엇을 (저장소 3곳)
| 저장소 | 무엇이 들어가나 |
|---|---|
| **Cloudflare Worker**(웹앱, 이전 후) / **Vercel**(현재) | `NEXT_PUBLIC_*` (빌드 변수) + 런타임 시크릿(`REVALIDATE_SECRET`, 피드백용) |
| **GitHub Actions secrets**(수집/스크립트) | `SUPABASE_SERVICE_ROLE_KEY`, `MOLIT_SERVICE_KEY`, `R2_*` 4종, `REVALIDATE_SECRET` |
| **Supabase / Cloudflare R2 / data.go.kr / Resend** | 위 값들의 **원천(발급처)** |

> 웹앱(Cloudflare/Vercel)과 수집(GitHub Actions)은 **키가 분리**된다. 수집용 시크릿은
> **이미 GitHub Actions에 설정돼 있고**, Cloudflare로 옮길 필요 없다.

## 전체 키 표
| 키 | 비밀? | 쓰는 곳 | 저장 위치 | 값 출처(복사/재발급) |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | 웹앱(빌드) | CF/Vercel | Supabase → Project Settings → **Data API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | 웹앱(빌드) | CF/Vercel | Supabase → Project Settings → **API Keys → anon / public** |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | 공개 | 웹앱(빌드) | CF/Vercel | Cloudflare → **R2 → (데이터 버킷) → Settings → Public URL** (`pub-xxx.r2.dev`) |
| `NEXT_PUBLIC_SITE_URL` | – | 웹앱(빌드) | CF/Vercel | 고정값 `https://sise.today` |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | 공개 | 웹앱(빌드) | CF/Vercel | AdSense 퍼블리셔 ID `ca-pub-6975732944826121` |
| `REVALIDATE_SECRET` | 시크릿(자체) | `/api/revalidate`(런타임) + Actions가 호출 | CF(런타임) **+** GitHub Actions | 자체 생성. **양쪽 값 일치 필수.** 분실 시 새로 만들어 둘 다 교체 |
| `RESEND_API_KEY` | 시크릿 | 피드백 메일(런타임, 선택) | CF(런타임) | Resend → API Keys (재발급) |
| `FEEDBACK_EMAIL_TO` / `_FROM` / `FEEDBACK_WEBHOOK_URL` | – | 피드백(런타임, 선택) | CF(런타임) | 본인이 정함 |
| `SUPABASE_SERVICE_ROLE_KEY` | 시크릿 | ingest 쓰기 | **GitHub Actions만** | Supabase → Project Settings → **API Keys → service_role**(reveal) |
| `MOLIT_SERVICE_KEY` | 시크릿 | ingest API | **GitHub Actions만** | data.go.kr → 마이페이지 → **인증키(Decoding)** |
| `R2_ACCOUNT_ID` | 준공개 | 스크립트 | **GitHub Actions만** | Cloudflare → R2 우측 또는 계정 ID |
| `R2_ACCESS_KEY_ID` | 시크릿 | 스크립트 | **GitHub Actions만** | Cloudflare → R2 → **Manage R2 API Tokens** (재발급) |
| `R2_SECRET_ACCESS_KEY` | 시크릿 | 스크립트 | **GitHub Actions만** | 〃 (**생성 시 1회만 표시**, 분실 시 재발급) |
| `R2_BUCKET` | – | 스크립트 | **GitHub Actions만** | 데이터 버킷 이름 |

## Cloudflare 이전 시 — Worker에 넣을 것만
- **빌드 변수**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ADSENSE_CLIENT`
- **런타임 시크릿**: `REVALIDATE_SECRET` (+ 선택 `RESEND_API_KEY`, `FEEDBACK_*`)
- **넣지 말 것**: `SUPABASE_SERVICE_ROLE_KEY`, `MOLIT_SERVICE_KEY`, `R2_*` — 전부 수집(GitHub Actions) 전용. 웹앱이 안 씀.

## 빌드만 통과시키는 최소
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (없으면 `supabaseUrl is required`).
나머지는 없어도 빌드는 통과(코드가 graceful), 단 R2 URL 없으면 단지 데이터 안 뜸.
