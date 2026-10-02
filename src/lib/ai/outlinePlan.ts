// 目標文字数から逆算して、H2/H3の個数を決める。
// 「固定でH2 5〜8個」のように文字数を無視した個数指定だと、目標が小さいときに構成だけで
// 目標を大幅に超えてしまうため、1H3あたり概ね450文字前後になるよう個数側を調整する。
// 構成案生成と本文執筆プロンプトの両方から参照されるため、独立したモジュールにしている。
export function computeOutlinePlan(wordCount: number): { h2Count: number; h3PerH2: number } {
  const totalH3 = Math.min(24, Math.max(6, Math.round(wordCount / 450)));
  const h2Count = Math.min(8, Math.max(3, Math.round(totalH3 / 2.5)));
  const h3PerH2 = Math.max(1, Math.round(totalH3 / h2Count));
  return { h2Count, h3PerH2 };
}
