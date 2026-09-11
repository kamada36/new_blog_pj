"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";

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

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;

  if (!user || !valid) {
    return { status: "error", message: "メールアドレスまたはパスワードが正しくありません。" };
  }

  await createSession(user);

  const next = parsed.data.next && parsed.data.next.startsWith("/admin") ? parsed.data.next : "/admin";
  redirect(next);
}
