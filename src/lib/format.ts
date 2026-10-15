import { jstParts } from "./jst";

// 日本時間(旧サイトと同じ)の年月日で表示する。サーバーはUTCのため、getFullYear()等を使うと、日本時間の0〜9時に前日になる。
export function formatDate(date: Date | string | null | undefined) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const { year, month, day } = jstParts(d);
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}
