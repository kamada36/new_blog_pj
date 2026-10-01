import type { NextConfig } from "next";

const remotePatterns = [new URL("https://media.resilient-cer.com/**")];

// R2の公開URL(カスタムドメイン or r2.devドメイン)。未設定でもビルドできるようガードする。
if (process.env.R2_PUBLIC_URL) {
  try {
    remotePatterns.push(new URL(`${process.env.R2_PUBLIC_URL.replace(/\/+$/, "")}/**`));
  } catch {
    // 不正なURLが設定されている場合は無視する(next/imageのエラーで気付ける)。
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;
