"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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

  revalidatePath("/");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?status=success");
}
