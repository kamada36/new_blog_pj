// Netlifyのバックグラウンド関数(AIジョブの実行)を、依存ごと1つのファイルにまとめる。
// Next.jsのビルドの後に実行する(netlify.toml の build.command)。出力先は netlify/functions/(Git管理外)。
//
// 自前でまとめる理由:
//   - Prisma 7 のクライアント(WASMをbase64で内包)・AI SDK・このプロジェクトの lib を、そのまま同梱したい。
//   - lib の "server-only" は、通常のNodeで読み込むと例外を投げる。esbuild の conditions に react-server を
//     指定すると、空のモジュールに差し替わる(Next.js自身も、サーバー側ではそうしている)。
import { build } from "esbuild";
import { resolve } from "node:path";

const root = process.cwd();

await build({
  entryPoints: [resolve(root, "netlify/functions-src/ai-job-background.ts")],
  outfile: resolve(root, "netlify/functions/ai-job-background.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  conditions: ["react-server"],
  alias: { "next/cache": resolve(root, "netlify/shims/next-cache.ts") },
  // ESMの出力でも、CommonJS形式の依存(pg など)が require を使えるようにする
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
