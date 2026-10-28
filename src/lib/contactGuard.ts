import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/analytics";

// お問い合わせフォームのスパム対策(ハニーポットだけでは防げない、APIを直接叩くボット向け)。
//
// ハニーポット(bot-field)は「ブラウザ上のフォームを埋めるボット」にしか効かない。Server Action は、画面を経由せず
// HTTPのPOSTで直接呼べるため、bot-field を最初から送らない相手には、素通りされる。そこで、サーバー側で次の3つを必須にする。
//   1. 送信用トークン : フォームを開いたブラウザが /api/contact-token から取得し、送信時に添える。サーバーの秘密鍵で署名した
//      発行時刻つきの値で、偽造できない。発行から MIN_AGE_MS 経つ前の送信(人間には不可能な速さ)や、期限切れ・欠落は断る。
//      (公開ページはCDNにキャッシュされるため、トークンはページに埋め込まず、表示後に取得する。)
//   2. 送信元ごとの回数制限 : 同じIP(ハッシュ)からの送信は、短時間・1時間あたりの上限を超えたら断る。
//   3. 全体の回数制限 : IPを変えながらの連投に備え、サイト全体の1時間あたりの上限も設ける。
// 生のIPアドレスは保存せず、ハッシュだけを持つ。

const MIN_AGE_MS = 3 * 1000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const SHORT_WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP_SHORT = 3;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_IP_HOUR = 6;
const MAX_TOTAL_HOUR = 30;

export const CONTACT_TOKEN_ERROR_MESSAGE =
  "送信の確認ができませんでした。ページを再読み込みして、もう一度お試しください。";
export const CONTACT_TOO_FAST_MESSAGE = "送信が早すぎます。数秒おいて、もう一度お試しください。";
export const CONTACT_RATE_LIMITED_MESSAGE =
  "短時間にお問い合わせが集中したため、一時的に受け付けられません。時間をおいて、もう一度お試しください。";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

function sign(issuedAt: string): string {
  return createHmac("sha256", secret()).update(`contact-form|${issuedAt}`).digest("hex");
}

/** フォーム用の送信トークン(発行時刻 + 署名)を発行する。 */
export function issueContactToken(now = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt)}`;
}

export type ContactTokenResult = "ok" | "invalid" | "too-fast";

/** 送信トークンを検証する。署名の不一致・形式の誤り・期限切れは "invalid"、早すぎる送信は "too-fast"。 */
export function verifyContactToken(token: unknown, now = Date.now()): ContactTokenResult {
  if (typeof token !== "string" || token.length > 100) return "invalid";
  const [issuedAt, signature, ...rest] = token.split(".");
  if (!issuedAt || !signature || rest.length > 0 || !/^\d{10,16}$/.test(issuedAt)) return "invalid";

  const expected = Buffer.from(sign(issuedAt), "hex");
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return "invalid";

  const age = now - Number(issuedAt);
  if (age < 0 || age > MAX_AGE_MS) return "invalid";
  if (age < MIN_AGE_MS) return "too-fast";
  return "ok";
}

/** 現在のリクエストの送信元IPのハッシュ。 */
export async function getContactIpHash(): Promise<string> {
  const ip = getClientIp(await headers()) || "unknown";
  return createHash("sha256").update(`${ip}|contact|${secret()}`).digest("hex");
}

/** 回数制限に達しているか。達していたら true(送信を断る)。 */
export async function isContactRateLimited(ipHash: string): Promise<boolean> {
  const now = Date.now();
  const [shortCount, hourCount, totalCount] = await Promise.all([
    prisma.contactMessage.count({ where: { ipHash, createdAt: { gte: new Date(now - SHORT_WINDOW_MS) } } }),
    prisma.contactMessage.count({ where: { ipHash, createdAt: { gte: new Date(now - HOUR_MS) } } }),
    prisma.contactMessage.count({ where: { createdAt: { gte: new Date(now - HOUR_MS) } } }),
  ]);
  return shortCount >= MAX_PER_IP_SHORT || hourCount >= MAX_PER_IP_HOUR || totalCount >= MAX_TOTAL_HOUR;
}
