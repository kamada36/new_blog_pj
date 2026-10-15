// 日本時間(JST, UTC+9。夏時間なし)での日付の計算。
//
// 本番(Netlify)のサーバーは UTC で動くため、Date の getFullYear() / getDate() / new Date(y, m, d) は、
// 日本時間の 0〜9 時に「前日・前月」の値になる。サイトの日付の表示・日別の集計・月別アーカイブの境界は、
// 旧サイト(WordPress)と同じく日本時間で扱うため、サーバー(UTC)でもブラウザでも同じ結果になる、このファイルの関数を使う。
// サーバー・クライアントの両方から使うため、Node固有APIには依存しない。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type JstParts = {
  year: number;
  /** 1〜12 */
  month: number;
  day: number;
  /** 0=日曜 〜 6=土曜 */
  weekday: number;
  hour: number;
  minute: number;
};

/** 日時を、日本時間の年・月・日・曜日・時・分に分解する。 */
export function jstParts(date: Date): JstParts {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 日本時間の「その日の 0:00」の時刻(実際の瞬間)。 */
export function startOfJstDay(date: Date = new Date()): Date {
  const { year, month, day } = jstParts(date);
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
}

/** 日本時間の「その週の月曜 0:00」の時刻。 */
export function startOfJstWeek(date: Date = new Date()): Date {
  const { year, month, day, weekday } = jstParts(date);
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(Date.UTC(year, month - 1, day - daysSinceMonday) - JST_OFFSET_MS);
}

/** 日本時間の「その月の 1 日 0:00」の時刻。 */
export function startOfJstMonth(date: Date = new Date()): Date {
  const { year, month } = jstParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS);
}

/** 日本時間の年月の範囲 [from, to)。月別アーカイブの絞り込みに使う(month は 1〜12)。 */
export function jstMonthRange(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - JST_OFFSET_MS),
    to: new Date(Date.UTC(year, month, 1) - JST_OFFSET_MS),
  };
}
