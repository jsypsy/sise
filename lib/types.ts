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
  floor: number | null;
  build_year: number | null;
  dealing_gbn: string;
  canceled: boolean;
  cdeal_day: string | null;
  road_nm: string | null;
};

export type Signal = Tx & {
  prev_peak: number | null;
  prev_price: number | null;
  recovery_rate: number | null;
  delta_pct: number | null;
  is_high: boolean;
  is_rebound: boolean;
};
