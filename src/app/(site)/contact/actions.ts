"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendContactNotification } from "@/lib/mail";

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

  const saved = await prisma.contactMessage.create({ data: parsed.data });

  // 通知メールの失敗でお問い合わせの受付を失敗させない(内容はDBに保存済みで、管理画面の未読バッジにも出る)。
  // サーバーレスでは、レスポンスを返した後の処理が打ち切られることがあるため、ここで送信の完了を待つ。
  try {
    await sendContactNotification(saved);
  } catch (error) {
    console.error("[contact] 通知メールの送信に失敗しました:", error);
  }

  return { status: "success", message: "お問い合わせを受け付けました。ご連絡ありがとうございます。" };
}
