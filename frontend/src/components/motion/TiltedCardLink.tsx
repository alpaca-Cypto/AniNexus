"use client";

import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";

const springValues = {
  damping: 30,
  stiffness: 100,
  mass: 0.8,
};

interface TiltedCardLinkProps {
  children: ReactNode;
  href: string;
  className?: string;
  style?: CSSProperties;
  scaleOnHover?: number;
  rotateAmplitude?: number;
}

export default function TiltedCardLink({
  children,
  href,
  className = "",
  style,
  scaleOnHover = 1.025,
  rotateAmplitude = 7,
}: TiltedCardLinkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== "mouse" || prefersReducedMotion || !ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    rotateX.set((0.5 - pointerY) * rotateAmplitude * 2);
    rotateY.set((pointerX - 0.5) * rotateAmplitude * 2);
  };

  const handlePointerEnter = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== "mouse" || prefersReducedMotion) return;
    scale.set(scaleOnHover);
  };

  const handlePointerLeave = () => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <Link
      className={className}
      href={href}
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
        {children}
      </motion.div>
    </Link>
  );
}
