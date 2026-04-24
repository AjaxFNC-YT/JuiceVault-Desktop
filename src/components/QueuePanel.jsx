import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  CirclePlus,
  Download,
  FolderOpen,
  GripVertical,
  Info,
  ListOrdered,
  MoreHorizontal,
  Music2,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { downloadFile, showInExplorer } from "@/lib/api";
import { usePlayer } from "@/stores/playerStore";
import { hexToRgb, useTheme } from "@/stores/themeStore";
import { useIsMobile } from "@/hooks/useMobile";
import { toApiUrl } from "@/lib/platform";
const INITIAL_LIMIT = 100;
const LOAD_STEP = 100;
const MENU_WIDTH = 208;
const MENU_HEIGHT = 250;

function fmt(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function QueuePanel({ open, onClose, onInfo, onAddToPlaylist }) {
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const {
    state,
    getUpcomingQueue,
    moveQueueItem,
    removeQueueItem,
    playQueueItem,
    toggleCustomQueuePlayback,
  } = usePlayer();
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [draggingQueueIndex, setDraggingQueueIndex] = useState(null);
  const [dropQueueIndex, setDropQueueIndex] = useState(null);

  useEffect(() => {
    if (open) {
      setLimit(INITIAL_LIMIT);
      setDraggingQueueIndex(null);
      setDropQueueIndex(null);
    }
  }, [open]);

  const allUpcoming = useMemo(
    () => getUpcomingQueue(Number.POSITIVE_INFINITY),
    [getUpcomingQueue, state.queue, state.queueIndex, state.shuffle],
  );
  const upcoming = useMemo(() => allUpcoming.slice(0, limit), [allUpcoming, limit]);
  const currentTrack = state.currentTrack;
  const currentQueueEntry = useMemo(() => {
    if (!currentTrack) return null;
    return {
      ...currentTrack,
      queueIndex: state.queueIndex,
      queueOrder: 0,
      isCurrent: true,
    };
  }, [currentTrack, state.queueIndex]);
  const visibleQueue = useMemo(
    () => (currentQueueEntry ? [currentQueueEntry, ...upcoming] : upcoming),
    [currentQueueEntry, upcoming],
  );
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const isCustomQueue = state.queueSource === "queue";

  const handleDragStart = useCallback((queueIndex) => {
    setDraggingQueueIndex(queueIndex);
    setDropQueueIndex(queueIndex);
  }, []);

  const handleDragOver = useCallback((event, queueIndex) => {
    event.preventDefault();
    if (draggingQueueIndex == null || draggingQueueIndex === queueIndex) return;
    setDropQueueIndex(queueIndex);
  }, [draggingQueueIndex]);

  const handleDrop = useCallback((event, queueIndex) => {
    event.preventDefault();
    if (draggingQueueIndex == null || draggingQueueIndex === queueIndex) {
      setDraggingQueueIndex(null);
      setDropQueueIndex(null);
      return;
    }

    moveQueueItem(draggingQueueIndex, queueIndex);
    setDraggingQueueIndex(null);
    setDropQueueIndex(null);
  }, [draggingQueueIndex, moveQueueItem]);

  const clearDragState = useCallback(() => {
    setDraggingQueueIndex(null);
    setDropQueueIndex(null);
  }, []);

  const handleInfo = useCallback((track) => {
    onClose?.();
    window.setTimeout(() => onInfo?.(track.id), 10);
  }, [onClose, onInfo]);

  const handleAddToPlaylist = useCallback((track) => {
    onClose?.();
    window.setTimeout(() => onAddToPlaylist?.(track), 10);
  }, [onAddToPlaylist, onClose]);

  if (!open) return null;

  const modal = (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          onClick={(event) => event.stopPropagation()}
          className={`overflow-hidden flex flex-col ${isMobile ? "h-full w-full rounded-none" : "max-h-[84vh] w-full max-w-[1040px] rounded-[30px]"}`}
          style={{
            background: `linear-gradient(180deg, rgba(${a1}, 0.18) 0%, rgba(${a0}, 0.06) 40%, rgba(8, 10, 14, 0.985) 100%), #0b0d12`,
            border: isMobile ? "none" : `1px solid rgba(${a1}, 0.18)`,
            boxShadow: isMobile ? "none" : `0 36px 120px rgba(0,0,0,0.58), 0 0 90px rgba(${a1}, 0.1)`,
          }}
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <div
            className="relative overflow-hidden border-b border-white/[0.06] px-5 py-5 sm:px-7"
            style={isMobile ? { paddingTop: "max(22px, env(safe-area-inset-top, 22px))" } : undefined}
          >
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background: `radial-gradient(circle at top left, rgba(${a1}, 0.2), transparent 42%), radial-gradient(circle at top right, rgba(${a0}, 0.15), transparent 44%)`,
              }}
            />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <ListOrdered size={20} className="text-white/55" />
                  <h2 className="text-[22px] font-bold text-white">Current Queue</h2>
                </div>
                <p className="mt-2 max-w-[720px] text-[12px] leading-6 text-white/42">
                  {state.shuffle
                    ? `Queue showing ${visibleQueue.length} song${visibleQueue.length !== 1 ? "s" : ""}, including the current track. Reorder anything you want to lock in next.`
                    : `${visibleQueue.length} song${visibleQueue.length !== 1 ? "s" : ""} in the current queue, including what is playing now.`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="relative z-10 rounded-xl p-2 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/75"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px,minmax(0,1fr)]">
            <div
              className="overflow-y-auto border-b border-white/[0.06] p-5 lg:border-b-0 lg:border-r lg:p-6"
              style={isMobile ? { paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" } : undefined}
            >
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">Now Playing</p>
              {currentTrack ? (
                <CurrentTrackCard track={currentTrack} />
              ) : (
                <EmptyCard text="Nothing is playing right now." />
              )}

              <QueueModeCard
                isCustomQueue={isCustomQueue}
                shuffle={state.shuffle}
                onToggle={(enabled) => toggleCustomQueuePlayback(enabled, { track: currentTrack })}
              />
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-6">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">Current Queue</p>
                  {state.shuffle && <Shuffle size={12} className="text-white/18" />}
                </div>
                {allUpcoming.length > INITIAL_LIMIT && limit !== Infinity && (
                  <button
                    onClick={() => setLimit(Infinity)}
                    className="text-[11px] text-white/35 transition-colors hover:text-white/65"
                  >
                    View all
                  </button>
                )}
              </div>

              <div
                className="flex-1 overflow-y-auto px-4 pb-10 pr-2 sm:px-6 sm:pb-12"
                style={isMobile ? { paddingBottom: "max(48px, env(safe-area-inset-bottom, 48px))" } : undefined}
              >
                {visibleQueue.length ? (
                  <div className="space-y-3">
                    {visibleQueue.map((track, index) => (
                      <QueueRow
                        key={`${track.queueIndex}-${track.id || track.file_hash || track.path || index}`}
                        track={track}
                        isFirst={index === 0}
                        isLast={index === visibleQueue.length - 1}
                        isCurrent={Boolean(track.isCurrent)}
                        isDragging={draggingQueueIndex === track.queueIndex}
                        isDropTarget={!track.isCurrent && dropQueueIndex === track.queueIndex && draggingQueueIndex !== track.queueIndex}
                        onPlay={() => playQueueItem(track.queueIndex)}
                        onMoveUp={() => moveQueueItem(track.queueIndex, track.queueIndex - 1)}
                        onMoveDown={() => moveQueueItem(track.queueIndex, track.queueIndex + 1)}
                        onRemove={() => removeQueueItem(track.queueIndex)}
                        onAddToPlaylist={() => handleAddToPlaylist(track)}
                        onInfo={() => handleInfo(track)}
                        onDragStart={() => handleDragStart(track.queueIndex)}
                        onDragOver={(event) => handleDragOver(event, track.queueIndex)}
                        onDrop={(event) => handleDrop(event, track.queueIndex)}
                        onDragEnd={clearDragState}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyCard text="No upcoming songs in the queue." />
                )}

                {limit !== Infinity && allUpcoming.length > upcoming.length && (
                  <button
                    onClick={() => setLimit((value) => value + LOAD_STEP)}
                    className="mt-4 w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80"
                  >
                    Load {Math.min(LOAD_STEP, allUpcoming.length - upcoming.length)} more
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}

function QueueModeCard({ isCustomQueue, shuffle, onToggle }) {
  return (
    <div className="mt-5 rounded-[24px] border border-white/[0.06] bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">Queue Mode</p>
          <p className="mt-2 text-[13px] font-medium text-white/88">
            {isCustomQueue ? "Custom Queue" : "Automatic Queue"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isCustomQueue}
          onClick={() => onToggle(!isCustomQueue)}
          className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full border px-1 transition-colors ${
            isCustomQueue ? "justify-end border-emerald-400/30 bg-emerald-400/12" : "justify-start border-white/[0.08] bg-white/[0.05]"
          }`}
        >
          <span className={`h-5 w-5 rounded-full transition-all ${isCustomQueue ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.35)]" : "bg-white/70"}`} />
        </button>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-white/42">
        {isCustomQueue
          ? "Queued songs now control playback. Turn this off to return to your original list."
          : shuffle
            ? "Enable this to take control of the visible shuffle order and keep your manual queue edits in charge."
            : "Enable this to turn the visible upcoming order into a queue you can fully shape by hand."}
      </p>
    </div>
  );
}

function CurrentTrackCard({ track }) {
  const cover = track?.cover ? (track.local ? track.cover : toApiUrl(track.cover)) : null;

  return (
    <div className="overflow-hidden rounded-[24px] border border-white/[0.06] bg-white/[0.03]">
      <div className="aspect-square overflow-hidden bg-white/[0.05]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music2 size={34} className="text-white/14" />
          </div>
        )}
      </div>
      <div className="px-4 py-4">
        <p className="text-[15px] font-semibold leading-6 text-white/88">{track.title || "Unknown"}</p>
        <p className="mt-1 truncate text-[12px] text-white/38">{track.artist || "Unknown"}</p>
        <div className="mt-3 inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/35">
          Current Track
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  track,
  isFirst,
  isLast,
  isCurrent,
  isDragging,
  isDropTarget,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddToPlaylist,
  onInfo,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const cover = track?.cover ? (track.local ? track.cover : toApiUrl(track.cover)) : null;

  return (
    <div
      draggable={!isCurrent}
      onDragStart={isCurrent ? undefined : onDragStart}
      onDragOver={isCurrent ? undefined : onDragOver}
      onDrop={isCurrent ? undefined : onDrop}
      onDragEnd={isCurrent ? undefined : onDragEnd}
      className={`group flex items-center gap-3 rounded-[22px] px-3 py-3 transition-all ${
        isDropTarget
          ? "border border-white/20 bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
          : isCurrent
            ? "border border-emerald-500/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_0_0_1px_rgba(16,185,129,0.04)]"
            : "border border-white/[0.05] bg-white/[0.03] hover:bg-white/[0.05]"
      } ${isDragging ? "opacity-55" : ""}`}
    >
      <button onClick={onPlay} className="grid min-w-0 flex-1 grid-cols-[72px_56px_minmax(0,1fr)_64px] items-center gap-3 text-left">
        <div className="flex items-center gap-2 text-white/26">
          <GripVertical size={16} className={`flex-shrink-0 ${isCurrent ? "text-white/12" : "cursor-grab text-white/22"}`} />
          <span className={`flex h-10 min-w-10 items-center justify-center rounded-2xl border px-2 text-[11px] font-semibold ${
            isCurrent
              ? "border-emerald-500/10 bg-emerald-500/10 text-emerald-200"
              : "border-white/[0.05] bg-white/[0.04] text-white/40"
          }`}>
            {isCurrent ? "Live" : track.queueOrder}
          </span>
        </div>
        <div className="h-14 w-14 overflow-hidden rounded-2xl bg-white/[0.06]">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 size={16} className="text-white/20" />
            </div>
          )}
        </div>
        <div className="min-w-0 pr-2">
          <p className="text-[14px] font-semibold leading-5 text-white/88">{track.title || "Unknown"}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="truncate text-[12px] text-white/38">{track.artist || "Unknown"}</p>
            {isCurrent && (
              <span className="inline-flex rounded-full border border-emerald-500/10 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                Currently Playing
              </span>
            )}
          </div>
        </div>
        <span className="text-right text-[12px] tabular-nums text-white/26">{track.length || fmt(track.duration)}</span>
      </button>

      <QueueRowMenu
        track={track}
        isFirst={isFirst || isCurrent}
        isLast={isLast}
        isCurrent={isCurrent}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onRemove={onRemove}
        onAddToPlaylist={onAddToPlaylist}
        onInfo={onInfo}
      />
    </div>
  );
}

function QueueRowMenu({ track, isFirst, isLast, isCurrent, onMoveUp, onMoveDown, onRemove, onAddToPlaylist, onInfo }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const showAbove = window.innerHeight - rect.bottom < MENU_HEIGHT;
    const left = Math.max(12, Math.min(window.innerWidth - MENU_WIDTH - 12, rect.right - MENU_WIDTH));
    const top = showAbove ? rect.top - MENU_HEIGHT - 8 : rect.bottom + 8;
    setPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      closeMenu();
    };

    const onAnyScroll = () => closeMenu();

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onAnyScroll, true);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onAnyScroll, true);
    };
  }, [closeMenu, open, updatePosition]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    closeMenu();
    try {
      if (track.local && track.path) {
        await showInExplorer(track.path);
      } else {
        await downloadFile(`/music/download/${track.id}`, track.file_name || `${track.title || track.id}.mp3`);
      }
    } catch {
    } finally {
      setDownloading(false);
    }
  }, [closeMenu, downloading, track]);

  return (
    <>
      <div className="relative flex-shrink-0">
        <button
          ref={buttonRef}
          onClick={(event) => {
            event.stopPropagation();
            if (open) {
              closeMenu();
              return;
            }
            setOpen(true);
          }}
          className={`rounded-xl p-2 transition-colors ${open ? "bg-white/[0.08] text-white/65" : "text-white/18 hover:bg-white/[0.06] hover:text-white/55"}`}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>

      {open && position && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[180] w-52 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1a1a] py-1 shadow-2xl"
          style={{ left: position.left, top: position.top }}
          onClick={(event) => event.stopPropagation()}
        >
          <QueueMenuItem icon={ChevronUp} label="Move Up" onClick={() => { onMoveUp(); closeMenu(); }} disabled={isFirst || isCurrent} color="text-white/50" />
          <QueueMenuItem icon={ChevronDown} label="Move Down" onClick={() => { onMoveDown(); closeMenu(); }} disabled={isLast || isCurrent} color="text-white/50" />
          <QueueMenuItem icon={Trash2} label="Remove from Queue" onClick={() => { onRemove(); closeMenu(); }} disabled={isCurrent} color="text-red-400" />
          <div className="my-1 h-px bg-white/[0.06]" />
          <QueueMenuItem icon={CirclePlus} label="Add to Playlist" onClick={() => { onAddToPlaylist?.(); closeMenu(); }} color="text-purple-400" />
          {!track.local && <QueueMenuItem icon={Info} label="Song Info" onClick={() => { onInfo?.(); closeMenu(); }} color="text-blue-400" />}
          <QueueMenuItem
            icon={track.local ? FolderOpen : Download}
            label={track.local ? "Open in Explorer" : "Download"}
            onClick={handleDownload}
            loading={downloading}
            color="text-emerald-400"
          />
        </div>,
        document.body,
      )}
    </>
  );
}

function QueueMenuItem({ icon: Icon, label, onClick, disabled = false, loading = false, color = "text-white/50" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={14} className={`${color} flex-shrink-0`} />
      <span>{loading ? "Working..." : label}</span>
    </button>
  );
}

function EmptyCard({ text }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-4 py-10 text-center">
      <p className="text-[12px] text-white/35">{text}</p>
    </div>
  );
}

export default QueuePanel;
