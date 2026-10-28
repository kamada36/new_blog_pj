"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendContactNotification } from "@/lib/mail";
import {
  CONTACT_RATE_LIMITED_MESSAGE,
  CONTACT_TOKEN_ERROR_MESSAGE,
  CONTACT_TOO_FAST_MESSAGE,
  getContactIpHash,
  isContactRateLimited,
  verifyContactToken,
} from "@/lib/contactGuard";

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
  // ハニーポット(bot-field)に値があればボットとみなし、何も保存せず成功を装って返す(ボットに気づかせない)。
  // Server Action はNetlify Formsのエンドポイントを通らないため、Netlify側のハニーポット判定は効かない。ここで判定する。
  const botField = formData.get("bot-field");
  if (typeof botField === "string" && botField.trim() !== "") {
    // 件数だけ把握できるよう、内容は記録せずログのみ残す(Netlifyの関数ログで確認できる)。
    console.warn("[contact] ハニーポットに入力があったため、お問い合わせを破棄しました");
    return { status: "success", message: "お問い合わせを受け付けました。ご連絡ありがとうございます。" };
  }

  // ハニーポットは、フォームを埋めるボットにしか効かない。Server Action を直接叩くボットは bot-field を送らないため、
  // 「フォームを開いたブラウザが取得した署名つきトークン」と「送信元ごとの回数制限」でも守る(src/lib/contactGuard.ts)。
  const tokenResult = verifyContactToken(formData.get("form-token"));
  if (tokenResult === "invalid") {
    console.warn("[contact] 送信トークンが無い・不正・期限切れのため、お問い合わせを断りました");
    return { status: "error", message: CONTACT_TOKEN_ERROR_MESSAGE };
  }
  if (tokenResult === "too-fast") {
    console.warn("[contact] 送信が早すぎるため、お問い合わせを断りました");
    return { status: "error", message: CONTACT_TOO_FAST_MESSAGE };
  }

  const ipHash = await getContactIpHash();
  if (await isContactRateLimited(ipHash)) {
    console.warn("[contact] 回数制限に達したため、お問い合わせを断りました");
    return { status: "error", message: CONTACT_RATE_LIMITED_MESSAGE };
  }

  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "入力内容をご確認ください。" };
  }

  const saved = await prisma.contactMessage.create({ data: { ...parsed.data, ipHash } });

  // 通知メールの失敗でお問い合わせの受付を失敗させない(内容はDBに保存済みで、管理画面の未読バッジにも出る)。
  // サーバーレスでは、レスポンスを返した後の処理が打ち切られることがあるため、ここで送信の完了を待つ。
  try {
    await sendContactNotification(saved);
  } catch (error) {
    console.error("[contact] 通知メールの送信に失敗しました:", error);
  }

  return { status: "success", message: "お問い合わせを受け付けました。ご連絡ありがとうございます。" };
}
