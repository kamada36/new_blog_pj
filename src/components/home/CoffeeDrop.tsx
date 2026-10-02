import type { CSSProperties } from "react";

/** 「落ちる → 着水 → 小さく跳ね返る」までにかかる時間。波紋や後続の演出はこの時間を起点にタイミングを合わせる。 */
export const COFFEE_DROP_FALL_MS = 550;

/**
 * コーヒーの一滴が水面に落ちて波紋が広がる演出。
 * 親要素(position: relative)の中で、left/top で指定した位置が「着水点」になる。
 * hooks を使わないので、サーバーコンポーネント・クライアントコンポーネントのどちらからでも使える。
 */
export function CoffeeDrop({
  delayMs = 0,
  rippleWidth = 260,
  style,
  className = "",
}: {
  delayMs?: number;
  rippleWidth?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`coffee-drop ${className}`}
      style={{ ...style, "--drop-delay": `${delayMs}ms`, "--ripple-w": `${rippleWidth}px` } as CSSProperties}
    >
      <span className="coffee-drop-bead" />
      <span className="coffee-drop-rebound" />
      {[0, 1, 2].map((ring) => (
        <span key={ring} className="coffee-ripple" style={{ "--ring": ring } as CSSProperties} />
      ))}
    </span>
  );
}
