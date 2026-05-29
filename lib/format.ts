// 만원 단위 → "12억 3,400" / "12억" / "3,400만"
export function won(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rest = manwon % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString()}`;
  if (eok > 0) return `${eok}억`;
  return `${rest.toLocaleString()}만`;
}
