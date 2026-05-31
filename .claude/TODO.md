# TODO (런칭/후속 과제)

> 이 파일은 git에 커밋되어 **모든 작업 PC에서 공유**된다. PC 바꿔가며 작업하므로 후속 과제는 여기에 기록.
> (Claude의 로컬 memory는 현재 PC에만 남으므로 정본은 이 파일.)

## 🚀 공개 런칭 전 필수

- [ ] **R2 DDoS / 과금폭탄 방어** — 공개 배포·카페 대량 배포 직전에 적용
  - 배경: 단지별 raw JSON이 Cloudflare R2 버킷 `sise`에 저장, 현재 **r2.dev 공개 URL**(`pub-bad2ec689072415f9b9c1fec760c3ed5.r2.dev`)로 서빙. R2는 종량제(읽기 $0.36/100만, **egress는 무료**)라, 외부 공격이 공개 URL을 두드리면 읽기 op 폭증으로 과금 가능.
  - 방어책:
    1. R2 버킷 `sise`에 **Cloudflare 커스텀 도메인 연결** → **r2.dev off**
    2. **엣지 캐시** + `Cache-Control` 길게(raw는 백필 때만 갱신) → 캐시 히트는 R2 읽기로 안 잡혀 **과금 0**, DDoS를 캐시가 흡수
    3. 무료 **WAF + Rate Limiting + Bot Fight Mode**
    4. 앱 `NEXT_PUBLIC_R2_PUBLIC_URL`을 커스텀 도메인으로 교체
  - ❌ "버킷 private + Next.js/Vercel 프록시"는 채택 금지 — 공격을 Vercel(대역폭·함수 한도, Hobby 비상업 전용, 무료 DDoS 방어 없음)로 떠넘겨 더 약함.
  - 전제: Cloudflare에 도메인 필요. 없으면 도메인 확보까지 r2.dev 유지(개발 단계엔 안전: 랜덤 URL + 트래픽 0 + CF 자체 rate-limit).

## 🔎 후속 (런칭 무관, 개선)

- [ ] **검색 범위 확대** — 현재 `/api/search`는 `transactions`(rolling 20일) 기반이라 최근 거래 없는 단지는 검색 불가. R2에 전 단지가 있으니 단지 인덱스(전체 apt_nm/sgg 목록)로 검색 확대 검토.
- [ ] **평형 매핑 정확화** — 현재 `round(area*0.40)` 추정. R2에 area 원본 보존되므로, 정확한 단지별 분양평형 매핑 도입 시 콜 0건으로 재집계 가능.
