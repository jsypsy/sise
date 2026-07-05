export type Tx = {
  id: number;
  apt_nm: string;
  apt_seq: string | null;
  sgg_cd: string;
  umd_nm: string | null;
  jibun: string | null;
  area: number;
  pyeong: number;
  price: number;
  deal_date: string;
  first_seen: string;       // 등록일(우리 수집에 처음 나타난 날, KST)
  floor: number | null;
  build_year: number | null;
  dealing_gbn: string;
  canceled: boolean;
  cdeal_day: string | null;
  road_nm: string | null;
  trade_type: string;       // '매매' | '분양권' | '입주권'
  apt_dong: string | null;  // 거래동(등기완료분에만 채워짐, 대부분 null)
};

export type Signal = Tx & {
  prev_peak: number | null;
  prev_price: number | null;
  recovery_rate: number | null;
  delta_pct: number | null;
  is_high: boolean;
  is_rebound: boolean;
};
