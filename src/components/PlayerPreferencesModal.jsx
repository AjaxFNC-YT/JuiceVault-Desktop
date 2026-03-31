import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X, RotateCcw } from "lucide-react";
import { usePlayer } from "@/stores/playerStore";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { useIsMobile } from "@/hooks/useMobile";

const EQ_PARAMS = [
  { key: "bass", label: "BASS", min: -20, max: 20, step: 0.5, unit: "dB" },
  { key: "mid", label: "MID", min: -20, max: 20, step: 0.5, unit: "dB" },
  { key: "treble", label: "TREBLE", min: -20, max: 20, step: 0.5, unit: "dB" },
  { key: "reverb", label: "REVERB", min: 0, max: 100, step: 1, unit: "%" },
  { key: "gain", label: "GAIN", min: -20, max: 20, step: 0.5, unit: "dB" },
];

function VerticalSlider({ label, value, min, max, step, unit, accent, onChange }) {
  const a0 = hexToRgb(accent[0]);
  const trackRef = useRef(null);
  const pct = ((value - min) / (max - min)) * 100;
  const isCenter = min < 0;
  const centerPct = isCenter ? ((0 - min) / (max - min)) * 100 : 0;
  const thumbPx = 10;

  const calcFromY = useCallback((clientY) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const raw = min + ratio * (max - min);
    return Math.max(min, Math.min(max, Math.round(raw / step) * step));
  }, [min, max, step, value]);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(calcFromY(e.clientY));
    const rectSnap = trackRef.current?.getBoundingClientRect();
    const onMove = (ev) => {
      ev.preventDefault();
      if (!rectSnap) return;
      const ratio = 1 - Math.max(0, Math.min(1, (ev.clientY - rectSnap.top) / rectSnap.height));
      const raw = min + ratio * (max - min);
      onChange(Math.max(min, Math.min(max, Math.round(raw / step) * step)));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [calcFromY, onChange, min, max, step]);

  const displayVal = unit === "%" ? `${Math.round(value)}%` : `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(1)}`;

  return (
    <div className="flex flex-col items-center gap-2 select-none" style={{ width: 52 }}>
      <span className="text-[9px] font-mono text-white/40 tabular-nums h-3 flex items-center justify-center" style={{ minWidth: 40 }}>
        {displayVal}{unit !== "%" ? "dB" : ""}
      </span>

      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        className="relative h-44 rounded-full cursor-pointer overflow-hidden"
        style={{ width: 24, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", touchAction: "none" }}
      >
        {isCenter && (
          <div className="absolute left-1 right-1 h-px bg-white/15 z-10 pointer-events-none" style={{ bottom: `${centerPct}%` }} />
        )}

        <div
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{
            height: `${pct}%`,
            background: `linear-gradient(to top, rgba(${a0},0.35), rgba(${a0},0.08))`,
          }}
        />

        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-10"
          style={{
            bottom: `clamp(2px, calc(${pct}% - 5px), calc(100% - 10px))`,
            width: 18,
            height: 8,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${accent[0]}, ${accent[1]})`,
            boxShadow: `0 0 10px rgba(${a0},0.5), 0 0 3px rgba(${a0},0.3)`,
          }}
        />
      </div>

      <span className="text-[9px] font-semibold text-white/50 tracking-wider">{label}</span>
    </div>
  );
}

function PlayerPreferencesModal({ onClose }) {
  const isMobile = useIsMobile();
  const { setEQ, getEQ, setCrossfade, getCrossfade, ensureAnalyser } = usePlayer();
  const { theme } = useTheme();

  const [eq, setEqLocal] = useState(() => {
    const saved = getEQ();
    return {
      bass: saved.bass || 0,
      mid: saved.mid || 0,
      treble: saved.treble || 0,
      reverb: saved.reverb || 0,
      gain: saved.gain || 0,
    };
  });
  const [crossfade, setCrossfadeLocal] = useState(getCrossfade());

  const handleEqChange = useCallback((param, value) => {
    ensureAnalyser();
    setEqLocal((prev) => ({ ...prev, [param]: value }));
    setEQ(param, value);
  }, [setEQ, ensureAnalyser]);

  const handleReset = useCallback(() => {
    EQ_PARAMS.forEach((p) => {
      const def = p.key === "reverb" ? 0 : 0;
      handleEqChange(p.key, def);
    });
  }, [handleEqChange]);

  const handleCrossfadeChange = useCallback((e) => {
    const val = parseInt(e.target.value);
    setCrossfadeLocal(val);
    setCrossfade(val);
  }, [setCrossfade]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className={`overflow-hidden flex flex-col ${isMobile ? 'w-full h-full' : 'w-full max-w-[520px] rounded-2xl'}`}
        style={{ background: `linear-gradient(180deg, rgba(${hexToRgb(theme.accent[1])}, 0.15) 0%, rgba(${hexToRgb(theme.accent[1])}, 0.05) 100%), #111113`, border: isMobile ? 'none' : `1px solid rgba(${hexToRgb(theme.accent[1])}, 0.18)`, boxShadow: isMobile ? 'none' : `0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(${hexToRgb(theme.accent[1])}, 0.08)` }}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.06]" style={isMobile ? { paddingTop: "max(16px, env(safe-area-inset-top, 16px))" } : undefined}>
          <h2 className="text-lg font-bold text-white">Player Preferences</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="text-white/30 hover:text-white/60 transition-colors p-1" title="Reset EQ">
              <RotateCcw size={14} />
            </button>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 sm:px-6 py-5 overflow-y-auto" style={isMobile ? { paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" } : undefined}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-4">Equalizer</p>

          <div className="flex items-center justify-center gap-5">
            {EQ_PARAMS.map((p) => (
              <VerticalSlider
                key={p.key}
                label={p.label}
                value={eq[p.key]}
                min={p.min}
                max={p.max}
                step={p.step}
                unit={p.unit}
                accent={theme.accent}
                onChange={(v) => handleEqChange(p.key, v)}
              />
            ))}
          </div>

          {!isMobile && (
            <div className="mt-6 pt-5 border-t border-white/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Crossfade</p>
              <div className="flex items-center gap-4">
                <span className="text-[12px] text-white/40 min-w-[28px]">Off</span>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={crossfade}
                  onChange={handleCrossfadeChange}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${theme.accent[0]} ${(crossfade / 12) * 100}%, rgba(255,255,255,0.1) ${(crossfade / 12) * 100}%)`,
                    accentColor: theme.accent[0],
                  }}
                />
                <span className="text-[12px] text-white/40 min-w-[28px] text-right">12s</span>
              </div>
              <p className="text-[11px] text-white/25 mt-1.5 text-center">
                {crossfade === 0 ? "Crossfade disabled" : `${crossfade} second${crossfade !== 1 ? "s" : ""} crossfade`}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default PlayerPreferencesModal;
