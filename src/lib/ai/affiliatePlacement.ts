// 記事内でのアフィリエイトリンク(目印文字列)の配置回数と、AIが入れ忘れた分の補完。
//
// AIにプロンプトで「N回入れて」と指示しても、入れ忘れや回数の不足は起こる。指示だけに頼らず、
// 生成後に目印文字列の数を数え、足りない分だけ、読者の流れを邪魔しにくい「セクションの切れ目」へ機械的に補う。
// 補う位置は、H2見出しの直前(=前のセクションが終わったところ)。1回目は前半(最初のセクションを読み終えたあと)、
// 最後は「まとめ」の直前、3回のときは中盤、という並びで、同じ切れ目に複数の目印を置かない。

/**
 * 配置の単位(セット1つ・単体リンク1本)ごとに、記事内へ入れる回数。
 * 単位が1つだけで、記事が長い(目標5000文字以上)ときは3回(前半・中盤・まとめの前)、それ以外は2回(前半・まとめの前)。
 * 単位が多いときに、広告だらけになって読みにくくならないよう、2回にとどめる。
 */
export function placementsPerUnit(wordCount: number, unitCount: number): number {
  return unitCount <= 1 && wordCount >= 5000 ? 3 : 2;
}

/** 目印文字列の出現回数。 */
function countOccurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

/** コードフェンスの外にある、H2見出し(##)の行番号。 */
function findH2Lines(lines: string[]): number[] {
  const result: number[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^##[ \t]+\S/.test(line)) result.push(index);
  });
  return result;
}

/**
 * 切れ目(slot)の番号は、k番目のH2の直前を k とする(k=0 は導入の終わり)。1回目は 1(最初のセクションのあと)、
 * 最後は H-1(最後のH2=「まとめ」の直前)、3回なら中間をその間に置く。
 */
function idealSlots(placements: number, h2Count: number): number[] {
  const last = h2Count - 1;
  if (placements <= 1 || last <= 1) return [last];
  const slots = new Set<number>();
  for (let j = 0; j < placements; j++) slots.add(Math.round(1 + (j * (last - 1)) / (placements - 1)));
  return [...slots].sort((a, b) => a - b);
}

/**
 * 各目印文字列が perUnit 回に満たないとき、足りない分を補う。既にある分や、AIが決めた位置は動かさない。
 * 補う場所が無い(H2が少なすぎる)場合は、1回も無い目印だけを記事の末尾に足す。
 */
export function ensureAffiliatePlacements(markdown: string, tokens: string[], perUnit: number): string {
  if (tokens.length === 0) return markdown;

  const lines = markdown.split("\n");
  const h2Lines = findH2Lines(lines);
  const h2Count = h2Lines.length;

  // 切れ目 k に含まれる行の範囲: [前のH2の次の行, k番目のH2の手前]
  const slotOf = (lineIndex: number) => {
    const next = h2Lines.findIndex((h) => h > lineIndex);
    return next === -1 ? h2Count : next;
  };

  const occupiedBy = new Map<number, Set<string>>();
  const mark = (slot: number, token: string) => {
    const set = occupiedBy.get(slot) ?? new Set<string>();
    set.add(token);
    occupiedBy.set(slot, set);
  };
  lines.forEach((line, index) => {
    for (const token of tokens) if (line.includes(token)) mark(slotOf(index), token);
  });

  // 候補にする切れ目は 1 〜 H-1(最初のセクションのあと 〜 まとめの直前)。
  const candidates: number[] = [];
  for (let k = 1; k < h2Count; k++) candidates.push(k);

  const nearestFree = (target: number): number | null => {
    const free = candidates.filter((slot) => !occupiedBy.has(slot));
    if (free.length === 0) return null;
    return free.reduce((best, slot) => (Math.abs(slot - target) < Math.abs(best - target) ? slot : best));
  };

  const insertions = new Map<number, string>();
  const tail: string[] = [];

  for (const token of tokens) {
    let missing = perUnit - countOccurrences(markdown, token);
    if (missing <= 0) continue;

    if (candidates.length === 0) {
      if (countOccurrences(markdown, token) === 0) tail.push(token);
      continue;
    }

    // まとめの直前 → 最初のセクションのあと → 中盤、の順に優先して補う
    const ideals = idealSlots(perUnit, h2Count);
    const wantOrder = [ideals[ideals.length - 1], ...ideals.slice(0, -1)];
    for (const target of wantOrder) {
      if (missing <= 0) break;
      if (occupiedBy.get(target)?.has(token)) continue; // このリンク自身が、既にその切れ目にある
      const slot = nearestFree(target);
      if (slot === null) break;
      insertions.set(slot, token);
      mark(slot, token);
      missing--;
    }
  }

  // 後ろの行から挿入すると、手前の行番号がずれない
  const result = [...lines];
  for (const [slot, token] of [...insertions.entries()].sort((a, b) => b[0] - a[0])) {
    const at = h2Lines[slot];
    const needsBlankBefore = at > 0 && result[at - 1].trim() !== "";
    result.splice(at, 0, ...(needsBlankBefore ? [""] : []), token, "");
  }

  const text = result.join("\n");
  return tail.length > 0 ? `${text.trimEnd()}\n\n${tail.join("\n\n")}\n` : text;
}
