import { motion, useReducedMotion, type MotionStyle, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
  className?: string;
  style?: React.CSSProperties;
  reverse?: boolean;
  initialOffset?: number;
  borderWidth?: number;
}

/**
 * MagicUI Border Beam, kept independent of React state so Motion can run the
 * perimeter animation outside React's render cycle.
 */
export const BorderBeam = ({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1,
}: BorderBeamProps) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-transparent"
      style={
        {
          "--border-beam-width": `${borderWidth}px`,
          borderWidth: "var(--border-beam-width)",
          borderStyle: "solid",
          maskImage: "linear-gradient(transparent,transparent),linear-gradient(#000,#000)",
          maskClip: "padding-box,border-box",
          maskComposite: "intersect",
          WebkitMaskComposite: "source-in, xor",
        } as React.CSSProperties
      }
    >
      <motion.div
        className={cn(
          "absolute aspect-square bg-gradient-to-l from-[var(--color-from)] via-[var(--color-to)] to-transparent",
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            "--color-from": colorFrom,
            "--color-to": colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={
          shouldReduceMotion
            ? undefined
            : {
                offsetDistance: reverse
                  ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
                  : [`${initialOffset}%`, `${100 + initialOffset}%`],
              }
        }
        transition={
          shouldReduceMotion
            ? undefined
            : {
                repeat: Infinity,
                ease: "linear",
                duration,
                delay: -delay,
                ...transition,
              }
        }
      />
    </div>
  );
};
