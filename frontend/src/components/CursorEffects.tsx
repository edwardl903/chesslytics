import { useEffect } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const CHECKMATE_SYMBOLS = [
  'checkmate-king',
  'checkmate-crown',
  'checkmate-sword',
  'checkmate-star',
];

export default function CursorEffects() {
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;

    const trailElements: HTMLDivElement[] = [];
    let trailTimer: number | null = null;

    function createTrailElement(x: number, y: number) {
      for (let i = trailElements.length - 1; i >= 0; i--) {
        if (trailElements[i].offsetParent === null) {
          trailElements[i].remove();
          trailElements.splice(i, 1);
        }
      }

      const trail = document.createElement('div');
      trail.className = 'cursor-trail';
      trail.style.left = `${x - 3}px`;
      trail.style.top = `${y - 3}px`;
      document.body.appendChild(trail);
      trailElements.push(trail);

      if (Math.random() < 0.4) {
        const symbol = CHECKMATE_SYMBOLS[Math.floor(Math.random() * CHECKMATE_SYMBOLS.length)];
        const checkmateTrail = document.createElement('div');
        checkmateTrail.className = `checkmate-trail ${symbol}`;
        checkmateTrail.style.left = `${x - 6}px`;
        checkmateTrail.style.top = `${y - 6}px`;
        document.body.appendChild(checkmateTrail);
        trailElements.push(checkmateTrail);
      }

      if (Math.random() < 0.2) {
        const knightTrail = document.createElement('div');
        knightTrail.className = 'knight-trail';
        knightTrail.style.left = `${x - 8}px`;
        knightTrail.style.top = `${y - 8}px`;
        document.body.appendChild(knightTrail);
        trailElements.push(knightTrail);
      }

      window.setTimeout(() => trail.remove(), 2500);
    }

    function createClickEffect(x: number, y: number) {
      const clickEffect = document.createElement('div');
      clickEffect.className = 'click-effect';
      clickEffect.style.left = `${x - 10}px`;
      clickEffect.style.top = `${y - 10}px`;
      document.body.appendChild(clickEffect);
      window.setTimeout(() => clickEffect.remove(), 600);
    }

    function onMouseMove(e: MouseEvent) {
      if (trailTimer !== null) return;
      trailTimer = window.setTimeout(() => {
        createTrailElement(e.clientX, e.clientY);
        trailTimer = null;
      }, 30);
    }

    function onClick(e: MouseEvent) {
      createClickEffect(e.clientX, e.clientY);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('click', onClick);
      if (trailTimer !== null) window.clearTimeout(trailTimer);
      trailElements.forEach((el) => el.remove());
    };
  }, [reduceMotion]);

  return null;
}
