import React, { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type DynamicIslandIconMode = 'locked' | 'unlocked';
type DynamicIslandActivity = 'idle' | 'pulse';

type DynamicIslandProps = {
  iconMode?: DynamicIslandIconMode;
  activity?: DynamicIslandActivity;
  shakeKey?: number;
  visible?: boolean;
  className?: string;
};

export function DynamicIsland({
  iconMode = 'locked',
  activity = 'idle',
  shakeKey = 0,
  visible = true,
  className = '',
}: DynamicIslandProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();

  const widthTarget = activity === 'pulse' ? 190 : 132;
  const scaleTarget = activity === 'pulse' ? 1.02 : 1;

  const shakeFrames = useMemo(() => {
    if (reduceMotion || shakeKey <= 0) return 0;
    return [0, -8, 8, -6, 6, -3, 3, 0];
  }, [reduceMotion, shakeKey]);

  const transition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 230,
            damping: 24,
            mass: 0.72,
          },
    [reduceMotion],
  );

  return (
    <div className={`dynamicIslandPortal ${className}`.trim()} aria-hidden="true">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key="island"
            initial={reduceMotion ? undefined : { opacity: 0, y: -10, scale: 0.94, filter: 'blur(6px)' }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -12, scale: 0.9, filter: 'blur(10px)' }}
            transition={transition}
          >
            <motion.div
              className={`dynamicIsland dynamicIsland--${iconMode}${activity === 'pulse' ? ' isPulse' : ''}`}
              initial={false}
              animate={{ width: widthTarget, scale: scaleTarget, x: shakeFrames }}
              transition={{
                width: transition,
                scale: transition,
                x: reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 0.64,
                      times: [0, 0.13, 0.27, 0.41, 0.55, 0.72, 0.86, 1],
                      ease: 'easeInOut',
                    },
              }}
            >
              <span className="dynamicIslandIcon" aria-hidden="true">
                {iconMode === 'locked' ? (
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="9" rx="4" />
                    <path d="M8 11V8a4 4 0 018 0v3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="9" rx="4" />
                    <path d="M8 11V8a4 4 0 117.1-2.8" />
                  </svg>
                )}
              </span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
