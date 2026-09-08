"use client";

import { useEffect, useRef } from "react";

const magneticSelector = ".workspace-card, .site-card, .admin-add-button, .admin-hero-actions a";
const colors = ["#ffd84a", "#ff6b4a", "#55dbc1", "#6458ed"];
const shapes = ["circle", "diamond", "square"];

export function CursorEffects() {
  const trailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dashboard = document.querySelector<HTMLElement>(".resource-dashboard");
    let frame = 0, lastParticleAt = 0, particleIndex = 0;
    let activeMagnet: HTMLElement | null = null;

    const resetMagnet = (element: HTMLElement) => {
      element.style.translate = "";
      element.style.rotate = "";
      element.style.transition = "translate .5s cubic-bezier(.2,.9,.2,1.25), rotate .5s cubic-bezier(.2,.9,.2,1.25), box-shadow .2s";
      window.setTimeout(() => { element.style.transition = ""; }, 520);
    };

    const onPointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        dashboard?.style.setProperty("--cursor-x", x.toFixed(3));
        dashboard?.style.setProperty("--cursor-y", y.toFixed(3));
      });

      const target = (event.target as Element | null)?.closest<HTMLElement>(magneticSelector) ?? null;
      if (activeMagnet && activeMagnet !== target) resetMagnet(activeMagnet);
      activeMagnet = target;
      if (target) {
        const rect = target.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) / rect.width;
        const y = (event.clientY - rect.top - rect.height / 2) / rect.height;
        target.style.transition = "translate .1s ease-out, rotate .1s ease-out, box-shadow .2s";
        target.style.translate = `${x * 13}px ${y * 13}px`;
        target.style.rotate = `${x * 1.5}deg`;
      }

      const now = performance.now();
      if (!trailRef.current || now - lastParticleAt < 55) return;
      lastParticleAt = now;
      const particle = document.createElement("i");
      particle.className = `cursor-trail-shape ${shapes[particleIndex % shapes.length]}`;
      particle.style.left = `${event.clientX}px`;
      particle.style.top = `${event.clientY}px`;
      particle.style.background = colors[particleIndex % colors.length];
      particle.style.setProperty("--trail-rotation", `${(particleIndex * 37) % 120}deg`);
      particleIndex += 1;
      trailRef.current.appendChild(particle);
      window.setTimeout(() => particle.remove(), 720);
    };

    const onPointerLeave = () => {
      if (activeMagnet) resetMagnet(activeMagnet);
      activeMagnet = null;
      dashboard?.style.setProperty("--cursor-x", "0");
      dashboard?.style.setProperty("--cursor-y", "0");
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      if (activeMagnet) resetMagnet(activeMagnet);
    };
  }, []);

  return <div ref={trailRef} className="cursor-trail-layer" aria-hidden="true" />;
}
