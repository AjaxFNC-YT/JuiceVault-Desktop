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
  const [dropPlacement, setDropPlacement] = useState(null);
  const queueListRef = useRef(null);
  const rowRefs = useRef(new Map());
  const dragSessionRef = useRef(null);
  const dropPlacementRef = useRef(null);
  const dragFrameRef = useRef(null);
  const pendingDragPointRef = useRef(null);

  useEffect(() => {
    if (open) {
      setLimit(INITIAL_LIMIT);
      setDraggingQueueIndex(null);
      setDropPlacement(null);
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

  const clearDragState = useCallback(() => {
    const session = dragSessionRef.current;
    const draggedRow = session ? rowRefs.current.get(session.queueIndex) : null;
    if (dragFrameRef.current) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    if (draggedRow) {
      draggedRow.style.transition = "";
      draggedRow.style.transform = "";
      draggedRow.style.willChange = "";
    }
    pendingDragPointRef.current = null;
    dragSessionRef.current = null;
    dropPlacementRef.current = null;
    setDraggingQueueIndex(null);
    setDropPlacement(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const updateDropPlacement = useCallback((clientY, draggingIndex) => {
    const rows = visibleQueue
      .filter((track) => !track.isCurrent && track.queueIndex !== draggingIndex)
      .map((track) => ({
        queueIndex: track.queueIndex,
        element: rowRefs.current.get(track.queueIndex),
      }))
      .filter((entry) => entry.element);

    if (!rows.length) {
      dropPlacementRef.current = null;
      setDropPlacement(null);
      return;
    }

    const rects = rows.map((row) => ({
      ...row,
      rect: row.element.getBoundingClientRect(),
    }));

    for (let index = 0; index < rects.length; index += 1) {
      const row = rects[index];
      const previous = rects[index - 1];
      const next = rects[index + 1];
      const zoneTop = previous ? (previous.rect.bottom + row.rect.top) / 2 : Number.NEGATIVE_INFINITY;
      const zoneBottom = next ? (row.rect.bottom + next.rect.top) / 2 : Number.POSITIVE_INFINITY;

      if (clientY >= zoneTop && clientY <= zoneBottom) {
        const midpoint = row.rect.top + row.rect.height / 2;
        const placement = {
          queueIndex: row.queueIndex,
          position: clientY < midpoint ? "before" : "after",
        };
        const current = dropPlacementRef.current;
        if (current?.queueIndex === placement.queueIndex && current?.position === placement.position) return;
        dropPlacementRef.current = placement;
        setDropPlacement(placement);
        return;
      }
    }

    const firstRect = rects[0].rect;
    if (clientY < firstRect.top) {
      const placement = { queueIndex: rows[0].queueIndex, position: "before" };
      const current = dropPlacementRef.current;
      if (current?.queueIndex === placement.queueIndex && current?.position === placement.position) return;
      dropPlacementRef.current = placement;
      setDropPlacement(placement);
      return;
    }

    const lastRow = rows[rows.length - 1];
    const placement = { queueIndex: lastRow.queueIndex, position: "after" };
    const current = dropPlacementRef.current;
    if (current?.queueIndex === placement.queueIndex && current?.position === placement.position) return;
    dropPlacementRef.current = placement;
    setDropPlacement(placement);
  }, [visibleQueue]);

  const moveDragSession = useCallback((clientX, clientY) => {
    const session = dragSessionRef.current;
    if (!session) return;

    const distance = Math.abs(clientY - session.startY) + Math.abs(clientX - session.startX);
    if (!session.didMove && distance > 3) {
      session.didMove = true;
      setDraggingQueueIndex(session.queueIndex);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    }

    if (!session.didMove) return;

    const offsetY = Math.max(session.minOffsetY, Math.min(session.maxOffsetY, clientY - session.startY));
    pendingDragPointRef.current = {
      clientY: session.startY + offsetY,
      offsetY,
      queueIndex: session.queueIndex,
    };
    if (dragFrameRef.current) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      const point = pendingDragPointRef.current;
      dragFrameRef.current = null;
      if (!point) return;
      const row = rowRefs.current.get(point.queueIndex);
      if (row) {
        row.style.transition = "none";
        row.style.transform = `translate3d(0, ${point.offsetY}px, 0)`;
        row.style.willChange = "transform";
      }
      updateDropPlacement(point.clientY, point.queueIndex);
    });
  }, [updateDropPlacement]);

  const finishDragSession = useCallback(() => {
    const session = dragSessionRef.current;
    if (!session) {
      clearDragState();
      return;
    }

    if (session.didMove) {
      const placement = dropPlacementRef.current;
      if (placement) {
        const fromIndex = session.queueIndex;
        moveQueueItem(fromIndex, placement.queueIndex, { placement: placement.position });
      }
      clearDragState();
      return;
    }

    clearDragState();
    session.onClick?.();
  }, [clearDragState, moveQueueItem]);

  const beginHandleDrag = useCallback((queueIndex, event, onClick) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (dragSessionRef.current) return;

    const row = rowRefs.current.get(queueIndex);
    const rowRect = row?.getBoundingClientRect();
    const listRect = queueListRef.current?.getBoundingClientRect();
    const minOffsetY = rowRect && listRect ? listRect.top - rowRect.top + 6 : Number.NEGATIVE_INFINITY;
    const maxOffsetY = rowRect && listRect ? listRect.bottom - rowRect.bottom - 6 : Number.POSITIVE_INFINITY;

    event.currentTarget?.setPointerCapture?.(event.pointerId);
    dragSessionRef.current = {
      queueIndex,
      startX: event.clientX,
      startY: event.clientY,
      minOffsetY,
      maxOffsetY,
      pointerId: event.pointerId,
      didMove: false,
      onClick,
    };
  }, []);

  const handleDragMove = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    moveDragSession(event.clientX, event.clientY);
  }, [moveDragSession]);

  const handleDragEnd = useCallback((event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.releasePointerCapture?.(event.pointerId);
    finishDragSession();
  }, [finishDragSession]);

  useEffect(() => {
    const onWindowPointerMove = (event) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      moveDragSession(event.clientX, event.clientY);
    };

    const onWindowPointerUp = (event) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      finishDragSession();
    };

    window.addEventListener("pointermove", onWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", onWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", onWindowPointerUp, { passive: false });
    window.addEventListener("blur", finishDragSession);
    return () => {
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerUp);
      window.removeEventListener("blur", finishDragSession);
    };
  }, [finishDragSession, moveDragSession]);

  const registerRowRef = useCallback((queueIndex, node) => {
    if (!node) {
      rowRefs.current.delete(queueIndex);
      return;
    }
    rowRefs.current.set(queueIndex, node);
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
            className="relative overflow-hidden border-b border-white/[0.06] px-5 py-4 sm:px-7"
            style={isMobile ? { paddingTop: "max(18px, env(safe-area-inset-top, 18px))" } : undefined}
          >
            <div
              className="absolute inset-0 opacity-70"
              style={{
                background: `radial-gradient(circle at top left, rgba(${a1}, 0.18), transparent 42%), radial-gradient(circle at top right, rgba(${a0}, 0.12), transparent 44%)`,
              }}
            />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/55">
                  <ListOrdered size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <h2 className="truncate text-[21px] font-bold leading-none text-white">Current Queue</h2>
                    {state.shuffle && <span className="hidden rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 sm:inline-flex">Shuffle</span>}
                  </div>
                  <p className="mt-1 truncate text-[12px] text-white/38">
                    {`${visibleQueue.length} song${visibleQueue.length !== 1 ? "s" : ""} queued, including the current track`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="relative z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/75"
                aria-label="Close queue"
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
                  <div ref={queueListRef} className="space-y-3">
                    {visibleQueue.map((track, index) => (
                      <QueueRow
                        key={`${track.queueIndex}-${track.id || track.file_hash || track.path || index}`}
                        track={track}
                        isFirst={index === 0}
                        isLast={index === visibleQueue.length - 1}
                        isCurrent={Boolean(track.isCurrent)}
                        isDragging={draggingQueueIndex === track.queueIndex}
                        showInsertBefore={!track.isCurrent && dropPlacement?.queueIndex === track.queueIndex && dropPlacement?.position === "before" && draggingQueueIndex !== track.queueIndex}
                        showInsertAfter={!track.isCurrent && dropPlacement?.queueIndex === track.queueIndex && dropPlacement?.position === "after" && draggingQueueIndex !== track.queueIndex}
                        onPlay={() => playQueueItem(track.queueIndex)}
                        onMoveUp={() => moveQueueItem(track.queueIndex, track.queueIndex - 1)}
                        onMoveDown={() => moveQueueItem(track.queueIndex, track.queueIndex + 1)}
                        onRemove={() => removeQueueItem(track.queueIndex)}
                        onAddToPlaylist={() => handleAddToPlaylist(track)}
                        onInfo={() => handleInfo(track)}
                        onHandlePointerDown={(event, onClick) => beginHandleDrag(track.queueIndex, event, onClick)}
                        onHandlePointerMove={handleDragMove}
                        onHandlePointerUp={handleDragEnd}
                        rowRef={(node) => registerRowRef(track.queueIndex, node)}
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
  showInsertBefore,
  showInsertAfter,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddToPlaylist,
  onInfo,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  rowRef,
}) {
  const cover = track?.cover ? (track.local ? track.cover : toApiUrl(track.cover)) : null;

  return (
    <motion.div
      layout="position"
      ref={rowRef}
      className={`group relative flex items-center gap-3 rounded-[22px] px-3 py-3 transition-colors ${
        isCurrent
          ? "border border-emerald-500/10 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_0_0_1px_rgba(16,185,129,0.04)]"
          : "border border-white/[0.05] bg-white/[0.03] hover:bg-white/[0.05]"
      } ${isDragging ? "z-10 border-white/15 bg-white/[0.08] shadow-[0_12px_28px_rgba(0,0,0,0.28)] opacity-95" : ""}`}
      transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
    >
      {showInsertBefore && (
        <div className="pointer-events-none absolute -top-2 left-4 right-4 h-[2px] rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.4)]" />
      )}
      {showInsertAfter && (
        <div className="pointer-events-none absolute -bottom-2 left-4 right-4 h-[2px] rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.4)]" />
      )}
      <div className="flex items-center gap-2 text-white/26">
        <button
          type="button"
          disabled={isCurrent}
          onPointerDown={(event) => {
            if (isCurrent || event.button !== 0) return;
            onHandlePointerDown?.(event);
          }}
          onPointerMove={isCurrent ? undefined : onHandlePointerMove}
          onPointerUp={isCurrent ? undefined : onHandlePointerUp}
          onPointerCancel={isCurrent ? undefined : onHandlePointerUp}
          className={`touch-none rounded-xl p-1.5 transition-colors ${
            isCurrent
              ? "cursor-default text-white/12"
              : isDragging
                ? "cursor-grabbing bg-white/[0.08] text-white/70"
                : "cursor-grab text-white/24 hover:bg-white/[0.06] hover:text-white/60 active:cursor-grabbing"
          }`}
          title={isCurrent ? "Currently playing" : "Drag to reorder"}
        >
          <GripVertical size={16} className="flex-shrink-0" />
        </button>
        <span className={`flex h-10 min-w-10 items-center justify-center rounded-2xl border px-2 text-[11px] font-semibold ${
          isCurrent
            ? "border-emerald-500/10 bg-emerald-500/10 text-emerald-200"
            : "border-white/[0.05] bg-white/[0.04] text-white/40"
        }`}>
          {isCurrent ? "Live" : track.queueOrder}
        </span>
      </div>

      <button onClick={onPlay} className="grid min-w-0 flex-1 grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-3 text-left">
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
    </motion.div>
  );
}

function QueueRowMenu({
  track,
  isFirst,
  isLast,
  isCurrent,
  onMoveUp,
  onMoveDown,
  onRemove,
  onAddToPlaylist,
  onInfo,
}) {
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
        <div
          ref={buttonRef}
          onClick={(event) => {
            event.stopPropagation();
            if (open) {
              closeMenu();
              return;
            }
            setOpen(true);
          }}
          role="button"
          tabIndex={0}
          className={`rounded-xl p-2 transition-colors ${open ? "bg-white/[0.08] text-white/65" : "text-white/18 hover:bg-white/[0.06] hover:text-white/55"}`}
          title="Queue actions"
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (open) closeMenu();
              else setOpen(true);
            }
          }}
        >
          <MoreHorizontal size={17} />
        </div>
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

