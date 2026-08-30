import { useEffect, useRef, useState } from "react";

/** Drag distance, in pixels, that triggers a refresh once released. */
const TRIGGER_DISTANCE = 72;
/** Damping applied to the drag so the indicator trails the finger. */
const RESISTANCE = 0.45;

export interface PullToRefreshState {
  /** Current indicator offset in pixels. */
  distance: number;
  /** True once the drag has passed the trigger threshold. */
  armed: boolean;
  refreshing: boolean;
}

/**
 * Touch pull-to-refresh for a scrollable element.
 *
 * Only engages at the top of the page and while the gesture is clearly
 * vertical, so it cannot fight the page's own scrolling or a horizontally
 * scrolling table inside it.
 */
export function usePullToRefresh(
  targetRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void> | void,
  enabled = true,
): PullToRefreshState {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const trackingRef = useRef(false);
  // Mirrored so the listeners can read live values without being torn down and
  // rebuilt on every touchmove.
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const element = targetRef.current;
    if (!element || !enabled) return;

    const setDistanceValue = (next: number) => {
      distanceRef.current = next;
      setDistance(next);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      trackingRef.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start || refreshingRef.current) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - start.y;
      const deltaX = touch.clientX - start.x;

      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        if (!trackingRef.current) startRef.current = null;
        return;
      }

      trackingRef.current = true;
      setDistanceValue(Math.min(deltaY * RESISTANCE, TRIGGER_DISTANCE * 1.5));
    };

    const handleTouchEnd = () => {
      const shouldRefresh = trackingRef.current && distanceRef.current >= TRIGGER_DISTANCE;
      startRef.current = null;
      trackingRef.current = false;
      setDistanceValue(0);
      if (!shouldRefresh) return;

      refreshingRef.current = true;
      setRefreshing(true);
      void Promise.resolve(onRefreshRef.current()).finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: true });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [targetRef, enabled]);

  return { distance, armed: distance >= TRIGGER_DISTANCE, refreshing };
}
