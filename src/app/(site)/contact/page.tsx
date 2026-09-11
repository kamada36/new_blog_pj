import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "レジリエンサーCafeへのお問い合わせはこちらのフォームからお願いいたします。",
};

export default function ContactPage() {
  return (
    <Container className="max-w-2xl py-12">
      <h1 className="font-display text-2xl font-black">お問い合わせ</h1>
      <p className="mt-3 text-sm text-foreground-muted">
        ご質問・ご感想など、お気軽にお問い合わせください。内容を確認のうえ、必要に応じてご連絡いたします。
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </Container>
  );
}
