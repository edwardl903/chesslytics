import { useEffect, useMemo, useState } from 'react';
import { CHESS_QUOTES, type ChessQuote } from '@/lib/quotes';

interface Props {
  active: boolean;
}

/**
 * Animated chess quote carousel shown while the backend is generating the
 * Wrapped. Cycles every 10s with a fade in/out per quote.
 */
export default function ChessQuotes({ active }: Props) {
  const shuffled = useMemo<ChessQuote[]>(() => {
    if (!active) return [];
    return [...CHESS_QUOTES].sort(() => Math.random() - 0.5);
  }, [active]);

  const [index, setIndex] = useState(0);
  const [contentVisible, setContentVisible] = useState(false);
  const [containerVisible, setContainerVisible] = useState(false);

  // Container fades in/out on activation toggle.
  useEffect(() => {
    if (!active) {
      setContainerVisible(false);
      return;
    }
    const id = window.setTimeout(() => setContainerVisible(true), 100);
    return () => window.clearTimeout(id);
  }, [active]);

  // Quote rotation: 10s interval; fade out for 300ms, then swap and fade in.
  useEffect(() => {
    if (!active || shuffled.length === 0) return;

    setIndex(0);
    setContentVisible(false);
    const showFirst = window.setTimeout(() => setContentVisible(true), 50);

    const rotateId = window.setInterval(() => {
      setContentVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % shuffled.length);
        setContentVisible(true);
      }, 300);
    }, 10_000);

    return () => {
      window.clearTimeout(showFirst);
      window.clearInterval(rotateId);
    };
  }, [active, shuffled]);

  if (!active || shuffled.length === 0) return null;
  const quote = shuffled[index];

  return (
    <div
      id="chessQuote"
      className="chess-quotes"
      style={{
        opacity: containerVisible ? 1 : 0,
        transform: containerVisible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}
    >
      <div
        className="chess-quotes-text"
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {quote.text}
      </div>
      <div
        className="chess-quotes-author"
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? 'translateY(0)' : 'translateY(-10px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        · {quote.author}
      </div>
    </div>
  );
}
