import { useRef, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SkipBack, Play, Pause, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Shuffle, Music2, Maximize2, Download, FolderOpen, Info, Radio, Users, CirclePlus, AudioWaveform, ListOrdered } from "lucide-react";
import { usePlayer } from "@/stores/playerStore";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { downloadFile, showInExplorer, voteSkipRadio } from "@/lib/api";
import PlayerPreferencesModal from "@/components/PlayerPreferencesModal";
import QueuePanel from "@/components/QueuePanel";
import { useIsMobile } from "@/hooks/useMobile";
import { toApiUrl } from "@/lib/platform";

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
  const { state, togglePlay, skipNext, skipPrev, seek, startSeek, endSeek, setVolume, toggleShuffle, cycleRepeat, stopRadio, refreshRadio, dismissQueuePrompt, confirmQueueSwitch } = usePlayer();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const seekRef = useRef(null);
  const volRef = useRef(null);
  const track = state.currentTrack;
  const cover = track?.cover ? (track.local ? track.cover : toApiUrl(track.cover)) : null;
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

  if (isMobile) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col"
        style={{
          background: `linear-gradient(135deg, rgba(${a1},0.12) 0%, rgba(${a0},0.08) 50%, rgba(${a1},0.12) 100%), linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.7))`,
          borderTop: `1px solid rgba(${a1},0.2)`,
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <button onClick={onFullscreen} className="h-11 w-11 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/[0.06]">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <Music2 size={16} className="text-white/20" />
            )}
          </button>
          <div className="min-w-0 flex-1">
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
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isRadio && (
              <button onClick={() => setShowQueue(true)} className="text-white/50 active:text-white/80 p-1.5">
                <ListOrdered size={17} />
              </button>
            )}
            {!isRadio && (
              <button onClick={skipPrev} className="text-white/50 active:text-white/80 p-1.5">
                <SkipBack size={18} fill="currentColor" />
              </button>
            )}
            <button onClick={togglePlay} className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})` }}>
              {state.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={skipNext} className="text-white/50 active:text-white/80 p-1.5">
              <SkipForward size={18} fill="currentColor" />
            </button>
          </div>
        </div>
        {!isRadio && state.duration > 0 && (
          <div className="h-[2px] w-full bg-white/[0.06]">
            <div className="h-full" style={{ width: `${pct}%`, background: `linear-gradient(to right, ${theme.accent[1]}, ${theme.accent[0]})` }} />
          </div>
        )}
      </div>
    );
  }

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

      <div className="flex w-[300px] items-center justify-end gap-2.5">
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
          <CirclePlus size={15} />
        </button>
        <button onClick={() => setShowPrefs(true)} className="text-white/35 hover:text-white/60 transition-colors" title="Player Preferences">
          <AudioWaveform size={15} />
        </button>
        {!isRadio && (
          <button onClick={() => setShowQueue(true)} className="text-white/35 hover:text-white/60 transition-colors" title="Queue">
            <ListOrdered size={15} />
          </button>
        )}
        <button onClick={onFullscreen} className="text-white/35 transition-colors" style={{ '--hover-color': theme.accent[1] }} onMouseEnter={e => e.currentTarget.style.color = theme.accent[1]} onMouseLeave={e => e.currentTarget.style.color = ''} title="Fullscreen">
          <Maximize2 size={15} />
        </button>
        <div className="w-px h-4 bg-white/[0.06]" />
        <button onClick={() => setVolume(state.volume > 0 ? 0 : 0.7)} className="text-white/40 flex-shrink-0 hover:text-white/60 transition-colors">
          {state.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <div ref={volRef} onMouseDown={onVolDrag} className="relative h-1 w-32 rounded-full bg-white/[0.08] group cursor-pointer">
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
      <QueuePanel
        open={showQueue}
        onClose={() => setShowQueue(false)}
        onInfo={onInfo}
        onAddToPlaylist={onAddToPlaylist}
      />
      {state.queuePrompt && createPortal(
        <AnimatePresence>
          <QueueSwitchModal
            song={{ ...state.queuePrompt.track, promptType: state.queuePrompt.type }}
            onCancel={dismissQueuePrompt}
            onConfirm={confirmQueueSwitch}
          />
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function QueueSwitchModal({ song, onCancel, onConfirm }) {
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const cover = song?.cover ? (song.local ? song.cover : toApiUrl(song.cover)) : null;
  const isDisablePrompt = song?.promptType === "disable-custom";

  return (
    <motion.div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] overflow-hidden rounded-[28px] border border-white/[0.08] shadow-2xl"
        style={{
          background: `linear-gradient(180deg, rgba(${a1}, 0.18) 0%, rgba(${a0}, 0.07) 44%, rgba(11, 13, 18, 0.98) 100%), #0d1016`,
          boxShadow: `0 30px 90px rgba(0,0,0,0.56), 0 0 70px rgba(${a1}, 0.1)`,
        }}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/28">
            {isDisablePrompt ? "Leave Custom Queue" : "Queue Playback"}
          </p>
          <h3 className="mt-2 text-[20px] font-bold text-white">
            {isDisablePrompt ? "Disable custom queue playback?" : "Switch to a custom queue?"}
          </h3>
          <p className="mt-3 text-[13px] leading-6 text-white/45">
            {isDisablePrompt ? (
              <>
                <span className="text-white/80">{song?.title || "This song"}</span> is playing outside your custom queue. Disable custom queue if you want playback to follow the list you just opened.
              </>
            ) : (
              <>
                Adding <span className="text-white/80">{song?.title || "this song"}</span> can turn the visible queue into a hand-shaped playback run. Your current song keeps playing, and queued songs take over what happens next.
              </>
            )}
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/24">
              {isDisablePrompt ? "Selected Song" : "Queued Song"}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-2xl bg-white/[0.06]">
                {cover ? (
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Music2 size={18} className="text-white/18" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[14px] font-semibold leading-5 text-white/88">{song?.title || "Unknown Song"}</p>
                <p className="mt-1 truncate text-[12px] text-white/38">{song?.artist || "Unknown Artist"}</p>
              </div>
              <div className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                isDisablePrompt
                  ? "border border-amber-400/20 bg-amber-400/10 text-amber-200"
                  : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
              }`}>
                {isDisablePrompt ? "Outside Queue" : "Custom"}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button onClick={onCancel} className="rounded-xl px-4 py-2 text-[13px] text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65">
              {isDisablePrompt ? "Keep custom queue" : "Keep current playback"}
            </button>
            <button
              onClick={onConfirm}
              className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:brightness-110"
              style={{
                background: isDisablePrompt
                  ? "linear-gradient(135deg, rgba(251,191,36,0.28), rgba(245,158,11,0.2))"
                  : `linear-gradient(135deg, rgba(${a1}, 0.34), rgba(${a0}, 0.28))`,
                border: isDisablePrompt
                  ? "1px solid rgba(251,191,36,0.24)"
                  : `1px solid rgba(${a1}, 0.28)`,
              }}
            >
              {isDisablePrompt ? "Disable custom queue" : "Switch to queue playback"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default PlayBar;
