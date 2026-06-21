// 관심단지 워치리스트 — 브라우저 localStorage 전용(계정·DB·서버 없음).
// 단지는 (sgg_cd, apt_nm)로 식별. 변경 시 'sise:watchlist' 이벤트로 같은 탭 내 동기화.

export type WatchItem = { sgg: string; apt: string };

const KEY = "sise:watchlist";
const EVENT = "sise:watchlist";

export function getWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WatchItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: WatchItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function isWatched(sgg: string, apt: string): boolean {
  return getWatchlist().some((i) => i.sgg === sgg && i.apt === apt);
}

// 토글 후 새 상태(담김=true)를 반환.
export function toggleWatch(sgg: string, apt: string): boolean {
  const items = getWatchlist();
  const idx = items.findIndex((i) => i.sgg === sgg && i.apt === apt);
  if (idx >= 0) {
    items.splice(idx, 1);
    save(items);
    return false;
  }
  items.push({ sgg, apt });
  save(items);
  return true;
}

export const WATCHLIST_EVENT = EVENT;
