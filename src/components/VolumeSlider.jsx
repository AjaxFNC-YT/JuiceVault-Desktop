import { useCallback, useEffect, useRef, useState } from "react";
import { hexToRgb, useTheme } from "@/stores/themeStore";

const SNAP_POINTS = [0.05, 0.25, 0.5, 0.75];
const SNAP_RADIUS = 0.025;
const SNAP_RELEASE_RADIUS = 0.045;

function applyVolumeCurve(position, curve) {
  return Math.pow(Math.max(0, Math.min(1, position)), Math.max(0.5, Math.min(2, curve || 1)));
}

function removeVolumeCurve(volume, curve) {
  return Math.pow(Math.max(0, Math.min(1, volume)), 1 / Math.max(0.5, Math.min(2, curve || 1)));
}

function getSnappedVolume(rawValue, lockedSnap, snapEnabled) {
  if (!snapEnabled) return { value: rawValue, lockedSnap: null };
  if (lockedSnap != null && Math.abs(rawValue - lockedSnap) <= SNAP_RELEASE_RADIUS) {
    return { value: lockedSnap, lockedSnap };
  }

  const nearestSnap = SNAP_POINTS.find((point) => Math.abs(rawValue - point) <= SNAP_RADIUS);
  if (nearestSnap != null) {
    return { value: nearestSnap, lockedSnap: nearestSnap };
  }

  return { value: rawValue, lockedSnap: null };
}

function VolumeSlider({ value, onChange, snapEnabled = true, curve = 1, className = "w-32", heightClass = "h-1" }) {
  const { theme } = useTheme();
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const snapLockRef = useRef(null);
  const [active, setActive] = useState(false);
  const safeValue = Math.max(0, Math.min(1, value || 0));
  const percent = Math.round(safeValue * 100);
  const sliderPercent = removeVolumeCurve(safeValue, curve) * 100;
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);

  const setFromPointer = useCallback((event) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const rawPosition = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const rawValue = applyVolumeCurve(rawPosition, curve);
    const snapped = getSnappedVolume(rawValue, snapLockRef.current, snapEnabled);
    snapLockRef.current = snapped.lockedSnap;
    onChange?.(snapped.value);
  }, [curve, onChange, snapEnabled]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
    snapLockRef.current = null;
    setActive(true);
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    setFromPointer(event);
  }, [setFromPointer]);

  const handlePointerMove = useCallback((event) => {
    if (!draggingRef.current) return;
    event.preventDefault();
    setFromPointer(event);
  }, [setFromPointer]);

  const stopDragging = useCallback((event) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    snapLockRef.current = null;
    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
    setActive(false);
  }, []);

  useEffect(() => {
    const handleWindowUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      snapLockRef.current = null;
      setActive(false);
    };

    window.addEventListener("pointerup", handleWindowUp);
    window.addEventListener("pointercancel", handleWindowUp);
    return () => {
      window.removeEventListener("pointerup", handleWindowUp);
      window.removeEventListener("pointercancel", handleWindowUp);
    };
  }, []);

  return (
    <div
      className={`group relative flex h-8 items-center ${className}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { if (!draggingRef.current) setActive(false); }}
    >
      <div
        className={`pointer-events-none absolute -top-7 -translate-x-1/2 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums text-white shadow-lg transition-all ${active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
        style={{
          left: `clamp(18px, ${sliderPercent}%, calc(100% - 18px))`,
          background: `linear-gradient(135deg, rgba(${a1}, 0.32), rgba(12, 14, 20, 0.94))`,
          borderColor: `rgba(${a1}, 0.28)`,
        }}
      >
        {percent}%
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 0.05 : -0.05;
          onChange?.(Math.max(0, Math.min(1, (value || 0) + delta)));
        }}
        className={`relative w-full touch-none cursor-pointer rounded-full bg-white/[0.08] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/20 ${heightClass}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${sliderPercent}%`,
            background: `linear-gradient(to right, rgba(${a1}, 0.72), rgba(${a0}, 1))`,
          }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.22)] transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${sliderPercent}% - 6px)`, opacity: active ? 1 : 0 }}
        />
      </div>
    </div>
  );
}

export default VolumeSlider;

