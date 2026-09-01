import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Check, Share2 } from "lucide-react";
import { toBlob } from "html-to-image";
import { APP_TITLE } from "../../config";

const COPIED_MS = 1500;

interface ShareServiceProps {
  cardRef: RefObject<HTMLElement | null>;
}

function captureCard(node: HTMLElement): Promise<Blob> {
  return toBlob(node, {
    pixelRatio: Math.min(window.devicePixelRatio || 2, 2),
    cacheBust: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (element) => !(element instanceof HTMLElement && element.dataset.captureIgnore !== undefined),
  }).then((blob) => {
    if (!blob) throw new Error("Could not capture ticket");
    return blob;
  });
}

/**
 * Copies a PNG of the next-train card and opens the system share sheet when
 * the device can take a file. Clipboard write starts in the click handler
 * with a promised blob so Safari still treats it as a gesture.
 */
export function ShareService({ cardRef }: ShareServiceProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const markCopied = useCallback(() => {
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  }, []);

  const share = useCallback(() => {
    const node = cardRef.current;
    if (!node || copied) return;

    const blobPromise = captureCard(node);

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      void navigator.clipboard
        .write([new ClipboardItem({ "image/png": blobPromise })])
        .then(markCopied)
        .catch(() => {
          // Share can still succeed when clipboard is blocked.
        });
    }

    void blobPromise
      .then(async (blob) => {
        const file = new File([blob], "next-train.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: APP_TITLE });
          markCopied();
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
      });
  }, [cardRef, copied, markCopied]);

  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Ticket copied" : "Share"}
      className="inline-flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right font-mono text-[clamp(0.625rem,2.7vw,0.75rem)] uppercase leading-snug tracking-widest text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      {copied ? (
        <Check className="size-4 text-[hsl(152_55%_48%)]" aria-hidden="true" />
      ) : (
        <>
          <Share2 className="size-3.5 shrink-0" aria-hidden="true" />
          Share
        </>
      )}
    </button>
  );
}
