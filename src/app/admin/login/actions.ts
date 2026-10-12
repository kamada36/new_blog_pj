"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import {
  clearLoginFailures,
  DUMMY_PASSWORD_HASH,
  getLoginIdentity,
  isLoginBlocked,
  LOGIN_BLOCKED_MESSAGE,
  recordLoginFailure,
} from "@/lib/loginRateLimit";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export type LoginState = {
  status: "idle" | "error";
  message?: string;
};

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { status: "error", message: "メールアドレスとパスワードを入力してください。" };
  }

  // 失敗が続いているIP・メールアドレスは、パスワードの照合をせずに断る(総当たりの防止)
  const identity = await getLoginIdentity(parsed.data.email);
  if (await isLoginBlocked(identity)) {
    return { status: "error", message: LOGIN_BLOCKED_MESSAGE };
  }

  // メールアドレスは大文字小文字を区別せずに照合する(保存は小文字にそろえている)
  const user = await prisma.user.findFirst({ where: { email: { equals: parsed.data.email, mode: "insensitive" } } });
  // ユーザーが存在しなくても同じ時間をかけて照合し、応答時間からメールアドレスの登録有無を推測されないようにする
  const passwordMatches = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    await recordLoginFailure(identity);
    return { status: "error", message: "メールアドレスまたはパスワードが正しくありません。" };
  }

  await clearLoginFailures(identity.email);
  await createSession(user);

  const next = parsed.data.next && parsed.data.next.startsWith("/admin") ? parsed.data.next : "/admin";
  redirect(next);
}
