import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { IconMug } from "@/components/icons/CafeIcons";
import { CoffeeDrop, COFFEE_DROP_FALL_MS } from "./CoffeeDrop";
import { RippleStage } from "./RippleStage";

const CATCHPHRASE = "この一杯から始まる、IT転職への道しるべ";

/*
 * 演出のタイムライン(ms)。
 * アーチ窓が開く → サイト名がせり上がる → タグラインのバッジが回り出す →
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
 * アーチ窓の配置(窓のまとまり全体に対する%)。左・中央・右で高さを変えてリズムを付ける。
 * どの窓にも「まとまり全体」と同じ大きさの画像を敷き、窓の位置ぶんだけずらして見せることで、
 * 1枚の写真が壁に並んだ複数の窓越しに続いて見えるようにしている。
 */
type HeroWindow = { x: number; y: number; w: number; h: number };
const HERO_WINDOWS: HeroWindow[] = [
  { x: 0, y: 24, w: 30, h: 76 },
  { x: 35, y: 0, w: 32, h: 100 },
  { x: 72, y: 12, w: 28, h: 88 },
];

function windowBox({ x, y, w, h }: HeroWindow): CSSProperties {
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` };
}

/** 窓の中に置く画像の枠。窓に対する%に換算して、まとまり全体と同じ位置・大きさになるようにする。 */
function windowImageBox({ x, y, w, h }: HeroWindow): CSSProperties {
  return {
    left: `${(-x / w) * 100}%`,
    top: `${(-y / h) * 100}%`,
    width: `${(100 / w) * 100}%`,
    height: `${(100 / h) * 100}%`,
  };
}

function delay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function hostLabel(siteUrl: string) {
  try {
    return new URL(siteUrl).host;
  } catch {
    return siteUrl;
  }
}

export function Hero({
  tagline,
  siteUrl,
  backgroundUrl,
  characterResilientUrl,
  characterAikoUrl,
}: {
  tagline: string;
  siteUrl: string;
  backgroundUrl: string | null;
  characterResilientUrl: string | null;
  characterAikoUrl: string | null;
}) {
  const chars = [...CATCHPHRASE];
  const center = (chars.length - 1) / 2;

  return (
    <RippleStage className="hero-stage relative overflow-hidden border-b border-border">
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

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:gap-10 lg:pb-16 lg:pt-16">
        {/* ---- テキスト側 ---- */}
        <div className="relative flex flex-col items-center text-center lg:items-start lg:pl-14 lg:text-left">
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
            <span className="font-normal tracking-wider opacity-70">{hostLabel(siteUrl)}</span>
          </p>

          <h1 className="mt-5 font-brand italic leading-[0.9] text-foreground">
            <span className="block overflow-hidden pb-[0.2em] pr-[0.12em]">
              <span className="hero-rise block text-[3.4rem] sm:text-7xl lg:text-[5.4rem]" style={delay(T.brandMain)}>
                Resilient-cer
              </span>
            </span>
            <span className="-mt-[0.12em] block overflow-hidden pb-[0.24em] pr-[0.12em] lg:pl-[1.6em]">
              <span
                className="hero-rise inline-flex items-baseline gap-3 text-[3.4rem] text-accent-dark sm:text-7xl lg:text-[5.4rem]"
                style={delay(T.brandSub)}
              >
                cafe
                <span className="font-display text-xs not-italic tracking-[0.35em] text-foreground-muted lg:hidden">
                  レジリエンサーカフェ
                </span>
              </span>
            </span>
          </h1>

          {/* キャッチコピー: コーヒーの一滴が落ちた波紋から、文字が中央→外側へ広がる */}
          <p className="relative mt-5 inline-block font-display text-base font-medium tracking-wide text-foreground sm:text-lg">
            <span className="hero-surface-line" style={delay(IMPACT_MS)} />
            <CoffeeDrop delayMs={T.drop} style={{ left: "50%", top: "calc(100% + 6px)" }} />
            {chars.map((char, index) => (
              <span
                key={index}
                className="hero-char-ripple inline-block"
                style={delay(IMPACT_MS + 80 + Math.abs(index - center) * 55)}
              >
                {char}
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
            <span className="hidden text-[11px] tracking-wider text-foreground-muted sm:inline">
              画面をクリックすると、コーヒーが一滴落ちます
            </span>
          </div>
        </div>

        {/* ---- ビジュアル側: 高さの違う3つのアーチ窓から、1枚のカフェの景色が続いて見える ---- */}
        <div className="relative mx-auto w-full max-w-[440px] sm:max-w-[520px] lg:max-w-none">
          <div className="relative aspect-[5/4] lg:aspect-[6/5]">
            {/* 中央の窓だけ、少しずらした線のアーチ枠を重ねる */}
            <div
              aria-hidden
              className="hero-fade absolute translate-x-2.5 translate-y-2.5 rounded-t-full border border-accent/50"
              style={{ ...windowBox(HERO_WINDOWS[1]), ...delay(T.arch + 1100) }}
            />

            {HERO_WINDOWS.map((win, index) => (
              <div
                key={index}
                className="hero-arch absolute overflow-hidden rounded-t-full bg-accent-soft shadow-[0_18px_40px_-24px_rgba(46,34,32,0.55)]"
                style={{ ...windowBox(win), ...delay(T.arch + index * 160) }}
              >
                {backgroundUrl ? (
                  <>
                    {/* 窓ごとに「窓のまとまり全体」と同じ大きさの画像を置き、窓の位置だけずらして切り抜く */}
                    <div className="absolute" style={windowImageBox(win)}>
                      <Image
                        src={backgroundUrl}
                        alt=""
                        fill
                        priority={index === 1}
                        sizes="(min-width: 1024px) 600px, 520px"
                        className="hero-kenburns object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/35 via-transparent to-transparent" />
                  </>
                ) : (
                  index === 1 && (
                    <div className="flex h-full items-center justify-center text-accent-dark">
                      <IconMug className="h-20 w-20" />
                    </div>
                  )
                )}
                {/* 窓の桟(さん) */}
                <span aria-hidden className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-surface/55" />
                <span aria-hidden className="absolute inset-x-0 top-[42%] h-[3px] bg-surface/55" />
              </div>
            ))}

            {/* 窓が並ぶ壁のカウンター天板ライン */}
            <div aria-hidden className="hero-fade absolute -inset-x-8 bottom-0 h-px bg-foreground/25" style={delay(T.arch + 700)} />

            {/* タグラインが回り続ける円形バッジ(中心のマグは固定)。左の低い窓の上の余白に置く */}
            <div
              className="hero-badge absolute -left-3 -top-3 z-10 h-24 w-24 sm:h-28 sm:w-28 lg:-left-6 lg:-top-2 lg:h-32 lg:w-32"
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

            {/* キャラクター: 両端の窓の脇からひょっこり顔を出す */}
            {characterResilientUrl && (
              <div
                className="hero-peek pointer-events-none absolute -left-6 bottom-0 z-10 h-32 w-24 sm:-left-10 sm:h-40 sm:w-32 lg:-left-14 lg:h-48 lg:w-36"
                style={delay(T.characters)}
              >
                <Image
                  src={characterResilientUrl}
                  alt="レジサン"
                  fill
                  sizes="150px"
                  className="object-contain object-bottom drop-shadow-xl"
                />
              </div>
            )}
            {characterAikoUrl && (
              <div
                className="hero-peek pointer-events-none absolute -right-4 bottom-0 z-10 h-28 w-24 sm:-right-8 sm:h-36 sm:w-28 lg:-right-10 lg:h-44 lg:w-32"
                style={delay(T.characters + 250)}
              >
                <Image
                  src={characterAikoUrl}
                  alt="アイコ"
                  fill
                  sizes="140px"
                  className="object-contain object-bottom drop-shadow-xl"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </RippleStage>
  );
}
