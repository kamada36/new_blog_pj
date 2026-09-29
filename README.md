# レジリエンサーCafe (Next.js版)

WordPressで運用されていたブログサイトを Next.js (App Router) で再構築したものです。記事・カテゴリー・タグ・固定ページ・サイト設定はすべてDB（Supabase Postgres）で管理し、管理画面から編集します。

## 技術スタック

- Next.js 16 (App Router) / React 19 / TypeScript
- Tailwind CSS v4
- Prisma 7 + Supabase Postgres（`@prisma/adapter-pg`）
- 自前実装の単一管理者ログイン（bcryptjs + jose製JWTセッションCookie）
- Markdown記事編集: `@uiw/react-codemirror` + `react-markdown`

## セットアップ

1. [Supabase](https://supabase.com/)でプロジェクトを作成する。
2. プロジェクトのトップページ上部にある「Connect」ボタンから接続文字列を2種類取得する。
   - Transaction Pooler（6543番ポート、`?pgbouncer=true`付き）→ `DATABASE_URL`
   - Session Pooler または Direct connection（5432番ポート）→ `DIRECT_URL`
3. 以下を実行する。

```bash
npm install
cp .env.example .env   # DATABASE_URL / DIRECT_URL / AUTH_SECRET を設定してください
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

`AUTH_SECRET` は以下で生成できます。

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 管理画面ログイン

`npx prisma db seed` 実行時にコンソールへ表示される管理者アカウントでログインできます（`/admin/login`）。
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 環境変数を設定すればログイン情報を指定できます。ログイン後は `/admin/profile` からパスワードを変更してください。

## WordPressからの記事移行

旧WordPressサイトの記事（下書き・予約投稿・非公開を含む全ステータス）をREST API経由で取得し、
本文・アイキャッチ中の画像URLを新ドメイン（`media.resilient-cer.com`）へ置換した上でSupabaseへ
upsertするスクリプトを用意しています。画像ファイル自体は移行済み（R2等）である前提で、URLの
文字列置換のみを行います。

```bash
# .env に WP_URL / WP_USER / WP_APP_PASSWORD / NEW_MEDIA_BASE_URL 等を設定してから実行
npm run import:wordpress

# DBに書き込まず取得・変換結果だけ確認したい場合
WP_IMPORT_DRY_RUN=true npm run import:wordpress
```

必要な環境変数は `.env.example` の「WordPress記事移行」セクションを参照してください。
`wpId`（WP側の投稿ID）で突き合わせて upsert するため、何度実行しても重複作成されません。
詳細は `scripts/import-wordpress.ts` のコメントを参照。

## ディレクトリ構成（抜粋）

- `src/app/(site)` … 公開側ページ（トップ・記事・カテゴリー・固定ページなど）
- `src/app/admin` … 管理ダッシュボード（`/admin/login` 以外は `src/proxy.ts` で認証保護）
- `src/lib` … Prisma/認証/ストレージ/Markdown/クエリなどの共通ロジック
- `scripts/import-wordpress.ts` … WordPress記事移行スクリプト（`scripts/lib/` に画像URL置換・HTML整形の補助関数）
- `prisma/schema.prisma` … データモデル定義
- `prisma/seed.ts` … 初期データ（管理者・カテゴリー・サンプル記事・固定ページ）

## 既知の制約（本番デプロイ時の注意）

アップロード画像はローカル保存（`public/uploads`）のままです。Netlify/Vercelなどのサーバーレス環境ではファイルシステムが永続化されないため、本番運用の際は `src/lib/storage.ts` の実装をS3/Supabase Storage等に差し替える必要があります。

呼び出し側（記事保存処理など）は `saveUploadedFile()` の戻り値（公開URL）にのみ依存しているため、上記の切り替えは `storage.ts` の中身を差し替えるだけで完結する設計にしています。
