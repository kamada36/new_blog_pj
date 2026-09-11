# レジリエンサーCafe (Next.js版)

WordPressで運用されていたブログサイトを Next.js (App Router) で再構築したものです。記事・カテゴリー・タグ・固定ページ・サイト設定はすべてDB（開発時はSQLite）で管理し、管理画面から編集します。

## 技術スタック

- Next.js 16 (App Router) / React 19 / TypeScript
- Tailwind CSS v4
- Prisma 7 + SQLite（`@prisma/adapter-better-sqlite3`）
- 自前実装の単一管理者ログイン（bcryptjs + jose製JWTセッションCookie）
- Markdown記事編集: `@uiw/react-codemirror` + `react-markdown`

## セットアップ

```bash
npm install
cp .env.example .env   # AUTH_SECRET を生成して設定してください
npx prisma migrate dev
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

## ディレクトリ構成（抜粋）

- `src/app/(site)` … 公開側ページ（トップ・記事・カテゴリー・固定ページなど）
- `src/app/admin` … 管理ダッシュボード（`/admin/login` 以外は `src/proxy.ts` で認証保護）
- `src/lib` … Prisma/認証/ストレージ/Markdown/クエリなどの共通ロジック
- `prisma/schema.prisma` … データモデル定義
- `prisma/seed.ts` … 初期データ（管理者・カテゴリー・サンプル記事・固定ページ）

## 既知の制約（本番デプロイ時の注意）

開発時はSQLite（`dev.db`）とアップロード画像のローカル保存（`public/uploads`）を使用しています。Vercelなどのサーバーレス環境ではファイルシステムが永続化されないため、本番運用の際は以下への切り替えが必要です。

- DB: `prisma/schema.prisma` の `datasource` と `DATABASE_URL` をPostgres等に変更
- 画像保存: `src/lib/storage.ts` の実装をS3/Vercel Blob等に差し替え

呼び出し側（記事保存処理など）は `saveUploadedFile()` の戻り値（公開URL）にのみ依存しているため、上記の切り替えは `storage.ts` の中身を差し替えるだけで完結する設計にしています。
