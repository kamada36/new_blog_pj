// 承認済みの投稿に、投稿日と時間枠を割り当てる。DBには依存しない純粋な計算(日付は日本時間の yyyy-MM-dd 文字列)。
//
// 規則:
//   - 日付を順に、各日の「投稿位置」を前から埋める。位置 i(0始まり)の時間枠は (i % 枠の数) + 1。
//     例: 1日3投稿・3枠なら 1,2,3 / 1日5投稿・3枠なら 1,2,3,1,2(同じ枠に2件入る日がある)。
//   - 候補は渡された順(優先度の高い順)に採用する。ただし同じ記事の投稿は、前後 minGapDays 日以内には置かない。

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleCandidate {
  id: string;
  articleId: string;
}

export interface OccupiedSlot {
  date: string;
  slot: number;
  articleId: string;
}

export interface Assignment {
  id: string;
  date: string;
  slot: number;
}

function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date((dayNumber(dateKey) + days) * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function assignSlots(params: {
  /** 優先度の高い順 */
  candidates: ScheduleCandidate[];
  /** すでに日付・枠が決まっている投稿(重複と、同じ記事の間隔の判定に使う) */
  occupied: OccupiedSlot[];
  startDate: string;
  days: number;
  postsPerDay: number;
  slotCount: number;
  minGapDays: number;
}): Assignment[] {
  const { candidates, occupied, startDate, days, postsPerDay, slotCount, minGapDays } = params;

  const positions = Array.from({ length: postsPerDay }, (_, i) => (i % slotCount) + 1);
  const capacityBySlot = new Map<number, number>();
  for (const slot of positions) capacityBySlot.set(slot, (capacityBySlot.get(slot) ?? 0) + 1);

  const used = new Map<string, number>(); // `${date}#${slot}` → 件数
  const articleDays = new Map<string, number[]>();
  for (const o of occupied) {
    const key = `${o.date}#${o.slot}`;
    used.set(key, (used.get(key) ?? 0) + 1);
    articleDays.set(o.articleId, [...(articleDays.get(o.articleId) ?? []), dayNumber(o.date)]);
  }

  const remaining = [...candidates];
  const result: Assignment[] = [];
  const start = dayNumber(startDate);

  for (let offset = 0; offset < days && remaining.length > 0; offset++) {
    const date = addDaysToDateKey(startDate, offset);
    const today = start + offset;
    for (const slot of [...new Set(positions)]) {
      const capacity = capacityBySlot.get(slot) ?? 0;
      while ((used.get(`${date}#${slot}`) ?? 0) < capacity) {
        const index = remaining.findIndex((c) =>
          (articleDays.get(c.articleId) ?? []).every((d) => Math.abs(d - today) >= minGapDays)
        );
        if (index < 0) break;
        const [picked] = remaining.splice(index, 1);
        result.push({ id: picked.id, date, slot });
        used.set(`${date}#${slot}`, (used.get(`${date}#${slot}`) ?? 0) + 1);
        articleDays.set(picked.articleId, [...(articleDays.get(picked.articleId) ?? []), today]);
      }
    }
  }
  return result;
}
