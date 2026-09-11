import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "angler.mattyo.rapala.36@gmail.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "resilience-cafe-2026";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: "レジサン",
      bio: "工業系出身。職業訓練制度を経て、約10年働いた工場を辞め30歳からIT業界へ。未経験からのIT転職経験を活かし、この一杯から始まる「IT転職への道しるべ」を発信しています。",
      snsX: "https://x.com/",
      snsThreads: "https://www.threads.net/",
    },
  });

  await prisma.siteSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      siteName: "レジリエンサーCafe",
      tagline: "YOUR RESILIENCE MATTERS!",
      footerCopyright: "Resilient-cer Cafe",
    },
  });

  const categoryDefs = [
    { name: "転職ノウハウ", slug: "career-knowhow", description: "IT未経験からの転職活動を成功させるための実践的な情報。", order: 1 },
    { name: "働くマインド", slug: "working-mindset", description: "長く働き続けるための考え方や心の持ち方。", order: 2 },
    { name: "ITリテラシー・AI", slug: "it-literacy-ai", description: "IT業界で役立つ基礎知識と最新AI事情。", order: 3 },
    { name: "生活・時事ネタ", slug: "life-topics", description: "転職やキャリアにまつわる暮らしと時事の話題。", order: 4 },
  ];

  const categories = [];
  for (const def of categoryDefs) {
    categories.push(
      await prisma.category.upsert({
        where: { slug: def.slug },
        update: {},
        create: def,
      })
    );
  }

  const tagDefs = ["IT転職", "転職活動", "未経験転職", "キャリア", "AI"];
  const tags = [];
  for (const name of tagDefs) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/g, "-");
    tags.push(
      await prisma.tag.upsert({
        where: { slug },
        update: {},
        create: { name, slug },
      })
    );
  }

  const articleDefs = [
    {
      title: "20代のIT転職リアル年収事情｜未経験からでも401万円超えを目指す方法",
      slug: "20s-it-career-change-salary",
      excerpt: "未経験からIT業界を目指す20代に向けて、リアルな年収事情とキャリアアップのロードマップを紹介します。",
      category: categories[1],
      tags: [tags[0], tags[1], tags[3]],
      content: `## 20代未経験のIT転職相場

> 💬 「未経験でも本当にIT業界に転職できるの？」

工場勤務から30歳でIT業界に飛び込んだ筆者の実感として、20代であれば熱意とポテンシャルを評価してもらいやすい時期です。

> 💡 **POINT**
> 求人票の年収レンジだけでなく、昇給・評価制度もあわせて確認しましょう。

## 年収401万円を超えるためのステップ

| 時期 | 目安年収 | やるべきこと |
| --- | --- | --- |
| 入社1年目 | 300万円台 | 業務知識・基礎スキルの習得 |
| 入社2〜3年目 | 350〜400万円 | 資格取得・実務経験の幅を広げる |
| 入社4年目以降 | 401万円〜 | 専門領域の確立・転職市場での価値向上 |

- 📈 インフラエンジニアとしての需要は引き続き底堅い
- 🔍 資格取得だけでなく実務での再現性を意識する
- 🔍 社内評価制度を early に把握しておく

## 避けたい失敗パターン

焦って条件面だけで転職先を決めてしまうと、早期離職につながりやすくなります。

## まとめ

📌 年収は一朝一夕には上がりません。まずは土台となるスキルと実務経験を積み上げていきましょう。
`,
    },
    {
      title: "Indeed PLUS AIアシスタントとは？機能・利用条件・効果を徹底解説",
      slug: "indeed-plus-ai-assistant",
      excerpt: "求人検索サービスIndeedが提供するAIアシスタント機能の概要と活用方法をまとめました。",
      category: categories[2],
      tags: [tags[4], tags[1]],
      content: `## Indeed PLUS AIアシスタントの概要

求人検索の効率化を目的としたAI機能で、希望条件に合った求人提案などをサポートします。

> 💡 **POINT**
> AIの提案はあくまで参考情報として活用し、最終判断は自分の軸で行いましょう。

## 利用条件

- アカウント登録が必要
- 一部機能は対象地域・職種に限定される場合がある

## 活用のコツ

📌 条件を具体的に入力するほど、精度の高い提案を受けられます。
`,
    },
    {
      title: "AI配置転換の衝撃｜事務職500人が建設現場へ異動・今すぐできるリスキリング対策",
      slug: "ai-job-transfer-reskilling",
      excerpt: "AIによる業務効率化で配置転換が進む事例から、今からできるリスキリング対策を考えます。",
      category: categories[2],
      tags: [tags[4], tags[3]],
      content: `## 何が起きているのか

AIによる業務自動化が進み、一部の事務職では配置転換の動きが出ています。

## 今すぐできる対策

- 🔍 自分の業務のうちAIに代替されやすい部分を洗い出す
- 🔍 IT分野の基礎知識を身につけておく
- 📈 社内外で通用するポータブルスキルを増やす

> 💬 「変化を脅威ではなく、キャリアの転機として捉えることが大切です。」
`,
    },
    {
      title: "ユニゾンキャリアの評判・口コミを徹底解説｜IT未経験転職の強みとデメリットも紹介",
      slug: "unison-career-review",
      excerpt: "IT未経験向け転職エージェントの評判・口コミと、利用する際の注意点を紹介します。",
      category: categories[0],
      tags: [tags[0], tags[2]],
      content: `## サービス概要

IT未経験者の転職支援に特化したサービスとして知られています。

## 強みとデメリット

**強み**

- 未経験向け求人の取り扱いが豊富
- キャリアアドバイザーによる伴走サポート

**デメリット**

- 地域によって求人数に差がある
- 担当者との相性に左右されやすい

## まとめ

📌 複数のサービスを併用しながら、自分に合った転職活動を進めましょう。
`,
    },
    {
      title: "職業訓練校のリアル｜工場勤務からIT業界へ転職した筆者の体験談",
      slug: "vocational-training-real-story",
      excerpt: "職業訓練校を経てIT業界へ転職した筆者自身の体験を振り返ります。",
      category: categories[0],
      tags: [tags[0], tags[2]],
      content: `## 職業訓練校を選んだ理由

未経験からの転職で不安だったスキル面を、体系的に学べる環境として選びました。

## 訓練校での学び

- 基礎的なプログラミングとネットワークの知識
- チームでの開発演習

## 転職後に感じたギャップ

> 💬 「座学と現場では、求められるスピード感が大きく違いました。」

📌 学んだことを土台に、現場での実践経験を積み重ねることが成長の近道です。
`,
    },
    {
      title: "働くのがしんどいと感じたら｜30代からのキャリアの見直し方",
      slug: "rethinking-career-in-30s",
      excerpt: "働くことがしんどいと感じたときに見直したい、キャリアと働き方のヒントをまとめました。",
      category: categories[1],
      tags: [tags[3]],
      content: `## しんどさの正体を言語化する

漠然とした「しんどさ」を、業務量・人間関係・将来性などの要素に分解してみましょう。

## 見直すべき3つの視点

- 🔍 今の環境は変えられるものか
- 🔍 スキルは他社でも通用するか
- 🔍 心身の健康を最優先できているか

📌 立ち止まって考える時間そのものが、次のキャリアへの準備になります。
`,
    },
  ];

  for (const def of articleDefs) {
    await prisma.article.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        title: def.title,
        slug: def.slug,
        excerpt: def.excerpt,
        contentMarkdown: def.content,
        status: "published",
        publishedAt: new Date(),
        metaTitle: def.title,
        metaDescription: def.excerpt,
        metaKeywords: def.tags.map((t) => t.name).join(", "),
        categoryId: def.category.id,
        authorId: admin.id,
        tags: { connect: def.tags.map((t) => ({ id: t.id })) },
      },
    });
  }

  const pageDefs = [
    {
      slug: "about",
      title: "サイト概要",
      content: `# サイト概要

「レジリエンサーCafe」は、IT未経験から転職を目指す方に向けて、実体験に基づいた転職ノウハウやキャリアの考え方を発信するブログです。

一杯のコーヒーを片手にひと休みするような気持ちで、あなたの転職への道しるべになれば幸いです。`,
      metaTitle: "サイト概要 | レジリエンサーCafe",
      metaDescription: "レジリエンサーCafeのコンセプトと運営方針について紹介しています。",
    },
    {
      slug: "privacy-policy",
      title: "プライバシーポリシー・免責事項",
      content: `# プライバシーポリシー・免責事項

## 個人情報の取り扱い

当サイトのお問い合わせフォームで取得した情報は、お問い合わせへの対応のみに利用します。

## 免責事項

当サイトの内容は正確性に努めていますが、内容を保証するものではありません。当サイトの情報を利用して発生したいかなる損害についても責任を負いかねます。`,
      metaTitle: "プライバシーポリシー・免責事項 | レジリエンサーCafe",
      metaDescription: "レジリエンサーCafeのプライバシーポリシーおよび免責事項です。",
    },
  ];

  for (const def of pageDefs) {
    await prisma.page.upsert({
      where: { slug: def.slug },
      update: {},
      create: {
        slug: def.slug,
        title: def.title,
        contentMarkdown: def.content,
        metaTitle: def.metaTitle,
        metaDescription: def.metaDescription,
      },
    });
  }

  console.log("Seed completed.");
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
