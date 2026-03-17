import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Play, Music2, LayoutGrid, List } from "lucide-react";
import { usePlayer } from "@/stores/playerStore";
import SongContextMenu from "@/components/SongContextMenu";

const CDN = "https://api.juicevault.xyz";
const ROW_H = 52;
const OVERSCAN = 20;
const CARD_BATCH = 60;

function getScrollParent(el) {
  let p = el?.parentElement;
  while (p) {
    if (p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== "visible") return p;
    p = p.parentElement;
  }
  return document.documentElement;
}

function SongList({ songs, viewMode, onViewChange, onInfo, onAddToPlaylist, likedIds = new Set(), onLikeChange }) {
  const { playTrack } = usePlayer();
  const wrapRef = useRef(null);
  const [visRange, setVisRange] = useState({ s: 0, e: 100 });
  const [cardLimit, setCardLimit] = useState(CARD_BATCH);

  useEffect(() => { setCardLimit(CARD_BATCH); }, [songs, viewMode]);

  useEffect(() => {
    if (viewMode !== "list") return;
    const el = wrapRef.current;
    if (!el) return;
    const sp = getScrollParent(el);

    const update = () => {
      const wr = el.getBoundingClientRect();
      const sr = sp === document.documentElement ? { top: 0 } : sp.getBoundingClientRect();
      const off = sr.top - wr.top;
      const vh = sp === document.documentElement ? window.innerHeight : sp.clientHeight;
      const s = Math.max(0, Math.floor(off / ROW_H) - OVERSCAN);
      const e = Math.min(songs.length, Math.ceil((off + vh) / ROW_H) + OVERSCAN);
      setVisRange({ s, e });
    };

    sp.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => { sp.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [songs.length, viewMode]);

  useEffect(() => {
    if (viewMode !== "card" || cardLimit >= songs.length) return;
    const el = wrapRef.current;
    if (!el) return;
    const sp = getScrollParent(el);

    const onScroll = () => {
      const h = sp === document.documentElement ? document.body.scrollHeight : sp.scrollHeight;
      const st = sp === document.documentElement ? window.scrollY : sp.scrollTop;
      const ch = sp === document.documentElement ? window.innerHeight : sp.clientHeight;
      if (st + ch > h - 600) setCardLimit((c) => Math.min(c + CARD_BATCH, songs.length));
    };

    sp.addEventListener("scroll", onScroll, { passive: true });
    return () => sp.removeEventListener("scroll", onScroll);
  }, [songs.length, viewMode, cardLimit]);

  const handlePlay = useCallback((idx) => {
    playTrack(songs[idx], songs, idx);
  }, [playTrack, songs]);

  return (
    <div ref={wrapRef}>
      <div className="flex items-center gap-1.5 mb-4">
        <button
          onClick={() => onViewChange("list")}
          className={`p-1.5 rounded-md ${viewMode === "list" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"}`}
        >
          <List size={16} />
        </button>
        <button
          onClick={() => onViewChange("card")}
          className={`p-1.5 rounded-md ${viewMode === "card" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"}`}
        >
          <LayoutGrid size={16} />
        </button>
        <span className="ml-2 text-[12px] text-white/20">{songs.length} songs</span>
      </div>

      {viewMode === "list" ? (
        <div style={{ height: songs.length * ROW_H, position: "relative" }}>
          {songs.slice(visRange.s, visRange.e).map((song, i) => {
            const idx = visRange.s + i;
            return (
              <div key={song.id} style={{ position: "absolute", top: idx * ROW_H, left: 0, right: 0, height: ROW_H }}>
                <MemoRow song={song} index={idx} onPlay={handlePlay} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} liked={likedIds.has(song.id)} onLikeChange={onLikeChange} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {songs.slice(0, cardLimit).map((song, i) => (
            <MemoCard key={song.id} song={song} index={i} onPlay={handlePlay} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} liked={likedIds.has(song.id)} onLikeChange={onLikeChange} />
          ))}
        </div>
      )}
    </div>
  );
}

const MemoRow = memo(function SongRow({ song, index, onPlay, onInfo, onAddToPlaylist, liked, onLikeChange }) {
  const cover = song.cover ? (song.local ? song.cover : `${CDN}${song.cover}`) : null;
  return (
    <div className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.05] text-left w-full h-full">
      <button onClick={() => onPlay(index)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <span className="w-6 text-center text-[12px] text-white/20 group-hover:hidden">{index + 1}</span>
        <span className="w-6 text-center hidden group-hover:block">
          <Play size={12} className="text-white mx-auto" fill="white" />
        </span>
        <div className="h-9 w-9 rounded bg-white/[0.06] overflow-hidden flex-shrink-0">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 size={12} className="text-white/20" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/80">{song.title}</p>
          <p className="truncate text-[11px] text-white/30">{song.artist}</p>
        </div>
        <span className="text-[12px] text-white/20 flex-shrink-0">{song.length}</span>
        <span className="text-[11px] text-white/15 w-16 text-right flex-shrink-0">{song.file_size}</span>
      </button>
      <SongContextMenu song={song} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} liked={liked} onLikeChange={onLikeChange} />
    </div>
  );
});

const MemoCard = memo(function SongCard({ song, index, onPlay, onInfo, onAddToPlaylist, liked, onLikeChange }) {
  const cover = song.cover ? (song.local ? song.cover : `${CDN}${song.cover}`) : null;
  return (
    <div className="group relative flex flex-col rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 hover:bg-white/[0.06] text-left">
      <button onClick={() => onPlay(index)} className="text-left">
        <div className="relative aspect-square w-full rounded-lg bg-white/[0.06] overflow-hidden mb-3">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 size={24} className="text-white/20" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-red">
              <Play size={18} className="text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
        <p className="truncate text-[13px] font-medium text-white/80">{song.title}</p>
        <p className="truncate text-[11px] text-white/30 mt-0.5">{song.artist}</p>
      </button>
      <div className="absolute top-2 right-2">
        <SongContextMenu song={song} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} liked={liked} onLikeChange={onLikeChange} />
      </div>
    </div>
  );
});

export default SongList;
