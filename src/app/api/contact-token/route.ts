import { issueContactToken } from "@/lib/contactGuard";

// お問い合わせフォームの送信用トークンを発行する。フォームを開いたブラウザが、表示後に1回取得して、送信時に添える。
// 公開ページ(CDNにキャッシュされる)に埋め込むと、発行時刻が固定されてしまうため、毎回ここで発行する(キャッシュさせない)。
// 検証は src/lib/contactGuard.ts(submitContact から呼ばれる)。
export async function GET() {
  return Response.json({ token: issueContactToken() }, { headers: { "Cache-Control": "no-store" } });
}
