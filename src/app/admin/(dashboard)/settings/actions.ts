"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { resolveImageField } from "@/lib/uploadField";

const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(60),
  tagline: z.string().trim().min(1).max(120),
  footerCopyright: z.string().trim().min(1).max(80),
});

export async function updateSiteSetting(formData: FormData) {
  const parsed = settingsSchema.safeParse({
    siteName: formData.get("siteName"),
    tagline: formData.get("tagline"),
    footerCopyright: formData.get("footerCopyright"),
  });

  if (!parsed.success) {
    redirect(`/admin/settings?error=${encodeURIComponent("入力内容をご確認ください。")}`);
    return;
  }

  await prisma.siteSetting.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });

  revalidatePath("/", "layout");
  redirect("/admin/settings?status=success");
}

const sponsorSlotsSchema = z.object({
  sponsorSidebarEmbed: z.string().trim().max(5000),
  sponsorSidebarCompactEmbed: z.string().trim().max(5000),
  sponsorFooterEmbed: z.string().trim().max(5000),
});

export async function updateSponsorSlots(formData: FormData) {
  const parsed = sponsorSlotsSchema.safeParse({
    sponsorSidebarEmbed: formData.get("sponsorSidebarEmbed") ?? "",
    sponsorSidebarCompactEmbed: formData.get("sponsorSidebarCompactEmbed") ?? "",
    sponsorFooterEmbed: formData.get("sponsorFooterEmbed") ?? "",
  });

  if (!parsed.success) {
    redirect(`/admin/settings?error=${encodeURIComponent("広告タグの入力内容をご確認ください。")}`);
    return;
  }

  await prisma.siteSetting.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });

  revalidatePath("/", "layout");
  redirect("/admin/settings?status=success");
}

const residentSchema = z.object({
  residentName: z.string().trim().min(1, "名前を入力してください").max(30),
  residentBio: z.string().trim().min(1, "紹介文を入力してください").max(300),
});

export async function updateResident(formData: FormData) {
  const parsed = residentSchema.safeParse({
    residentName: formData.get("residentName"),
    residentBio: formData.get("residentBio"),
  });

  if (!parsed.success) {
    redirect(`/admin/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "入力内容をご確認ください。")}`);
    return;
  }

  const residentAvatarUrl = await resolveImageField(formData, "residentAvatar", "settings", "setting");

  const data = {
    ...parsed.data,
    ...(residentAvatarUrl ? { residentAvatarUrl } : {}),
  };

  await prisma.siteSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/", "layout");
  redirect("/admin/settings?status=success");
}

export async function updateHeroAssets(formData: FormData) {
  const [heroBackgroundUrl, heroCharacterResilientUrl, heroCharacterAikoUrl] = await Promise.all([
    resolveImageField(formData, "heroBackground", "hero", "setting"),
    resolveImageField(formData, "heroCharacterResilient", "hero", "setting"),
    resolveImageField(formData, "heroCharacterAiko", "hero", "setting"),
  ]);

  if (!heroBackgroundUrl && !heroCharacterResilientUrl && !heroCharacterAikoUrl) {
    redirect(`/admin/settings?error=${encodeURIComponent("アップロードする画像を選択してください。")}`);
    return;
  }

  const data = {
    ...(heroBackgroundUrl ? { heroBackgroundUrl } : {}),
    ...(heroCharacterResilientUrl ? { heroCharacterResilientUrl } : {}),
    ...(heroCharacterAikoUrl ? { heroCharacterAikoUrl } : {}),
  };

  await prisma.siteSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/", "layout");
  redirect("/admin/settings?status=success");
}
