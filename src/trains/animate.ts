/** Drives a requestAnimationFrame loop, calling `callback(nowMs)` every frame until the returned function is called. */
export function startAnimationLoop(callback: (nowMs: number) => void): () => void {
  let rafId = 0;
  let cancelled = false;

  function frame() {
    if (cancelled) return;
    callback(Date.now());
    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
