import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/analytics";

// 管理画面ログインの試行回数の制限。直近 WINDOW_MS(15分)の「失敗」の件数が、次のどれかに達したら、
// パスワードの照合をせずに、一時的にログインを断る。
//   - 同じIP + 同じメールアドレス : 5回   (本人の打ち間違いは、ここで止まる。他人には影響しない)
//   - 同じIP(メールアドレスを変えながらの総当たり): 20回
//   - 同じメールアドレス(IPを変えながらの総当たり): 50回
// 失敗が窓から外れる(15分たつ)と、自然に解除される。ログインに成功すると、そのメールアドレスの失敗は消える。
// 生のIPアドレスは保存せず、ハッシュだけを持つ。

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP_AND_EMAIL = 5;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 50;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export const LOGIN_BLOCKED_MESSAGE =
  "ログインの失敗が続いたため、一時的に制限しています。15分ほど待ってから、もう一度お試しください。";

// 存在しないメールアドレスでも、パスワードの照合(bcrypt)と同じ時間をかけるための、ダミーのハッシュ。
// (照合の有無による応答時間の差から、登録済みのメールアドレスを推測されないようにする。秘密の値ではない。)
export const DUMMY_PASSWORD_HASH = "$2b$10$VW.aBYdYaXSIZwgVLKgGCOD1r/ujOTKKJQp80s/fNSxskZoNGqUDq";

export type LoginIdentity = { ipHash: string; email: string };

/** 現在のリクエストの、IP(ハッシュ)と、正規化したメールアドレス。 */
export async function getLoginIdentity(email: string): Promise<LoginIdentity> {
  const ip = getClientIp(await headers()) || "unknown";
  const ipHash = createHash("sha256").update(`${ip}|${process.env.AUTH_SECRET ?? ""}`).digest("hex");
  return { ipHash, email: email.trim().toLowerCase() };
}

export async function isLoginBlocked({ ipHash, email }: LoginIdentity): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const [pair, byIp, byEmail] = await Promise.all([
    prisma.loginFailure.count({ where: { ipHash, email, createdAt: { gte: since } } }),
    prisma.loginFailure.count({ where: { ipHash, createdAt: { gte: since } } }),
    prisma.loginFailure.count({ where: { email, createdAt: { gte: since } } }),
  ]);
  return pair >= MAX_PER_IP_AND_EMAIL || byIp >= MAX_PER_IP || byEmail >= MAX_PER_EMAIL;
}

export async function recordLoginFailure({ ipHash, email }: LoginIdentity): Promise<void> {
  await prisma.loginFailure.create({ data: { ipHash, email } });
  // 古い記録(24時間より前)を掃除する
  await prisma.loginFailure.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
}

export async function clearLoginFailures(email: string): Promise<void> {
  await prisma.loginFailure.deleteMany({ where: { email: email.trim().toLowerCase() } });
}
