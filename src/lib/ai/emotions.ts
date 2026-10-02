// 吹き出しキャラクター(hukidasi1=レジサン / hukidasi2=アイコ)の表情アイコン。
// AIには emotion="happy" のような感情名だけを指定させ、実際のアイコン画像URLはここで解決する。
// (元ツールの character-emotions.json のURLを、このブログのメディアドメイン上の
//  「<元URL>-150x150.png」形式へ変換したもの。全件の存在は確認済み。)

export type Emotion =
  | "normal"
  | "happy"
  | "sad"
  | "worried"
  | "surprised"
  | "crying"
  | "exasperated"
  | "blank"
  | "wink"
  | "annoyed";

export const EMOTIONS: Emotion[] = [
  "normal",
  "happy",
  "sad",
  "worried",
  "surprised",
  "crying",
  "exasperated",
  "blank",
  "wink",
  "annoyed",
];

export type BalloonCharacter = "hukidasi1" | "hukidasi2";

// 画像のパス(メディアドメイン直下)。normalだけは2種類のバリエーションからランダムに選ぶ。
const ICON_PATHS: Record<Emotion, Record<BalloonCharacter, string[]>> = {
  normal: {
    hukidasi1: ["2024/11/avatar", "2024/11/easy-peasy_ZMdC3TjuoV"],
    hukidasi2: ["2024/11/easy-peasy_vG6ocjLCyX", "2024/11/easy-peasy_8wivoUMYq2"],
  },
  happy: {
    hukidasi1: ["2024/11/easy-peasy_sisFFlqktH"],
    hukidasi2: ["2024/11/easy-peasy_kkXcM70ZPH"],
  },
  sad: {
    hukidasi1: ["2024/12/easy-peasy_dxDN0kmydj"],
    hukidasi2: ["2024/11/easy-peasy_pWtULVms1b"],
  },
  worried: {
    hukidasi1: ["2024/12/easy-peasy_8S8SJIyJ7X"],
    hukidasi2: ["2024/11/easy-peasy_pbjkrkROk1"],
  },
  surprised: {
    hukidasi1: ["2024/11/easy-peasy_tb2824DRa0"],
    hukidasi2: ["2024/11/easy-peasy_pWtULVms1b"],
  },
  crying: {
    hukidasi1: ["2024/12/easy-peasy_3SgGf3oWbP"],
    hukidasi2: ["2024/11/easy-peasy_43o40oJnV1"],
  },
  exasperated: {
    hukidasi1: ["2024/11/easy-peasy_dVvqK1Cywx"],
    hukidasi2: ["2024/11/easy-peasy_q6CAMC9AEb"],
  },
  blank: {
    hukidasi1: ["2024/11/easy-peasy_cF8BiXMSnn"],
    hukidasi2: ["2024/11/easy-peasy_MPBzi5aGNf"],
  },
  wink: {
    hukidasi1: ["2024/11/easy-peasy_JRFDuv2jtZ"],
    hukidasi2: ["2024/11/easy-peasy_VsClJLxHES"],
  },
  annoyed: {
    hukidasi1: ["2024/12/easy-peasy_OrMIKrqvSn"],
    hukidasi2: ["2024/11/easy-peasy_UWkYKEiOmd"],
  },
};

const DEFAULT_MEDIA_BASE_URL = "https://media.resilient-cer.com";

function mediaBaseUrl(): string {
  return (process.env.R2_PUBLIC_URL || DEFAULT_MEDIA_BASE_URL).replace(/\/+$/, "");
}

export function isBalloonCharacter(name: string): name is BalloonCharacter {
  return name === "hukidasi1" || name === "hukidasi2";
}

export function isEmotion(value: string): value is Emotion {
  return (EMOTIONS as string[]).includes(value);
}

/** 感情名に対応するアイコンURL。normalは2種類のうちどちらかをランダムに返す。 */
export function resolveEmotionIconUrl(character: BalloonCharacter, emotion: Emotion): string {
  const paths = ICON_PATHS[emotion][character];
  const path = paths[Math.floor(Math.random() * paths.length)];
  return `${mediaBaseUrl()}/${path}-150x150.png`;
}
