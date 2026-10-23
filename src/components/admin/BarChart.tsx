import { jstParts } from "@/lib/jst";

// 日別の棒グラフ(サーバー側で描画する、依存ライブラリなしのCSSだけの実装)。
// 棒の上にカーソルを置く(スマホではタップ)と、日付と数値が出る。左端が一番古い日、右端が今日。
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-16" → "10/16(金)" */
export function formatDayKey(key: string, withWeekday = true): string {
  const [, m, d] = key.split("-");
  const base = `${Number(m)}/${Number(d)}`;
  if (!withWeekday) return base;
  const weekday = jstParts(new Date(`${key}T12:00:00+09:00`)).weekday;
  return `${base}(${WEEKDAYS[weekday]})`;
}

export function BarChart({ data, height = 140 }: { data: { key: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const mid = data[Math.floor(data.length / 2)];
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] text-foreground-muted">
        <span>最大 {max.toLocaleString()} / 日</span>
        <span>期間の合計 {total.toLocaleString()}</span>
      </div>
      <div className="flex items-end gap-[3px] border-b border-border" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={d.key}
            title={`${formatDayKey(d.key)}: ${d.value.toLocaleString()}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-t ${i === data.length - 1 ? "bg-accent-dark" : "bg-accent"}`}
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-foreground-muted">
        <span>{formatDayKey(data[0].key, false)}</span>
        <span>{mid ? formatDayKey(mid.key, false) : ""}</span>
        <span>{formatDayKey(data[data.length - 1].key, false)}(今日)</span>
      </div>
    </div>
  );
}
