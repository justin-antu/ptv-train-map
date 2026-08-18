import { memo } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

import { cn } from "../../lib/utils";

interface TextAnimateProps {
  children: string;
  className?: string;
  segmentClassName?: string;
  duration?: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  show: (stagger: number) => ({
    opacity: 1,
    transition: {
      staggerChildren: stagger,
    },
  }),
};

const itemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: "0.3em",
    filter: "blur(3px)",
  },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.26,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

/**
 * A compact adaptation of MagicUI's Text Animate word reveal.
 * Supports heading text and reduced-motion behavior.
 */
export const TextAnimate = memo(function TextAnimate({
  children,
  className,
  segmentClassName,
  duration = 0.32,
}: TextAnimateProps) {
  const shouldReduceMotion = useReducedMotion();
  const segments = children.split(/(\s+)/);

  if (shouldReduceMotion) {
    return <h1 className={className}>{children}</h1>;
  }

  return (
    <motion.h1
      aria-label={children}
      className={className}
      custom={duration / segments.length}
      initial="hidden"
      animate="show"
      variants={containerVariants}
    >
      {segments.map((segment, index) => (
        <motion.span
          aria-hidden="true"
          className={cn("inline-block whitespace-pre", segmentClassName)}
          key={`${segment}-${index}`}
          variants={itemVariants}
        >
          {segment}
        </motion.span>
      ))}
    </motion.h1>
  );
});
