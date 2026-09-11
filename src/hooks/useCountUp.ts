/**
 * Ease a displayed number from its previous value to a new one.
 *
 * Only animates on change, never on first mount: counting a portfolio up
 * from zero every launch is theatre, but watching the total tick to its new
 * value after a refresh tells you something actually moved.
 */

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from './useReducedMotion';

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export function useCountUp(target: number, duration = 650): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (reduced || from === target || !Number.isFinite(from)) {
      shownRef.current = target;
      setShown(target);
      return;
    }

    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const v = from + (target - from) * easeOutCubic(p);
      shownRef.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return shown;
}
