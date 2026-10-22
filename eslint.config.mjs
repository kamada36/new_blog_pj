import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 統合元の参照用ツール(直接編集しない・ビルド対象外)
    "reference-tools/**",
    // Netlifyのバックグラウンド関数のビルド出力(scripts/build-netlify-functions.mjs が生成。Git管理外)
    "netlify/functions/**",
  ]),
]);

export default eslintConfig;
