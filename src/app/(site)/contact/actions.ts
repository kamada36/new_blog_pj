"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

const contactSchema = z.object({
  name: z.string().trim().min(1, "お名前を入力してください").max(100),
  email: z.string().trim().email("正しいメールアドレスを入力してください"),
  message: z.string().trim().min(1, "お問い合わせ内容を入力してください").max(4000),
});

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function submitContact(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }

  await prisma.contactMessage.create({ data: parsed.data });

  return { status: "success", message: "お問い合わせを受け付けました。ご連絡ありがとうございます。" };
}
