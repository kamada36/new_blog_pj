// 各ジョブ(outline / article / rewrite)の処理に渡す共通の入れ物。
export interface JobContext<E> {
  /** ジョブを開始した管理者のID */
  userId: string;
  /** 画面へ届けるイベントを送る(DBに書かれ、画面が定期的に読み取る) */
  send: (event: E) => void;
  /** 取り消されたときに中断する */
  signal: AbortSignal;
  /** ジョブの開始時刻(継続生成の打ち切り判定に使う) */
  startedAt: number;
}
