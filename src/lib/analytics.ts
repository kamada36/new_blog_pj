import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

// クローラー/リンクプレビューボット等を除外するための簡易判定。
// 完全な検出は不可能だが、主要な検索エンジン・SNS・AIクローラー・
// コマンドラインツールのUser-Agentはこれでほぼカバーできる。
const BOT_UA_PATTERN =
  /bot|spider|crawl(er)?|slurp|facebookexternalhit|whatsapp|telegram|pinterest|vkshare|discord|okhttp|curl\/|wget\/|python-requests|go-http-client|libwww-perl|headlesschrome|phantomjs|mediapartners-google|apis-google|ia_archiver|validator/i;

function getClientIp(headerList: Awaited<ReturnType<typeof headers>>): string {
  // ホスティング先ごとに、クライアントによる偽装ができない「一番信頼できるヘッダー」を優先する。
  // - Vercel: x-vercel-forwarded-for はVercelのエッジが必ず上書きする値で、手前に別のプロキシ
  //   (Cloudflare等)を置いても改ざんされない。x-forwarded-for もVercelが上書きするため
  //   外部からの偽装は基本的にできない(公式ドキュメントより)。
  // - Netlify: x-nf-client-connection-ip がNetlify Functionsの保証する実クライアントIP。
  // - それ以外(自前のnginx等): x-forwarded-for は手前のプロキシが値を後ろに追記していく形式
  //   のため、先頭(左端)はクライアントが自由に偽装できる。信頼できるのは自分のプロキシが
  //   最後に追記した値(右端)、もしくはプロキシが設定するx-real-ipのみ。
  const vercelIp = headerList.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0]?.trim() ?? "";

  const netlifyIp = headerList.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;

  const realIp = headerList.get("x-real-ip");
  if (realIp) return realIp;

  const forwardedFor = headerList.get("x-forwarded-for");
  const lastForwardedIp = forwardedFor
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  return lastForwardedIp ?? "";
}

export async function getViewRequestContext() {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") ?? "";
  const ip = getClientIp(headerList);

  const isBot = userAgent === "" || BOT_UA_PATTERN.test(userAgent);

  // 生のIPは保存せず、UAと合わせて一方向ハッシュ化した「訪問者識別子」だけを使う。
  const salt = process.env.AUTH_SECRET ?? "";
  const visitorHash = createHash("sha256").update(`${ip}|${userAgent}|${salt}`).digest("hex");

  return { isBot, visitorHash };
}
