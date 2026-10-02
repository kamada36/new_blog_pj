import { prisma } from "@/lib/prisma";
import { GenerateWorkbench } from "./GenerateWorkbench";

// アイキャッチ画像の再生成(Server Action)は画像生成とR2への保存で時間がかかることがある。
// ページ単位で、このページから呼ぶServer Actionの実行時間の上限を引き上げる。
export const maxDuration = 120;

export default async function AdminGeneratePage() {
  const [categories, shortcodes] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    prisma.shortcode.findMany({
      orderBy: { createdAt: "asc" },
      select: { name: true, iconUrl: true, position: true, defaultTalk: true },
    }),
  ]);

  // APIキーの有無だけを画面に渡す(値そのものは絶対にクライアントへ渡さない)
  const keys = {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    storage: Boolean(
      process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME &&
        process.env.R2_PUBLIC_URL
    ),
  };

  return <GenerateWorkbench categories={categories} shortcodes={shortcodes} keys={keys} />;
}
