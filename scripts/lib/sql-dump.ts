/**
 * mysqldump形式のSQLファイルから特定テーブルのINSERT文だけを安全にパースするための
 * 最小限のパーサー。フルの SQL パーサーは不要なため、この移行スクリプトで実際に
 * 使う「INSERT INTO `table` (`col`, ...) VALUES (...), (...), ...;」の構文にのみ対応する。
 *
 * 本文HTMLにカンマ・改行・引用符・括弧が大量に含まれるため、単純な正規表現分割は
 * 崩れる(実際に確認済み)。バックスラッシュエスケープを踏まえて1文字ずつ読み進める。
 */

export type SqlValue = string | number | boolean | null;
export type SqlRow = Record<string, SqlValue>;

const ESCAPE_MAP: Record<string, string> = {
  "0": "\0",
  "'": "'",
  '"': '"',
  b: "\b",
  n: "\n",
  r: "\r",
  t: "\t",
  Z: "\x1a",
  "\\": "\\",
  "%": "%",
  _: "_",
};

function skipWhitespace(sql: string, i: number): number {
  while (i < sql.length && /\s/.test(sql[i])) i++;
  return i;
}

function parseSqlLiteral(sql: string, i: number): { value: SqlValue; nextIndex: number } {
  const c = sql[i];

  if (c === "'") {
    let result = "";
    i++;
    while (true) {
      const ch = sql[i];
      if (ch === undefined) throw new Error("Unterminated string literal in SQL dump");
      if (ch === "\\") {
        const next = sql[i + 1];
        result += ESCAPE_MAP[next] ?? next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          result += "'";
          i += 2;
          continue;
        }
        i++;
        break;
      }
      result += ch;
      i++;
    }
    return { value: result, nextIndex: i };
  }

  if (sql.startsWith("NULL", i) && !/[A-Za-z0-9_]/.test(sql[i + 4] ?? "")) {
    return { value: null, nextIndex: i + 4 };
  }

  if (c === "b" && sql[i + 1] === "'") {
    const end = sql.indexOf("'", i + 2);
    const bits = sql.slice(i + 2, end);
    return { value: bits === "1", nextIndex: end + 1 };
  }

  let j = i;
  if (sql[j] === "-") j++;
  while (/[0-9.eE+-]/.test(sql[j] ?? "")) j++;
  const numStr = sql.slice(i, j);
  if (numStr === "" || Number.isNaN(Number(numStr))) {
    throw new Error(`Unrecognized SQL literal at index ${i}: ${JSON.stringify(sql.slice(i, i + 30))}`);
  }
  return { value: Number(numStr), nextIndex: j };
}

function parseParenList(
  sql: string,
  openParenIndex: number,
  columnsMode: boolean
): { values: SqlValue[]; nextIndex: number } {
  let i = openParenIndex + 1;
  const values: SqlValue[] = [];
  while (true) {
    i = skipWhitespace(sql, i);
    if (sql[i] === ")") {
      i++;
      break;
    }
    if (columnsMode) {
      if (sql[i] !== "`") throw new Error(`Expected backtick at ${i}`);
      const end = sql.indexOf("`", i + 1);
      values.push(sql.slice(i + 1, end));
      i = end + 1;
    } else {
      const parsed = parseSqlLiteral(sql, i);
      values.push(parsed.value);
      i = parsed.nextIndex;
    }
    i = skipWhitespace(sql, i);
    if (sql[i] === ",") {
      i++;
      continue;
    }
    if (sql[i] === ")") {
      i++;
      break;
    }
    throw new Error(`Unexpected character while parsing list at ${i}: ${JSON.stringify(sql[i])}`);
  }
  return { values, nextIndex: i };
}

/** SQLダンプ全体から `table` へのINSERT文をすべて抽出し、行オブジェクトの配列にする。 */
export function extractTableRows(sql: string, table: string): SqlRow[] {
  const rows: SqlRow[] = [];
  const prefix = `INSERT INTO \`${table}\` (`;
  let searchFrom = 0;
  let columns: string[] | null = null;

  while (true) {
    const start = sql.indexOf(prefix, searchFrom);
    if (start === -1) break;

    const colsParen = start + prefix.length - 1;
    const colsResult = parseParenList(sql, colsParen, true);
    if (!columns) columns = colsResult.values as string[];

    let i = sql.indexOf("VALUES", colsResult.nextIndex);
    i += "VALUES".length;

    while (true) {
      i = skipWhitespace(sql, i);
      if (sql[i] === ",") {
        i++;
        continue;
      }
      if (sql[i] === ";") {
        i++;
        break;
      }
      if (sql[i] !== "(") {
        throw new Error(`Unexpected character while scanning VALUES for ${table} at ${i}: ${JSON.stringify(sql.slice(i, i + 20))}`);
      }
      const tuple = parseParenList(sql, i, false);
      const row: SqlRow = {};
      columns!.forEach((col, idx) => {
        row[col] = tuple.values[idx];
      });
      rows.push(row);
      i = tuple.nextIndex;
    }

    searchFrom = i;
  }

  return rows;
}
