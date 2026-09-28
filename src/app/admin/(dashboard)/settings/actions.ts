"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";

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

async function fileFromForm(formData: FormData, field: string) {
  const file = formData.get(field);
  return file instanceof File && file.size > 0 ? file : null;
}

export async function updateHeroAssets(formData: FormData) {
  const [backgroundFile, resilientFile, aikoFile] = await Promise.all([
    fileFromForm(formData, "heroBackground"),
    fileFromForm(formData, "heroCharacterResilient"),
    fileFromForm(formData, "heroCharacterAiko"),
  ]);

  if (!backgroundFile && !resilientFile && !aikoFile) {
    redirect(`/admin/settings?error=${encodeURIComponent("アップロードする画像を選択してください。")}`);
    return;
  }

  const [heroBackgroundUrl, heroCharacterResilientUrl, heroCharacterAikoUrl] = await Promise.all([
    backgroundFile ? saveUploadedFile(backgroundFile, "hero") : undefined,
    resilientFile ? saveUploadedFile(resilientFile, "hero") : undefined,
    aikoFile ? saveUploadedFile(aikoFile, "hero") : undefined,
  ]);

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
