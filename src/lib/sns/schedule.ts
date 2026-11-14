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

// ─── 投稿時刻の決定 ───────────────────────────────────────────────────────

const LAST_MINUTE_OF_DAY = 23 * 60 + 59;
/** 他の投稿の時刻から、できるだけこの分数は離す(離せないときは、同じ分にだけならないようにする) */
const PREFERRED_SPACING_MINUTES = 10;
const MAX_TRIES = 30;

export interface TimeTarget {
  id: string;
  date: string;
  slot: number;
}

export interface PickedTimes {
  id: string;
  /** メイン投稿の時刻(HH:mm) */
  time: string;
  /** 返信(ツリー)の時刻(HH:mm)。メインの数分後で、必ず同じ日に収まる */
  replyTime: string;
}

/**
 * 日付・時間枠の決まった投稿に、メインと返信の時刻を決める。
 *   - メインは、時間枠の範囲内でランダム(スパム判定を避けるため、毎日同じ時刻にしない)。
 *   - 返信は、メインの delay.min〜delay.max 分後。日をまたがないよう、メインの上限は「23:59 − 最大の間隔」までにする。
 *   - 同じ日の他の投稿(usedByDate。分で表した時刻)と、同じ分にならないようにする。
 *     できる範囲で PREFERRED_SPACING_MINUTES 分は離す。
 * 時間枠の番号に対応する枠が無い投稿は、結果に含めない。
 */
export function pickTimes(params: {
  targets: TimeTarget[];
  frames: { start: string; end: string }[];
  usedByDate: Map<string, number[]>;
  delay: { min: number; max: number };
  random?: () => number;
}): PickedTimes[] {
  const { targets, frames, delay } = params;
  const random = params.random ?? Math.random;
  const used = new Map<string, number[]>([...params.usedByDate].map(([date, list]) => [date, [...list]]));
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

  const result: PickedTimes[] = [];
  for (const target of targets) {
    const frame = frames[target.slot - 1];
    if (!frame) continue;
    const low = toMinutes(frame.start);
    const high = Math.max(low, Math.min(toMinutes(frame.end), LAST_MINUTE_OF_DAY - delay.max));
    const dayUsed = used.get(target.date) ?? [];

    let main = between(low, high);
    let reply = main + between(delay.min, delay.max);
    for (const spacing of [PREFERRED_SPACING_MINUTES, 1]) {
      let found = false;
      for (let i = 0; i < MAX_TRIES; i++) {
        const m = between(low, high);
        const r = m + between(delay.min, delay.max);
        if (dayUsed.every((u) => Math.abs(u - m) >= spacing && Math.abs(u - r) >= spacing)) {
          main = m;
          reply = r;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    used.set(target.date, [...dayUsed, main, reply]);
    result.push({ id: target.id, time: toTime(main), replyTime: toTime(reply) });
  }
  return result;
}
