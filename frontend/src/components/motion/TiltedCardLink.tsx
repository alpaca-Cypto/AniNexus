"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, MouseEventHandler, PointerEvent, ReactNode } from "react";

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 0.8,
};

interface TiltedCardLinkProps {
  cover: ReactNode;
  badge: ReactNode;
  details: ReactNode;
  action: ReactNode;
  href: string;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  scaleOnHover?: number;
  rotateAmplitude?: number;
}

export default function TiltedCardLink({
  cover,
  badge,
  details,
  action,
  href,
  className = "",
  style,
  onClick,
  scaleOnHover = 1.025,
  rotateAmplitude = 7,
}: TiltedCardLinkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || prefersReducedMotion || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    rotateX.set((0.5 - pointerY) * rotateAmplitude * 2);
    rotateY.set((pointerX - 0.5) * rotateAmplitude * 2);
  };

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || prefersReducedMotion) return;
    scale.set(scaleOnHover);
  };

  const handlePointerLeave = () => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      className={className}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      <motion.div
        ref={ref}
        className="search-portal__card-inner"
        style={{ rotateX, rotateY, scale }}
      >
        <div className="search-portal__cover">
          <Link className="search-portal__cover-link" href={href} onClick={onClick}>
            {cover}
          </Link>
          <span>{badge}</span>
          {action}
        </div>
        <Link className="search-portal__card-copy" href={href} onClick={onClick}>
          {details}
        </Link>
      </motion.div>
    </div>
  );
}
