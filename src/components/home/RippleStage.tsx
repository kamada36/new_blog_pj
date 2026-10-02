"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CoffeeDrop } from "./CoffeeDrop";

type Drop = { id: number; x: number; y: number };

const MAX_DROPS = 5;
const DROP_LIFETIME_MS = 2800;
/** 自動で落ちる一滴: 冒頭の演出が落ち着いてから始め、以降はこの間隔でランダムな位置に落とす。 */
const AUTO_DROP_START_MS = 4500;
const AUTO_DROP_INTERVAL_MS = 5000;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * コーヒーの一滴を落として波紋を広げるセクション。
 * クリック(タップ)した位置に加えて、一定間隔でランダムな位置にも自動で落ちる。
 * リンクやボタンの操作は邪魔しないよう、それらの上で押されたときは何もしない。
 */
export function RippleStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [drops, setDrops] = useState<Drop[]>([]);
  const nextId = useRef(0);
  const stageRef = useRef<HTMLElement>(null);

  function addDrop(x: number, y: number) {
    const drop = { id: nextId.current++, x, y };
    setDrops((prev) => [...prev.slice(-(MAX_DROPS - 1)), drop]);
    window.setTimeout(() => setDrops((prev) => prev.filter((d) => d.id !== drop.id)), DROP_LIFETIME_MS);
  }

  useEffect(() => {
    if (prefersReducedMotion()) return;

    let intervalId: number | undefined;
    const dropAtRandom = () => {
      const stage = stageRef.current;
      if (!stage || document.visibilityState !== "visible") return;
      const { width, height } = stage.getBoundingClientRect();
      addDrop(width * (0.08 + Math.random() * 0.84), height * (0.15 + Math.random() * 0.75));
    };
    const startId = window.setTimeout(() => {
      dropAtRandom();
      intervalId = window.setInterval(dropAtRandom, AUTO_DROP_INTERVAL_MS);
    }, AUTO_DROP_START_MS);

    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a, button")) return;
    if (prefersReducedMotion()) return;

    const rect = event.currentTarget.getBoundingClientRect();
    addDrop(event.clientX - rect.left, event.clientY - rect.top);
  }

  return (
    <section ref={stageRef} className={className} onPointerDown={handlePointerDown}>
      {children}
      {drops.map((drop) => (
        <CoffeeDrop key={drop.id} rippleWidth={200} style={{ left: drop.x, top: drop.y }} />
      ))}
    </section>
  );
}
