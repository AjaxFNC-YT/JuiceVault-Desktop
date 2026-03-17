import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Minimize2, SlidersHorizontal, Info, Download, FolderOpen, Check, Music2, Radio, Users,
} from "lucide-react";
import { usePlayer } from "@/stores/playerStore";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { downloadFile, showInExplorer, voteSkipRadio } from "@/lib/api";
import PlayerPreferencesModal from "@/components/PlayerPreferencesModal";

const CDN = "https://api.juicevault.xyz";

function fmt(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function FullscreenPlayer({ onClose, onInfo, onAddToPlaylist }) {
  const {
    state, analyserRef, analyserReady, ensureAnalyser,
    togglePlay, skipNext, skipPrev, seek, startSeek, endSeek,
    setVolume, toggleShuffle, cycleRepeat, refreshRadio,
  } = usePlayer();
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);

  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null);
  const coverImgRef = useRef(null);
  const animFrameRef = useRef(0);
  const gradientRef = useRef(null);
  const progressRef = useRef(null);
  const volRef = useRef(null);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const [showWaveform, setShowWaveform] = useState(true);
  const showWaveformRef = useRef(true);
  const [showPrefs, setShowPrefs] = useState(false);

  const track = state.currentTrack;
  const cover = track?.cover ? (track.local ? track.cover : `${CDN}${track.cover}`) : null;
  const pct = state.duration > 0 ? (state.progress / state.duration) * 100 : 0;

  useEffect(() => { ensureAnalyser(); }, [ensureAnalyser]);

  useEffect(() => {
    if (!cover) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = cover;
    img.onload = () => { coverImgRef.current = img; drawStaticBg(); };
    img.onerror = () => { coverImgRef.current = null; };
  }, [cover]);

  const drawStaticBg = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    offCtx.fillStyle = "#0a0a0f";
    offCtx.fillRect(0, 0, w, h);

    const img = coverImgRef.current;
    if (img) {
      offCtx.save();
      offCtx.globalAlpha = 0.08;
      const s = Math.max(w / img.width, h / img.height) * 1.1;
      offCtx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      offCtx.restore();
    }

    bgCanvasRef.current = offscreen;
    gradientRef.current = null;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(offscreen, 0, 0);
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;

      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, w, h);
      }

      if (showWaveformRef.current) {
        if (!gradientRef.current) {
          const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
          grad.addColorStop(0, theme.accent[1]);
          grad.addColorStop(1, theme.accent[0]);
          gradientRef.current = grad;
        }
        ctx.fillStyle = gradientRef.current;
        const barWidth = (w / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * (h * 0.3);
          ctx.fillRect(x, h - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      }
    };
    draw();
  }, [analyserRef, theme]);

  useEffect(() => { gradientRef.current = null; }, [theme]);

  useEffect(() => {
    if (analyserReady) {
      cancelAnimationFrame(animFrameRef.current);
      drawWaveform();
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [analyserReady, state.isPlaying, drawWaveform]);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      drawStaticBg();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawStaticBg]);

  useEffect(() => {
    requestAnimationFrame(() => setCanvasVisible(true));
    return () => { setCanvasVisible(false); cancelAnimationFrame(animFrameRef.current); };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const seekFromPointer = useCallback((clientX) => {
    if (!progressRef.current || !state.duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(ratio * state.duration);
  }, [state.duration, seek]);

  const handleSeekDown = useCallback((e) => {
    e.preventDefault();
    startSeek();
    seekFromPointer(e.clientX);
    const onMove = (ev) => seekFromPointer(ev.clientX);
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (progressRef.current && state.duration) {
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        endSeek(ratio * state.duration);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [seekFromPointer, startSeek, endSeek, state.duration]);

  const handleVolDown = useCallback((e) => {
    e.preventDefault();
    const calc = (ev) => {
      if (!volRef.current) return;
      const rect = volRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    };
    const v = calc(e);
    if (v !== undefined) setVolume(v);
    const onMove = (ev) => { const v2 = calc(ev); if (v2 !== undefined) setVolume(v2); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [setVolume]);

  const RepeatIcon = state.repeat === "one" ? Repeat1 : Repeat;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: canvasVisible ? 1 : 0, transition: "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
      />

      <div className="relative z-10 flex flex-col h-full">
        {state.isRadio && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-2.5 px-5 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.08)", border: `1px solid rgba(${a0},0.2)`, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: theme.accent[0] }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: theme.accent[0] }} />
              </span>
              <span className="text-[12px] font-semibold text-white/90">Live from Radio</span>
              <span className="w-px h-3 bg-white/10" />
              <span className="flex items-center gap-1 text-[11px] text-white/50">
                <Users size={11} />
                {state.radioData?.listeners || 0} listening
              </span>
            </div>
          </div>
        )}

        <div className="absolute top-14 left-6 z-20 flex gap-2">
          <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => setShowPrefs(true)} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title="Player Preferences">
            <SlidersHorizontal size={18} />
          </button>
        </div>

        <div className="absolute top-14 right-6 z-20 flex gap-2">
          {!track?.local && (
            <button onClick={() => track && onInfo?.(track.id)} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title="Song Info">
              <Info size={18} />
            </button>
          )}
          <button onClick={() => { if (!track) return; if (track.local && track.path) showInExplorer(track.path).catch(() => {}); else downloadFile(`/music/download/${track.id}`, `${track.title || track.id}.mp3`); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title={track?.local ? "Open in Explorer" : "Download"}>
            {track?.local ? <FolderOpen size={18} /> : <Download size={18} />}
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 pb-24">
          <div className="w-[min(400px,50vw)] aspect-square rounded-3xl overflow-hidden flex-shrink-0" style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                <Music2 size={48} className="text-white/15" />
              </div>
            )}
          </div>
          <div className="text-center max-w-[500px]">
            <p className="text-3xl font-black text-white" style={{ wordBreak: "break-word" }}>{track?.title || "No track playing"}</p>
            <p className="text-lg text-white/70 mt-2" style={{ wordBreak: "break-word" }}>{track?.artist || "—"}</p>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center px-8 py-2 gap-1" style={{ background: `linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.7)), linear-gradient(to top, rgba(${a1},0.25), rgba(${a0},0.12))`, borderTop: `1px solid rgba(${a1},0.25)`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
          <div className="relative flex items-center justify-center w-full">
            <div className="flex items-center gap-1">
              {state.isRadio ? (
                <>
                  <button onClick={togglePlay} className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                    {state.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button onClick={async () => { try { await voteSkipRadio(); setTimeout(() => refreshRadio(), 1500); } catch (e) { console.error("Vote skip failed:", e); } }} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title="Vote to skip">
                    <SkipForward size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={toggleShuffle}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105 ${state.shuffle ? '' : 'text-white/60 hover:text-white'}`}
                    style={state.shuffle ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", color: theme.accent[0] } : { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <Shuffle size={16} />
                  </button>
                  <button onClick={skipPrev} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <SkipBack size={16} fill="currentColor" />
                  </button>
                  <button onClick={togglePlay} className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                    {state.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <button onClick={skipNext} className="w-9 h-9 rounded-lg flex items-center justify-center text-white/70 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <SkipForward size={16} fill="currentColor" />
                  </button>
                  <button
                    onClick={cycleRepeat}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105 ${state.repeat !== "off" ? '' : 'text-white/60 hover:text-white'}`}
                    style={state.repeat !== "off" ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", color: theme.accent[0] } : { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
                  >
                    <RepeatIcon size={16} />
                  </button>
                </>
              )}
            </div>

            <div className="absolute right-0 flex items-center gap-1">
              <button onClick={() => track && onAddToPlaylist?.({ id: track.id, title: track.title, artist: track.artist, cover: track.cover })} className="w-10 h-10 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-all hover:scale-105" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }} title="Add to Playlist">
                <Check size={18} />
              </button>
              <button
                onClick={() => { showWaveformRef.current = !showWaveform; setShowWaveform(!showWaveform); }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 ${showWaveform ? '' : 'text-white/60 hover:text-white'}`}
                style={showWaveform ? { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)", color: theme.accent[0] } : { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {showWaveform ? <path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" /> : <path d="M2 12h20" />}
                </svg>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setVolume(state.volume > 0 ? 0 : 0.7)} className="text-white/60 hover:text-white transition-colors p-1">
                  {state.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <div
                  ref={volRef}
                  onPointerDown={handleVolDown}
                  className="relative h-1 w-20 rounded-sm group cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                >
                  <div className="h-full rounded-sm" style={{ width: `${state.volume * 100}%`, background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${state.volume * 100}% - 6px)` }} />
                </div>
              </div>
            </div>
          </div>

          {state.isRadio ? (
            <div className="flex items-center gap-3 w-full max-w-[720px]">
              <span className="text-xs text-white/50 min-w-[35px] text-right" style={{ fontFamily: "monospace" }}>{fmt(state.progress)}</span>
              <div className="relative h-1 flex-1 rounded-sm" style={{ background: "rgba(255,255,255,0.2)" }}>
                <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})`, transition: "width 1s linear" }} />
              </div>
              <span className="text-xs text-white/50 min-w-[35px]" style={{ fontFamily: "monospace" }}>{fmt(state.duration)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 w-full max-w-[720px]">
              <span className="text-xs text-white/50 min-w-[35px] text-right" style={{ fontFamily: "monospace" }}>{fmt(state.progress)}</span>
              <div
                ref={progressRef}
                onPointerDown={handleSeekDown}
                className="relative h-1 flex-1 rounded-sm group cursor-pointer"
                style={{ background: "rgba(255,255,255,0.2)", touchAction: "none" }}
              >
                <div className="h-full rounded-sm transition-colors" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})` }} />
                <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }} />
              </div>
              <span className="text-xs text-white/50 min-w-[35px]" style={{ fontFamily: "monospace" }}>-{fmt(state.duration - state.progress)}</span>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {showPrefs && <PlayerPreferencesModal onClose={() => setShowPrefs(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

export default FullscreenPlayer;
