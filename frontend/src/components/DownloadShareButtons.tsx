import { useState, type RefObject } from 'react';
import html2canvas from 'html2canvas';
import { formatWrappedYearFilename, formatWrappedYearPhrase } from '@/lib/yearLabel';

interface Props {
  targetRef: RefObject<HTMLElement | null>;
  username: string;
  year: string;
}

async function waitForImages(el: HTMLElement) {
  const imgs = Array.from(el.getElementsByTagName('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

async function captureCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const cs = getComputedStyle(el);
  let bg = cs.backgroundColor;
  if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
    bg = '#2d6056';
  }
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: bg,
    logging: false,
  });
}

export default function DownloadShareButtons({ targetRef, username, year }: Props) {
  const [working, setWorking] = useState<'download' | 'share' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  async function handleDownload() {
    const el = targetRef.current;
    if (!el) return;
    clearMessages();
    setWorking('download');
    try {
      await waitForImages(el);
      const canvas = await captureCanvas(el);
      const link = document.createElement('a');
      link.download = `${username}_ChessWrapped_${formatWrappedYearFilename(year)}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      setNotice('Image downloaded.');
      window.setTimeout(() => setNotice(null), 4000);
    } catch (err) {
      console.error('Screenshot failed:', err);
      setError('Could not create the image. Try again.');
    } finally {
      setWorking(null);
    }
  }

  async function fallbackClipboard(blob: Blob) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setNotice('Copied to clipboard. Paste it where you like.');
    } catch {
      setError('Clipboard not available. Use Download.');
    }
  }

  async function handleShare() {
    const el = targetRef.current;
    if (!el) return;
    clearMessages();
    setWorking('share');
    try {
      await waitForImages(el);
      const canvas = await captureCanvas(el);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 1.0),
      );
      if (!blob) {
        setError('Could not prepare an image.');
        return;
      }

      const file = new File([blob], `${username}_ChessWrapped_${formatWrappedYearFilename(year)}.png`, {
        type: 'image/png',
      });

      if (navigator.share) {
        try {
          await navigator.share({
            title: `${username}'s Chess Wrapped (${formatWrappedYearPhrase(year)})`,
            text: 'Check out my Chess.com stats!',
            files: [file],
          });
          setNotice('Shared.');
          window.setTimeout(() => setNotice(null), 4000);
          return;
        } catch (shareErr) {
          if ((shareErr as Error).name === 'AbortError') return;
          console.warn('navigator.share failed, trying clipboard', shareErr);
        }
      }

      await fallbackClipboard(blob);
      window.setTimeout(() => setNotice(null), 5000);
    } catch (err) {
      console.error('Share failed:', err);
      setError('Could not share. Try Download.');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="export-actions">
      {(notice || error) && (
        <p className={`export-feedback${error ? ' export-feedback-error' : ''}`} role="status">
          {error ?? notice}
        </p>
      )}
      <div className="export-buttons-row">
        <button
          type="button"
          className="download-button"
          onClick={handleDownload}
          disabled={working !== null}
        >
          {working === 'download' ? 'Saving…' : 'Download as image'}
        </button>
        <button
          type="button"
          className="share-button"
          onClick={handleShare}
          disabled={working !== null}
        >
          {working === 'share' ? 'Preparing…' : 'Share'}
        </button>
      </div>
    </div>
  );
}
