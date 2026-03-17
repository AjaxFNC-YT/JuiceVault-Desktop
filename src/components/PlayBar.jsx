import { useRef, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { SkipBack, Play, Pause, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Music2, Maximize2, Download, FolderOpen, Info, Radio, Users, ListPlus, SlidersHorizontal } from "lucide-react";
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

function useDragSlider(ref, onChange, { onStart, onEnd } = {}) {
  const dragging = useRef(false);
  const lastVal = useRef(0);

  const calc = useCallback((e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, [ref]);

  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  onStartRef.current = onStart;
  onEndRef.current = onEnd;

  const onDown = useCallback((e) => {
    dragging.current = true;
    onStartRef.current?.();
    const v = calc(e);
    if (v !== undefined) { lastVal.current = v; onChange(v); }
    e.preventDefault();
  }, [calc, onChange]);

  useEffect(() => {
    const onMove = (e) => { if (dragging.current) { const v = calc(e); if (v !== undefined) { lastVal.current = v; onChange(v); } } };
    const onUp = () => { if (dragging.current) { dragging.current = false; onEndRef.current?.(lastVal.current); } };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [calc, onChange]);

  return onDown;
}

function PlayBar({ onFullscreen, onInfo, onAddToPlaylist }) {
  const { state, togglePlay, skipNext, skipPrev, seek, startSeek, endSeek, setVolume, toggleShuffle, cycleRepeat, stopRadio, refreshRadio } = usePlayer();
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const [showPrefs, setShowPrefs] = useState(false);
  const seekRef = useRef(null);
  const volRef = useRef(null);
  const track = state.currentTrack;
  const cover = track?.cover ? (track.local ? track.cover : `${CDN}${track.cover}`) : null;
  const pct = state.duration > 0 ? (state.progress / state.duration) * 100 : 0;
  const isRadio = state.isRadio;
  const radioListeners = state.radioData?.listeners || 0;

  const onSeekDrag = useDragSlider(seekRef, useCallback((ratio) => {
    seek(ratio * state.duration);
  }, [seek, state.duration]), {
    onStart: startSeek,
    onEnd: useCallback((ratio) => endSeek(ratio * state.duration), [endSeek, state.duration]),
  });

  const onVolDrag = useDragSlider(volRef, useCallback((ratio) => {
    setVolume(ratio);
  }, [setVolume]));

  const RepeatIcon = state.repeat === "one" ? Repeat1 : Repeat;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex h-[76px] items-center px-4"
      style={{
        background: `linear-gradient(135deg, rgba(${a1},0.12) 0%, rgba(${a0},0.08) 50%, rgba(${a1},0.12) 100%), linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.6))`,
        borderTop: `1px solid rgba(${a1},0.2)`,
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        boxShadow: `0 -4px 30px rgba(${a1},0.1), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="flex items-center gap-3 w-[220px] min-w-0">
        <button onClick={onFullscreen} className="h-12 w-12 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/[0.06] transition-colors" style={{ "--tw-border-opacity": 1 }} onMouseEnter={e => e.currentTarget.style.borderColor = `rgba(${a1},0.3)`} onMouseLeave={e => e.currentTarget.style.borderColor = ''}>
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Music2 size={18} className="text-white/20" />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-white/90">{track?.title || "No track playing"}</p>
          <div className="flex items-center gap-2">
            <p className="truncate text-[11px] text-white/35">{track?.artist || "—"}</p>
            {isRadio && (
              <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-brand-red flex-shrink-0">
                <Radio size={9} className="animate-pulse" /> Live
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          {isRadio ? (
            <>
              <button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:scale-105 transition-transform" style={{ background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`, boxShadow: `0 4px 12px rgba(${a1},0.2)` }}>
                {state.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={async () => { try { await voteSkipRadio(); setTimeout(() => refreshRadio(), 1500); } catch (e) { console.error("Vote skip failed:", e); } }} className="text-white/30 hover:text-white/60 transition-colors" title="Vote to skip">
                <SkipForward size={16} />
              </button>
            </>
          ) : (
            <>
              <button onClick={toggleShuffle} className={`transition-colors ${state.shuffle ? '' : 'text-white/30 hover:text-white/60'}`} style={state.shuffle ? { color: theme.accent[1] } : undefined}>
                <Shuffle size={14} />
              </button>
              <button onClick={skipPrev} className="text-white/50 hover:text-white/80 transition-colors">
                <SkipBack size={16} fill="currentColor" />
              </button>
              <button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:scale-105 transition-transform" style={{ background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`, boxShadow: `0 4px 12px rgba(${a1},0.2)` }}>
                {state.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
              </button>
              <button onClick={skipNext} className="text-white/50 hover:text-white/80 transition-colors">
                <SkipForward size={16} fill="currentColor" />
              </button>
              <button onClick={cycleRepeat} className={`transition-colors ${state.repeat !== "off" ? '' : 'text-white/30 hover:text-white/60'}`} style={state.repeat !== "off" ? { color: theme.accent[1] } : undefined}>
                <RepeatIcon size={14} />
              </button>
            </>
          )}
        </div>
        {isRadio ? (
          <div className="flex w-full max-w-[400px] items-center gap-2">
            <span className="text-[10px] text-white/25 w-8 text-right tabular-nums">{fmt(state.progress)}</span>
            <div className="relative h-1 flex-1 rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, transition: "width 1s linear", background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})` }} />
            </div>
            <span className="text-[10px] text-white/25 w-8 tabular-nums">{fmt(state.duration)}</span>
          </div>
        ) : (
          <div className="flex w-full max-w-[400px] items-center gap-2">
            <span className="text-[10px] text-white/25 w-8 text-right tabular-nums">{fmt(state.progress)}</span>
            <div ref={seekRef} onMouseDown={onSeekDrag} className="relative h-1 flex-1 rounded-full bg-white/[0.08] group cursor-pointer">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})` }} />
              <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${pct}% - 6px)` }} />
            </div>
            <span className="text-[10px] text-white/25 w-8 tabular-nums">{fmt(state.duration)}</span>
          </div>
        )}
      </div>

      <div className="flex w-[240px] items-center justify-end gap-2.5">
        {isRadio && (
          <span className="flex items-center gap-1 text-[10px] text-white/25 mr-1">
            <Users size={11} />
            {radioListeners}
          </span>
        )}
        {!track?.local && (
          <button onClick={() => track && onInfo?.(track.id)} className="text-white/35 hover:text-white/60 transition-colors" title="Song Info">
            <Info size={15} />
          </button>
        )}
        <button
          className="text-white/35 hover:text-white/60 transition-colors"
          title={track?.local ? "Open in Explorer" : "Download"}
          onClick={() => {
            if (!track) return;
            if (track.local && track.path) showInExplorer(track.path).catch(() => {});
            else downloadFile(`/music/download/${track.id}`, `${track.title || track.id}.mp3`);
          }}
        >
          {track?.local ? <FolderOpen size={15} /> : <Download size={15} />}
        </button>
        <button
          className="text-white/35 hover:text-white/60 transition-colors"
          title="Add to Playlist"
          onClick={() => track && onAddToPlaylist?.({ id: track.id, title: track.title, artist: track.artist, cover: track.cover })}
        >
          <ListPlus size={15} />
        </button>
        <button onClick={() => setShowPrefs(true)} className="text-white/35 hover:text-white/60 transition-colors" title="Player Preferences">
          <SlidersHorizontal size={15} />
        </button>
        <button onClick={onFullscreen} className="text-white/35 transition-colors" style={{ '--hover-color': theme.accent[1] }} onMouseEnter={e => e.currentTarget.style.color = theme.accent[1]} onMouseLeave={e => e.currentTarget.style.color = ''} title="Fullscreen">
          <Maximize2 size={15} />
        </button>
        <div className="w-px h-4 bg-white/[0.06]" />
        <button onClick={() => setVolume(state.volume > 0 ? 0 : 0.7)} className="text-white/40 flex-shrink-0 hover:text-white/60 transition-colors">
          {state.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <div ref={volRef} onMouseDown={onVolDrag} className="relative h-1 w-20 rounded-full bg-white/[0.08] group cursor-pointer">
          <div className="h-full rounded-full" style={{ width: `${state.volume * 100}%`, background: `linear-gradient(to right, ${theme.accent[1]}cc, ${theme.accent[1]})` }} />
          <div className="absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${state.volume * 100}% - 5px)` }} />
        </div>
      </div>
      {showPrefs && createPortal(
        <AnimatePresence>
          <PlayerPreferencesModal onClose={() => setShowPrefs(false)} />
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default PlayBar;
