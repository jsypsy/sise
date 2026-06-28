// JSON-LD를 <script>에 박을 때 컨텍스트 탈출(</script> 등)을 막는 안전 직렬화.
// <, >, & 를 유니코드 이스케이프해 스크립트 종료/주입을 원천 차단한다.
export function jsonLdString(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
