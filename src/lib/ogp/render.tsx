import { ImageResponse } from "next/og";
import sharp from "sharp";
import { OGP_HEIGHT, OGP_WIDTH } from "./size";

/**
 * サイト共通のOGP画像(SNSでURLを共有したときのサムネイル)。1200×630。
 * トップページの最初に見える部分(ヒーロー)に似せて作る: ラテ色の地に、背景写真をうっすら敷き、
 * サイト名・キャッチコピー・キャラクター、右側に丸窓から覗く写真を並べる。
 * 背景写真・キャラクターは、管理画面(設定)のヒーロー画像をそのまま使うので、差し替えれば画像も変わる。
 * 画像が未設定でも、地の色と文字だけで表示される。
 *
 * ブラウザのスクリーンショットは、サーバー(Netlifyの関数)では撮れないため、ヒーローと同じ素材から組み立てている。
 * このファイルは画像を描くだけ。保存と使い回しは siteImage.ts が行う。
 */

const CATCHPHRASE = "この一杯から始まる、IT転職への道しるべ";
const BRAND_MAIN = "Resilient-cer";
const BRAND_SUB = "cafe";
const DISPLAY_URL = "resilient-cer.com";

// ヒーローと同じ配色(globals.css のライトモード)
const COLOR = {
  base: "#fbefe5",
  foreground: "#2e2220",
  muted: "#6f5c58",
  accentDark: "#99631f",
  accentSoft: "#f5e1cc",
};

/** 外部の読み込みで待たされすぎないための上限(ミリ秒) */
const FETCH_TIMEOUT_MS = 6000;

/** Googleフォントから、必要な文字だけを含む小さなフォントを取る。取れなければ null(その場合は標準フォントで描く)。 */
const fontCache = new Map<string, ArrayBuffer>();
async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}:${text}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
    // User-Agentを付けないと、Googleは、satoriが読めるTrueType形式で返す(woff2は読めない)
    const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).text();
    const fontUrl = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!fontUrl) return null;
    const res = await fetch(fontUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    fontCache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

/** 画像を取得し、軽いJPEG/PNGにしてデータURIで返す(WebPなどsatoriが読めない形式も吸収する)。失敗したら null。 */
async function loadImage(
  url: string | null,
  options: { width: number; height: number; fit: "cover" | "inside"; format: "jpeg" | "png" }
): Promise<string | null> {
  if (!url) return null;
  try {
    const absolute = new URL(url, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
    const res = await fetch(absolute, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const resized = sharp(input).resize({ width: options.width, height: options.height, fit: options.fit, withoutEnlargement: options.fit === "inside" });
    const output = options.format === "jpeg" ? await resized.jpeg({ quality: 82 }).toBuffer() : await resized.png().toBuffer();
    return `data:image/${options.format};base64,${output.toString("base64")}`;
  } catch {
    return null;
  }
}

/** 丸窓: 背景全面と同じ写真を、窓の位置ぶんだけずらして置くので、どの窓からも「1枚の写真の該当部分」が覗いて見える。 */
function PeepholeCircle({ photo, left, top, size }: { photo: string | null; left: number; top: number; size: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        display: "flex",
        borderRadius: 9999,
        overflow: "hidden",
        background: COLOR.accentSoft,
        border: "6px solid #fffafa",
        boxShadow: "0 8px 24px rgba(46, 34, 32, 0.18)",
      }}
    >
      {photo && (
        // 枠の線(6px)の内側が基準になるので、その分も含めてずらす
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={OGP_WIDTH} height={OGP_HEIGHT} style={{ position: "absolute", left: -left - 6, top: -top - 6, width: OGP_WIDTH, height: OGP_HEIGHT }} />
      )}
    </div>
  );
}

/** 画像の素材(管理画面の設定のヒーロー画像) */
export type OgpSources = {
  photoUrl: string | null;
  resilientUrl: string | null;
  aikoUrl: string | null;
};

/**
 * JPEGの先頭に、標準のJFIFヘッダーを足す(sharpの出力には付かない)。
 * Xでは、プログレッシブ形式・JFIFヘッダーなしの共通画像を使うページはカードが出ず、記事の画像(ベースライン形式・JFIFヘッダーあり)は
 * カードが出たため、後者の形式にそろえる(形式が原因だとは確定していない)。mozjpeg の指定はプログレッシブ形式になるので、使わない。
 */
function withJfifHeader(jpeg: Buffer): Buffer {
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) return jpeg;
  // APP0: 長さ16、"JFIF"、版1.01、画素の縦横比 1:1、サムネイルなし
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  return Buffer.concat([jpeg.subarray(0, 2), app0, jpeg.subarray(2)]);
}

/**
 * OGP画像をJPEGで描く。complete は、指定された素材の画像とフォントが、すべて取得できたか。
 * 一部でも欠けた画像は、保存して使い回してはいけない(欠けたままの画像が残り続けるため)。
 */
export async function renderOgpJpeg(sources: OgpSources): Promise<{ body: Buffer; complete: boolean }> {
  const [photo, resilient, aiko, brandFont, jpFont] = await Promise.all([
    loadImage(sources.photoUrl, { width: OGP_WIDTH, height: OGP_HEIGHT, fit: "cover", format: "jpeg" }),
    loadImage(sources.resilientUrl, { width: 220, height: 280, fit: "inside", format: "png" }),
    loadImage(sources.aikoUrl, { width: 220, height: 280, fit: "inside", format: "png" }),
    loadGoogleFont("Dancing Script", 700, BRAND_MAIN + BRAND_SUB),
    loadGoogleFont("Noto Sans JP", 700, CATCHPHRASE + DISPLAY_URL),
  ]);

  const fonts: { name: string; data: ArrayBuffer; weight: 700; style: "normal" }[] = [];
  if (brandFont) fonts.push({ name: "Brand", data: brandFont, weight: 700, style: "normal" });
  if (jpFont) fonts.push({ name: "Body", data: jpFont, weight: 700, style: "normal" });

  const image = new ImageResponse(
    (
      <div style={{ width: OGP_WIDTH, height: OGP_HEIGHT, display: "flex", position: "relative", overflow: "hidden", background: COLOR.base, fontFamily: "Body" }}>
        {/* 背景全面の写真(うっすら透ける) */}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={OGP_WIDTH} height={OGP_HEIGHT} style={{ position: "absolute", left: 0, top: 0, width: OGP_WIDTH, height: OGP_HEIGHT, opacity: 0.2 }} />
        )}
        {/* 文字側の地の色を少し戻して、文字を読みやすくする */}
        <div style={{ position: "absolute", left: 0, top: 0, width: OGP_WIDTH, height: OGP_HEIGHT, background: "linear-gradient(to right, rgba(251,239,229,0.85) 0%, rgba(251,239,229,0.55) 45%, rgba(251,239,229,0) 75%)" }} />

        <PeepholeCircle photo={photo} left={745} top={30} size={330} />
        <PeepholeCircle photo={photo} left={930} top={290} size={290} />
        <PeepholeCircle photo={photo} left={690} top={400} size={170} />

        {/* サイト名(筆記体)とキャッチコピー */}
        <div style={{ position: "absolute", left: 70, top: 110, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Brand", fontSize: 138, lineHeight: 1, color: COLOR.foreground }}>{BRAND_MAIN}</div>
          <div style={{ display: "flex", fontFamily: "Brand", fontSize: 138, lineHeight: 1, marginTop: -8, color: COLOR.accentDark }}>{BRAND_SUB}</div>
          <div style={{ display: "flex", marginTop: 34, fontSize: 31, color: COLOR.foreground }}>{CATCHPHRASE}</div>
        </div>

        {/* キャラクター2人(「cafe」の右横) */}
        <div style={{ position: "absolute", left: 340, top: 252, display: "flex", alignItems: "flex-end" }}>
          {resilient && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resilient} alt="" height={150} style={{ height: 150 }} />
          )}
          {aiko && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={aiko} alt="" height={150} style={{ height: 150, marginLeft: 6 }} />
          )}
        </div>

        <div style={{ position: "absolute", left: 74, bottom: 44, display: "flex", fontSize: 24, color: COLOR.muted }}>{DISPLAY_URL}</div>
      </div>
    ),
    { width: OGP_WIDTH, height: OGP_HEIGHT, fonts }
  );
  // ImageResponse はPNG(約1MB)になるので、SNSが短時間で取得できるよう、軽いJPEGに変換する
  const jpeg = await sharp(Buffer.from(await image.arrayBuffer()))
    .flatten({ background: COLOR.base })
    .jpeg({ quality: 85 })
    .toBuffer();
  const body = withJfifHeader(jpeg);

  const complete =
    Boolean(brandFont && jpFont) &&
    (!sources.photoUrl || Boolean(photo)) &&
    (!sources.resilientUrl || Boolean(resilient)) &&
    (!sources.aikoUrl || Boolean(aiko));
  return { body, complete };
}
