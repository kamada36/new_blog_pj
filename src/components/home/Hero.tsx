import Link from "next/link";
import Image, { getImageProps } from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { IconMug } from "@/components/icons/CafeIcons";
import { CoffeeDrop, COFFEE_DROP_FALL_MS } from "./CoffeeDrop";
import { RippleStage } from "./RippleStage";

const CATCHPHRASE = "この一杯から始まる、IT転職への道しるべ";

/** 「OPEN」看板風ラベルに出すサイトのURL */
const SITE_DISPLAY_URL = "https://resilient-cer.com";

/** キャッチコピーを「、」で区切ったまとまり(start は文字列全体での先頭の文字位置)。折り返しはこの単位で行う。 */
const CATCHPHRASE_SEGMENTS = CATCHPHRASE.split(/(?<=、)/).reduce<{ text: string; start: number }[]>(
  (segments, text) => {
    const prev = segments[segments.length - 1];
    return [...segments, { text, start: prev ? prev.start + [...prev.text].length : 0 }];
  },
  []
);

/*
 * 演出のタイムライン(ms)。
 * 窓が開く → サイト名がせり上がる → タグラインのバッジが回り出す →
 * コーヒーの一滴が落ちて波紋が広がり、その波紋に乗ってキャッチコピーが中央から広がる →
 * キャラクターが顔を出す → Aboutボタン、の順に流れる。
 */
const T = {
  arch: 0,
  open: 200,
  brandMain: 250,
  brandSub: 520,
  badge: 900,
  drop: 1300,
  characters: 2500,
  cta: 3000,
};
const IMPACT_MS = T.drop + COFFEE_DROP_FALL_MS;

/** 円形バッジ(半径78)の円周に収まるよう、タグラインを何回繰り返すかを決める。 */
const BADGE_CIRCUMFERENCE = 2 * Math.PI * 78;
function badgeText(tagline: string) {
  const separator = "  ✦  ";
  const fontSize = 14;
  const estimateWidth = (text: string) =>
    [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 0x2e80 ? 0.68 : 1.05), 0) * fontSize;
  const unitWidth = estimateWidth(tagline + separator);
  const repeat = Math.max(1, Math.floor(BADGE_CIRCUMFERENCE / unitWidth));
  return Array.from({ length: repeat }, () => tagline + separator).join("");
}

/**
 * 丸窓の配置(窓のまとまり全体に対する%)。大きさの違う円を不規則に散らし、一部は重ねる。
 * 正円にするため、高さ(%)は「幅(%) × まとまりの縦横比(4:3 → 4/3)」で求める。
 * 円どうしが重なっても、どの窓も同じ1枚の写真を同じ位置で見せているので、重なった部分は継ぎ目なくつながる。
 */
const WINDOW_GROUP_RATIO = 4 / 3;
type HeroWindow = { x: number; y: number; w: number; h: number };
function circleWindow(x: number, y: number, w: number): HeroWindow {
  return { x, y, w, h: w * WINDOW_GROUP_RATIO };
}

/**
 * 表示後に円がゆっくり漂う軌道。初期位置 → 1点目 → 2点目 → 初期位置 と巡回する(px)。
 * 円ごとに向き・大きさ・周期を変えて、揃って動いているように見えないようにする。
 */
type Orbit = { x1: number; y1: number; x2: number; y2: number; durationS: number };

const HERO_WINDOWS: { box: HeroWindow; orbit: Orbit; ripplePeriodS: number }[] = [
  // 左下の大きな円: 写真の主役(コーヒーカップ)が来るあたり
  { box: circleWindow(-12, 34, 54), orbit: { x1: 34, y1: -22, x2: -18, y2: 28, durationS: 30 }, ripplePeriodS: 9 },
  // 上の中くらいの円(左下の円と少し重なる)
  { box: circleWindow(24, 0, 40), orbit: { x1: -32, y1: 20, x2: 22, y2: 34, durationS: 26 }, ripplePeriodS: 11 },
  // 右の大きめの円(上の円と少し重なり、右端からはみ出す)
  { box: circleWindow(58, 18, 46), orbit: { x1: -28, y1: -30, x2: -40, y2: 16, durationS: 32 }, ripplePeriodS: 10 },
  // 下の小さな円
  { box: circleWindow(44, 70, 20), orbit: { x1: 30, y1: -16, x2: 14, y2: -34, durationS: 22 }, ripplePeriodS: 8 },
];

/** テキスト側の余白に浮かべる小窓(PCのみ)。位置はテキスト列に対するTailwindクラスで指定する。 */
const SMALL_WINDOWS: { className: string; orbit: Orbit; ripplePeriodS: number }[] = [
  { className: "-top-28 right-16 h-32 w-32", orbit: { x1: 20, y1: 18, x2: -16, y2: 26, durationS: 24 }, ripplePeriodS: 12 },
  { className: "-bottom-28 right-20 h-28 w-28", orbit: { x1: -22, y1: -14, x2: 16, y2: -24, durationS: 27 }, ripplePeriodS: 13 },
  { className: "-bottom-28 -left-6 h-24 w-24", orbit: { x1: 16, y1: -20, x2: 24, y2: 10, durationS: 23 }, ripplePeriodS: 14 },
];

function windowBox({ x, y, w, h }: HeroWindow): CSSProperties {
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
}

function orbitStyle({ x1, y1, x2, y2, durationS }: Orbit): CSSProperties {
  return {
    "--orbit-x1": `${x1}px`,
    "--orbit-y1": `${y1}px`,
    "--orbit-x2": `${x2}px`,
    "--orbit-y2": `${y2}px`,
    "--orbit-dur": `${durationS}s`,
  } as CSSProperties;
}

/** 背景写真の出し分け。mobileSrc があれば、幅が狭い画面(1024px未満=縦積みレイアウト)ではそちらを使う。 */
type HeroPhotoSource = { src: string; mobileSrc: string | null };

/** 縦積みレイアウトに切り替わる幅。globals.css の .hero-veil、Hero 内の Tailwind の lg: と揃えている。 */
const WIDE_LAYOUT_MEDIA = "(min-width: 1024px)";

/**
 * 丸窓1つ分。外側(hero-orbit)が円ごとゆっくり漂い、内側の円は中心から広がるように現れる。
 * 漂う動きぶんは窓の中の写真を逆向きに同じだけ動かして打ち消すので、円が動いても景色は背景とつながったまま。
 */
function Peephole({
  photo,
  orbit,
  revealDelayMs,
  ripplePeriodS,
  className = "",
  style,
  fallback,
}: {
  photo: HeroPhotoSource | null;
  orbit: Orbit;
  revealDelayMs: number;
  /** 波紋の輪を繰り返す間隔(秒)。1回目は円が現れるのと同時 */
  ripplePeriodS: number;
  className?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
}) {
  return (
    <div aria-hidden className={`hero-orbit absolute ${className}`} style={{ ...style, ...orbitStyle(orbit) }}>
      <div
        data-peephole
        className={`hero-window-open absolute inset-0 rounded-full ${photo ? "" : "bg-accent-soft"}`}
        style={delay(revealDelayMs)}
      >
        {photo ? <PeepholeImage photo={photo} /> : fallback}
      </div>
      {/* 外側へ広がる波紋の輪。円が開くのと同時に1回目が広がり、その後も一定間隔で繰り返す */}
      {[0, 1].map((ring) => (
        <span
          key={ring}
          className="hero-window-ripple"
          style={{ ...delay(revealDelayMs + ring * 260), animationDuration: `${ripplePeriodS}s` }}
        />
      ))}
    </div>
  );
}

/**
 * 丸窓から覗く景色。ヒーロー全面に敷いた背景写真と同じ大きさ・同じ動きの写真を、
 * 窓の位置ぶんだけずらして置く(ずらす量は RippleStage が実測して --peek-x / --peek-y に入れる)。
 * これで、どの窓からも「背景全面にある1枚の写真」の該当部分が覗いて見える。
 */
function PeepholeImage({ photo }: { photo: HeroPhotoSource }) {
  return (
    <div className="hero-peephole-img">
      <HeroPhoto photo={photo} />
    </div>
  );
}

/**
 * 背景写真の本体。背景全面と各丸窓のどちらもこれを「セクションと同じ大きさの枠」に置くので、
 * 写真の切り取り方・動きが完全に一致し、窓から覗く景色と透けて見える景色がつながる。
 */
function HeroPhoto({ photo, eager = false }: { photo: HeroPhotoSource; eager?: boolean }) {
  const common = { alt: "", fill: true, sizes: "100vw", className: "hero-kenburns object-cover" } as const;

  let image: ReactNode;
  if (!photo.mobileSrc) {
    image = <Image {...common} src={photo.src} alt="" preload={eager} />;
  } else {
    // 画面幅で画像を差し替える(アートディレクション)。<picture> なのでブラウザは幅に合う1枚だけを読み込む。
    const {
      props: { srcSet: wideSrcSet },
    } = getImageProps({ ...common, src: photo.src });
    const {
      props: { srcSet: narrowSrcSet, ...rest },
    } = getImageProps({ ...common, src: photo.mobileSrc });
    image = (
      <picture>
        <source media={WIDE_LAYOUT_MEDIA} srcSet={wideSrcSet} sizes={common.sizes} />
        <img {...rest} srcSet={narrowSrcSet} alt="" loading="eager" fetchPriority={eager ? "high" : undefined} />
      </picture>
    );
  }

  return (
    <div className="hero-photo-frame">
      <div className="hero-drift absolute inset-0">{image}</div>
    </div>
  );
}

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

export function Hero({
  tagline,
  backgroundUrl,
  backgroundMobileUrl,
  characterResilientUrl,
  characterAikoUrl,
}: {
  tagline: string;
  backgroundUrl: string | null;
  /** 幅が狭い画面(1024px未満)用の縦長の背景画像。未設定なら backgroundUrl をそのまま使う */
  backgroundMobileUrl: string | null;
  characterResilientUrl: string | null;
  characterAikoUrl: string | null;
}) {
  const center = ([...CATCHPHRASE].length - 1) / 2;
  // 片方しか設定されていなければ、その1枚をすべての画面幅で使う
  const photoSrc = backgroundUrl ?? backgroundMobileUrl;
  const photo: HeroPhotoSource | null = photoSrc
    ? { src: photoSrc, mobileSrc: backgroundUrl ? backgroundMobileUrl : null }
    : null;

  return (
    <RippleStage className="hero-stage relative overflow-hidden">
      {/* 背景全面の写真(薄く透けて見える)。丸窓からは同じ写真がくっきり覗く */}
      {photo && (
        <div aria-hidden className="hero-backdrop pointer-events-none absolute inset-0">
          <HeroPhoto photo={photo} eager />
        </div>
      )}
      <div aria-hidden className="hero-veil pointer-events-none absolute inset-0" />

      {/* 背景の飾り: テーブルに残ったコーヒーカップの輪じみ。
          表示後も輪がゆっくり回りながら呼吸するように揺れ、ときどき外側へ波が一つ広がる。 */}
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="hero-fade pointer-events-none absolute -left-24 -top-28 w-[420px] overflow-visible text-accent opacity-[0.16] sm:w-[520px]"
        style={delay(T.open)}
      >
        <g className="hero-ring-breathe">
          <circle className="hero-ring-drift" cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="420 18 160 30 300 12" strokeLinecap="round" />
          <circle className="hero-ring-drift hero-ring-drift-reverse" cx="206" cy="196" r="138" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="200 40 380 26" strokeLinecap="round" opacity="0.6" />
        </g>
        <circle className="hero-ring-wave" cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle className="hero-ring-wave" cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ animationDelay: "4.6s" }} />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 400 400"
        className="hero-fade pointer-events-none absolute -bottom-40 right-[42%] hidden w-[300px] -rotate-12 overflow-visible text-accent opacity-[0.1] lg:block"
        style={delay(T.open + 200)}
      >
        <g className="hero-ring-breathe" style={{ animationDelay: "2s" }}>
          <circle className="hero-ring-drift hero-ring-drift-reverse" cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="520 24 240 40" strokeLinecap="round" />
        </g>
        <circle className="hero-ring-wave" cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "6.5s" }} />
      </svg>

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:gap-10 lg:pb-14 lg:pt-14">
        {/* ---- テキスト側 ---- */}
        <div className="relative z-10 flex flex-col items-center text-center lg:items-start lg:pl-14 lg:text-left">
          {/* 縦書きの読み仮名(PCのみ) */}
          <p
            className="hero-fade absolute left-0 top-1 hidden items-center gap-3 font-display text-xs tracking-[0.55em] text-foreground-muted [writing-mode:vertical-rl] lg:flex"
            style={delay(T.brandSub)}
          >
            レジリエンサーカフェ
            <span className="h-14 w-px bg-current opacity-40" />
          </p>

          {/* カフェの「OPEN」看板風ラベル */}
          <p
            className="hero-fade inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-foreground-muted backdrop-blur"
            style={delay(T.open)}
          >
            <span className="hero-open-dot h-1.5 w-1.5 rounded-full bg-accent" />
            OPEN
            <span className="font-normal tracking-wider opacity-70">{SITE_DISPLAY_URL}</span>
          </p>

          <div className="relative mt-5 flex flex-col items-center lg:block">
            {/* 文字サイズは h1 に指定し、各行の余白(em)をタイトルの文字サイズ基準で効かせる */}
            <h1 className="font-brand whitespace-nowrap text-[3.4rem] font-bold leading-[0.9] text-foreground sm:text-7xl lg:text-[4.2rem] xl:text-[5.4rem]">
              <span className="block overflow-hidden pb-[0.05em]">
                <span className="hero-rise block" style={{ ...delay(T.brandMain), "--rise-from": "150%" } as CSSProperties}>
                  Resilient-cer
                </span>
              </span>
              {/* 筆記体の「f」は下に長く伸びるので、せり上がり演出用の切り抜き枠の下に余白を多めに取り、
                  その分を負のマージンで打ち消して下の要素との間隔は変えない */}
              <span className="-mb-[0.35em] -mt-[0.02em] block overflow-hidden pb-[0.4em] pr-[0.05em] lg:pl-[0.3em]">
                <span
                  className="hero-rise inline-flex items-baseline gap-3 text-accent-dark"
                  style={{ ...delay(T.brandSub), "--rise-from": "200%" } as CSSProperties}
                >
                  cafe
                  <span className="font-display text-xs font-normal tracking-[0.35em] text-foreground-muted lg:hidden">
                    レジリエンサーカフェ
                  </span>
                </span>
              </span>
            </h1>

            {/* キャラクター2人: タイトルのそば(PCは「cafe」の右横、スマホはタイトルの下)に並んで顔を出す */}
            {(characterResilientUrl || characterAikoUrl) && (
              <div className="mt-4 flex items-end gap-1 lg:absolute lg:-bottom-2 lg:left-40 lg:mt-0">
                {[
                  { src: characterResilientUrl, alt: "レジサン" },
                  { src: characterAikoUrl, alt: "アイコ" },
                ].map(
                  (character, index) =>
                    character.src && (
                      <div
                        key={character.alt}
                        className="hero-peek pointer-events-none relative h-20 w-16 lg:h-24 lg:w-20"
                        style={delay(T.characters + index * 250)}
                      >
                        <Image
                          src={character.src}
                          alt={character.alt}
                          fill
                          sizes="80px"
                          className="object-contain object-bottom drop-shadow-lg"
                        />
                      </div>
                    )
                )}
              </div>
            )}
          </div>

          {/* キャッチコピー: コーヒーの一滴が落ちた波紋から、文字が中央→外側へ広がる */}
          <p className="relative mt-5 inline-block font-display text-base font-medium tracking-wide text-foreground sm:text-lg">
            <span className="hero-surface-line" style={delay(IMPACT_MS)} />
            <CoffeeDrop delayMs={T.drop} style={{ left: "50%", top: "calc(100% + 6px)" }} />
            {/* 狭い画面で折り返すときは「、」の後ろだけで改行し、単語の途中で切れないようにする */}
            {CATCHPHRASE_SEGMENTS.map((segment) => (
              <span key={segment.start} className="inline-block whitespace-nowrap">
                {[...segment.text].map((char, offset) => {
                  const index = segment.start + offset;
                  return (
                    <span
                      key={index}
                      className="hero-char-ripple inline-block"
                      style={delay(IMPACT_MS + 80 + Math.abs(index - center) * 55)}
                    >
                      {char}
                    </span>
                  );
                })}
              </span>
            ))}
          </p>

          <div className="hero-fade-up mt-10 flex items-center gap-4" style={delay(T.cta)}>
            <Link
              href="/about"
              className="group inline-flex items-center gap-3 rounded-full bg-foreground py-1.5 pl-6 pr-1.5 text-sm font-semibold tracking-wide text-background transition-colors duration-300 hover:bg-accent-dark"
            >
              About
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-foreground transition-transform duration-500 ease-out group-hover:rotate-[-45deg]">
                →
              </span>
            </Link>
          </div>

          {/* テキスト側の余白に浮かぶ小窓(PCのみ) */}
          {photo &&
            SMALL_WINDOWS.map((win, index) => (
              <Peephole
                key={index}
                photo={photo}
                orbit={win.orbit}
                ripplePeriodS={win.ripplePeriodS}
                revealDelayMs={T.arch + 500 + index * 180}
                className={`-z-10 hidden lg:block ${win.className}`}
              />
            ))}
        </div>

        {/* ---- ビジュアル側: 大きさの違う丸窓から、背景全面の写真が覗いて見える ----
            PCでは列の幅より少し大きくして右端へはみ出させ、窓を大きく見せる */}
        <div className="relative z-0 mx-auto w-full max-w-[460px] sm:max-w-[520px] lg:w-[104%] lg:max-w-none xl:w-[112%]">
          <div className="relative aspect-[4/3]">
            {HERO_WINDOWS.map((win, index) => (
              <Peephole
                key={index}
                photo={photo}
                orbit={win.orbit}
                ripplePeriodS={win.ripplePeriodS}
                revealDelayMs={T.arch + index * 160}
                style={windowBox(win.box)}
                fallback={
                  index === 0 && (
                    <div className="flex h-full items-center justify-center text-accent-dark">
                      <IconMug className="h-20 w-20" />
                    </div>
                  )
                }
              />
            ))}

            {/* タグラインが回り続ける円形バッジ(中心のマグは固定)。右上の余白に置く */}
            <div
              className="hero-badge absolute -top-4 left-[74%] z-10 h-24 w-24 sm:h-28 sm:w-28 lg:-top-6 lg:left-[68%] lg:h-28 lg:w-28 xl:left-[76%] xl:h-32 xl:w-32"
              style={delay(T.badge)}
            >
              <div className="relative h-full w-full rounded-full bg-surface text-accent-dark shadow-lg ring-1 ring-border">
                <svg aria-hidden viewBox="0 0 200 200" className="hero-badge-spin absolute inset-0 h-full w-full">
                  <defs>
                    <path id="hero-badge-circle" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
                  </defs>
                  <text fontSize="14" fontWeight="700" fill="currentColor" letterSpacing="1">
                    <textPath href="#hero-badge-circle" textLength={BADGE_CIRCUMFERENCE} lengthAdjust="spacing">
                      {badgeText(tagline)}
                    </textPath>
                  </text>
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="relative">
                    <span className="hero-steam left-[30%]" />
                    <span className="hero-steam left-[55%]" style={{ animationDelay: "1.1s" }} />
                    <IconMug className="h-8 w-8 lg:h-9 lg:w-9" />
                  </span>
                </span>
              </div>
              <p className="sr-only">{tagline}</p>
            </div>
          </div>
        </div>
      </div>
    </RippleStage>
  );
}
