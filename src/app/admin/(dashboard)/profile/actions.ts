"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/storage";

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
  if (!user) redirect("/admin/login");

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

  let avatarUrl: string | undefined;
  const avatarFile = formData.get("avatar");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    avatarUrl = await saveUploadedFile(avatarFile, "profile");
  }

  await prisma.user.update({
    where: { id: user!.id },
    data: { ...parsed.data, ...(avatarUrl ? { avatarUrl } : {}) },
  });

  revalidatePath("/");
  revalidatePath("/profile");
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
  if (!user) redirect("/admin/login");

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
