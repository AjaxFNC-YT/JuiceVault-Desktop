import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Download, Film, Loader2,
} from "lucide-react";
import { downloadFile, logMediaView } from "@/lib/api";
import { useTheme } from "@/stores/themeStore";

const CDN = "https://api.juicevault.xyz";

function fmt(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function MediaViewer({ item, onClose }) {
  const { theme } = useTheme();
  const isVideo = item.type?.startsWith("video/");
  const isImage = item.type?.startsWith("image/");
  const streamUrl = `${CDN}/media/stream/${item.id}`;
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (item?.id) logMediaView(item.id).catch(() => {});
  }, [item?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadFile(`/media/download/${item.id}`, item.file_name || `media_${item.id}`);
    } catch {} finally {
      setDownloading(false);
    }
  };

  if (isImage) {
    return (
      <motion.div
        className="fixed inset-0 top-9 z-[10000] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative z-10 flex flex-col rounded-2xl bg-surface-800 border border-white/[0.08] shadow-2xl overflow-hidden max-w-[85vw] max-h-[85vh]"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="min-w-0 flex-1 mr-4">
              <p className="text-[13px] font-semibold text-white/80 truncate">{item.title || item.file_name}</p>
              <p className="text-[11px] text-white/30 mt-0.5">{item.file_size}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                title="Save to disk"
              >
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center p-4 bg-black/30">
            <img
              src={streamUrl}
              alt=""
              className="max-h-[70vh] max-w-full object-contain rounded-lg select-none"
              draggable={false}
            />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (isVideo) {
    return (
      <motion.div
        className="fixed inset-0 top-9 z-[10000] flex flex-col bg-[#0a0a0a]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <VideoPlayer src={streamUrl} item={item} onClose={onClose} onDownload={handleDownload} downloading={downloading} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 top-9 z-[10000] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 text-center rounded-2xl bg-surface-800 border border-white/[0.08] p-8">
        <Film size={40} className="text-white/15 mx-auto mb-3" />
        <p className="text-white/40 text-sm mb-1">{item.title || item.file_name}</p>
        <p className="text-white/20 text-[11px] mb-4">Cannot preview this file type</p>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="px-4 py-2 rounded-xl text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
          style={{ background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})` }}
        >
          {downloading ? "Saving..." : "Save to disk"}
        </button>
      </div>
    </motion.div>
  );
}

function VideoPlayer({ src, item, onClose, onDownload, downloading }) {
  const { theme } = useTheme();
  const videoRef = useRef(null);
  const seekRef = useRef(null);
  const volRef = useRef(null);
  const wrapRef = useRef(null);
  const hideTimer = useRef(null);
  const clickTimer = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setProgress(v.currentTime);
    const onDur = () => setDuration(v.duration);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onBuf = () => { if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1)); };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("progress", onBuf);
    return () => { v.removeEventListener("timeupdate", onTime); v.removeEventListener("loadedmetadata", onDur); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); v.removeEventListener("progress", onBuf); };
  }, []);

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 600);
  }, []);
  const toggleMute = useCallback(() => { const v = videoRef.current; if (!v) return; v.muted = !v.muted; setMuted(!muted); }, [muted]);
  const skip = useCallback((s) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(duration, v.currentTime + s)); }, [duration]);
  const toggleFs = useCallback(() => { if (!wrapRef.current) return; document.fullscreenElement ? document.exitFullscreen() : wrapRef.current.requestFullscreen().catch(() => {}); }, []);

  const cycleSpeed = useCallback(() => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }, [speed]);

  const handleVideoClick = useCallback((e) => {
    if (e.target !== e.currentTarget && e.target.tagName !== "VIDEO") return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggleFs();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        togglePlay();
      }, 250);
    }
  }, [togglePlay, toggleFs]);

  const seekDrag = useDragBar(seekRef, (r) => { const v = videoRef.current; if (v) { v.currentTime = r * duration; setProgress(r * duration); } });
  const volDrag = useDragBar(volRef, (r) => { const v = videoRef.current; if (v) { v.volume = r; setVolumeState(r); if (r > 0) setMuted(false); } });

  const handleSeekHover = useCallback((e) => {
    if (!seekRef.current || !duration) return;
    const rect = seekRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
    setHoverX(e.clientX - rect.left);
  }, [duration]);

  const resetHide = () => { setShowControls(true); clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000); };

  useEffect(() => {
    if (playing) { hideTimer.current = setTimeout(() => setShowControls(false), 3000); }
    else { setShowControls(true); clearTimeout(hideTimer.current); }
    return () => clearTimeout(hideTimer.current);
  }, [playing]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowLeft") skip(-5);
      if (e.key === "ArrowRight") skip(5);
      if (e.key === "j") skip(-10);
      if (e.key === "l") skip(10);
      if (e.key === "m") toggleMute();
      if (e.key === "f") toggleFs();
      if (e.key === "ArrowUp") { e.preventDefault(); const v = videoRef.current; if (v) { const nv = Math.min(1, v.volume + 0.05); v.volume = nv; setVolumeState(nv); } }
      if (e.key === "ArrowDown") { e.preventDefault(); const v = videoRef.current; if (v) { const nv = Math.max(0, v.volume - 0.05); v.volume = nv; setVolumeState(nv); } }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skip, toggleMute, toggleFs]);

  const pct = duration > 0 ? (progress / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div ref={wrapRef} className="flex-1 flex flex-col relative" onMouseMove={resetHide} style={{ cursor: showControls ? "default" : "none" }}>
      <div
        className="flex-1 flex items-center justify-center bg-black"
        onClick={handleVideoClick}
      >
        <video ref={videoRef} src={src} className="max-h-full max-w-full object-contain" playsInline />

        <AnimatePresence>
          {showPlayIcon && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0.8, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                {playing ? <Play size={28} className="text-white ml-1" fill="white" /> : <Pause size={28} className="text-white" fill="white" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!playing && progress === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-md hover:bg-white/15 transition-colors pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
              <Play size={32} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}
      </div>

      <motion.div
        className="absolute inset-x-0 top-0 px-4 py-3 flex items-center justify-between pointer-events-none"
        style={{ background: "linear-gradient(rgba(0,0,0,0.7), transparent)" }}
        initial={false}
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="min-w-0 flex-1 mr-4">
          <p className="text-[13px] font-semibold text-white/80 truncate">{item.title || item.file_name}</p>
          <p className="text-[11px] text-white/30 mt-0.5">{item.file_size}{item.duration ? ` · ${item.duration}` : ""}</p>
        </div>
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={onDownload}
            disabled={downloading}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            title="Save to disk"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-colors">
            <X size={16} />
          </button>
        </div>
      </motion.div>

      <motion.div
        className="absolute inset-x-0 bottom-0 px-5 pb-4 pt-16"
        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85))" }}
        initial={false}
        animate={{ opacity: showControls ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onMouseEnter={() => setShowControls(true)}
      >
        <div
          ref={seekRef}
          onMouseDown={seekDrag}
          onMouseMove={handleSeekHover}
          onMouseLeave={() => setHoverTime(null)}
          className="relative h-1 w-full rounded-full bg-white/[0.12] cursor-pointer mb-3 group/seek hover:h-1.5 transition-all"
        >
          <div className="absolute h-full rounded-full bg-white/[0.06]" style={{ width: `${bufPct}%` }} />
          <div className="absolute h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-lg scale-0 group-hover/seek:scale-100 transition-transform"
            style={{ left: `calc(${pct}% - 7px)` }}
          />
          {hoverTime !== null && (
            <div className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-white tabular-nums pointer-events-none" style={{ left: hoverX }}>
              {fmt(hoverTime)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => skip(-10)} className="text-white/40 hover:text-white transition-colors" title="-10s">
              <SkipBack size={16} />
            </button>
            <button
              onClick={togglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:opacity-90 transition-opacity"
              style={{ background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})` }}
            >
              {playing ? <Pause size={18} className="text-white" fill="white" /> : <Play size={18} className="text-white ml-0.5" fill="white" />}
            </button>
            <button onClick={() => skip(10)} className="text-white/40 hover:text-white transition-colors" title="+10s">
              <SkipForward size={16} />
            </button>
            <span className="text-[11px] text-white/40 tabular-nums ml-1">
              {fmt(progress)} / {fmt(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button onClick={cycleSpeed} className="text-[11px] font-semibold tabular-nums text-white/40 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.08]" title="Playback speed">
              {speed}x
            </button>
            <button onClick={toggleMute} className="text-white/40 hover:text-white transition-colors">
              {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <div
              ref={volRef}
              onMouseDown={volDrag}
              className="relative h-1 w-16 rounded-full bg-white/[0.12] cursor-pointer group/vol"
            >
              <div className="h-full rounded-full bg-white/60" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-white shadow scale-0 group-hover/vol:scale-100 transition-transform"
                style={{ left: `calc(${(muted ? 0 : volume) * 100}% - 5px)` }}
              />
            </div>
            <button onClick={toggleFs} className="text-white/40 hover:text-white transition-colors ml-1">
              {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function useDragBar(ref, onChange) {
  const dragging = useRef(false);

  const calc = useCallback((e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, [ref]);

  const onDown = useCallback((e) => {
    dragging.current = true;
    const v = calc(e);
    if (v !== undefined) onChange(v);
    e.preventDefault();
    e.stopPropagation();
  }, [calc, onChange]);

  useEffect(() => {
    const onMove = (e) => { if (dragging.current) { const v = calc(e); if (v !== undefined) onChange(v); } };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [calc, onChange]);

  return onDown;
}

export default MediaViewer;
