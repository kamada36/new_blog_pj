"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { revalidateSite } from "@/lib/revalidateSite";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getLoginPath } from "@/lib/adminPaths";
import { resolveImageField } from "@/lib/uploadField";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(2000).optional().default(""),
  snsX: z.string().trim().max(300).optional().default(""),
  snsThreads: z.string().trim().max(300).optional().default(""),
});

export type ProfileFormState = { status: "idle" | "error" | "success"; message?: string };

function redirectWithMessage(status: "success" | "error", message: string) {
  redirect(`/admin/profile?status=${status}&message=${encodeURIComponent(message)}`);
}

export async function updateProfile(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect(getLoginPath());

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    bio: formData.get("bio"),
    snsX: formData.get("snsX"),
    snsThreads: formData.get("snsThreads"),
  });

  if (!parsed.success) {
    redirectWithMessage("error", "入力内容をご確認ください。");
    return;
  }

  const avatarUrl = await resolveImageField(formData, "avatar", "profile", "setting");

  await prisma.user.update({
    where: { id: user!.id },
    data: { ...parsed.data, ...(avatarUrl ? { avatarUrl } : {}) },
  });

  // 公開ページはキャッシュ(ISR)されている。ヘッダー・サイドバー・一覧など全ページに出る内容が変わるため、サイト全体を更新する。
  revalidateSite();
  revalidatePath("/admin/profile");
  redirectWithMessage("success", "プロフィールを更新しました。");
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "パスワードは8文字以上で入力してください"),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "新しいパスワードが一致しません。",
    path: ["confirmPassword"],
  });

export async function changePassword(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect(getLoginPath());

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user!.passwordHash);
  if (!valid) {
    redirectWithMessage("error", "現在のパスワードが正しくありません。");
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user!.id }, data: { passwordHash } });

  redirectWithMessage("success", "パスワードを変更しました。");
}

const emailSchema = z.object({
  currentPassword: z.string().min(1),
  // ログイン時の照合は大文字小文字を区別しないため、保存は小文字にそろえる
  newEmail: z.string().trim().toLowerCase().email("正しいメールアドレスを入力してください").max(254),
});

/** ログイン用のメールアドレスの変更。本人確認のため、現在のパスワードを必須にする。 */
export async function changeEmail(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect(getLoginPath());

  const parsed = emailSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newEmail: formData.get("newEmail"),
  });

  if (!parsed.success) {
    redirectWithMessage("error", parsed.error.issues[0]?.message ?? "入力内容をご確認ください。");
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user!.passwordHash);
  if (!valid) {
    redirectWithMessage("error", "現在のパスワードが正しくありません。");
    return;
  }

  const newEmail = parsed.data.newEmail;
  if (newEmail === user!.email.toLowerCase()) {
    redirectWithMessage("error", "現在と同じメールアドレスです。");
    return;
  }

  try {
    await prisma.user.update({ where: { id: user!.id }, data: { email: newEmail } });
  } catch (error) {
    // email は一意(unique)。すでに他のアカウントで使われている場合
    if ((error as { code?: string }).code === "P2002") {
      redirectWithMessage("error", "このメールアドレスは、すでに使われています。");
      return;
    }
    throw error;
  }

  revalidatePath("/admin/profile");
  redirectWithMessage("success", `ログイン用のメールアドレスを変更しました。次回のログインから「${newEmail}」を使ってください。`);
}
