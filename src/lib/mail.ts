import "server-only";
import nodemailer from "nodemailer";

// お問い合わせの通知メール(GmailのSMTP)。必要な環境変数は次の3つ。どれかが未設定なら、送信せずに警告だけ出す
// (ローカル開発や、未設定の環境でも、お問い合わせの保存は止めない)。
//   GMAIL_USER             送信に使うGmailアドレス
//   GMAIL_APP_PASSWORD     そのアカウントの「アプリパスワード」(2段階認証を有効にして発行する16文字。通常のパスワードではない)
//   CONTACT_NOTIFY_EMAIL   通知の宛先
// 宛先をコードに書かないのは、メールアドレスをリポジトリ(GitHub)に残さないため。

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type ContactNotification = {
  name: string;
  email: string;
  message: string;
  createdAt: Date;
};

/** ヘッダーに入れる値から改行を除く(ヘッダーインジェクション対策)。 */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendContactNotification(contact: ContactNotification): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = process.env.CONTACT_NOTIFY_EMAIL;
  if (!user || !pass || !to) {
    console.warn("[mail] GMAIL_USER / GMAIL_APP_PASSWORD / CONTACT_NOTIFY_EMAIL が未設定のため、お問い合わせの通知メールは送信しません。");
    return;
  }

  // サーバーレス関数が、SMTPの応答待ちで長く止まらないよう、接続・応答の待ち時間を短くする
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  const name = singleLine(contact.name);
  const receivedAt = contact.createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

  await transporter.sendMail({
    from: { name: "レジリエンサーCafe", address: user },
    to,
    // 返信すると、お問い合わせをくれた相手に届く
    replyTo: { name, address: contact.email },
    subject: `【お問い合わせ】${name.slice(0, 50)} さんより`,
    text: [
      "サイトのお問い合わせフォームに、新しいお問い合わせが届きました。",
      "",
      `お名前: ${name}`,
      `メールアドレス: ${contact.email}`,
      `受信日時: ${receivedAt}(日本時間)`,
      "",
      "【お問い合わせ内容】",
      contact.message,
      "",
      "――――――――――――――――",
      `管理画面で確認する: ${siteUrl}/admin/messages/`,
    ].join("\n"),
  });
}
