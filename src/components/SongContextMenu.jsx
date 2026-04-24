import { useState, useEffect, useRef } from "react";
import { MoreHorizontal, Info, Heart, CirclePlus, Download, FolderOpen, Loader2, ListOrdered } from "lucide-react";
import { likeSong, unlikeSong, downloadFile, showInExplorer } from "@/lib/api";
import { usePlayer } from "@/stores/playerStore";

function SongContextMenu({ song, onInfo, liked, onLikeChange, onAddToPlaylist }) {
  const { addToQueue } = usePlayer();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [liking, setLiking] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    try {
      if (liked) await unlikeSong(song.id);
      else {
        const meta = song.local ? { title: song.title, artist: song.artist, album: song.album, duration: song.duration, fileHash: song.file_hash, fileName: song.file_name } : null;
        await likeSong(song.id, meta);
      }
      onLikeChange?.(song.id, !liked);
    } catch {} finally {
      setLiking(false);
      setOpen(false);
    }
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setOpen(false);
    try {
      if (song.local && song.path) {
        await showInExplorer(song.path);
      } else {
        await downloadFile(`/music/download/${song.id}`, song.file_name || `${song.title || song.id}.mp3`);
      }
    } catch {} finally {
      setDownloading(false);
    }
  };

  const handleInfo = () => {
    setOpen(false);
    onInfo?.(song.id);
  };

  const handleAddToPlaylist = () => {
    setOpen(false);
    onAddToPlaylist?.(song);
  };

  const handleAddToQueue = () => {
    addToQueue(song);
    setOpen(false);
  };

  return (
    <>
      <div className="relative flex-shrink-0">
        <button
          ref={btnRef}
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className={`p-1 rounded-md transition-colors ${open ? "text-white/60 bg-white/[0.08]" : "text-white/15 hover:text-white/50 hover:bg-white/[0.06]"}`}
        >
          <MoreHorizontal size={16} />
        </button>

        {open && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 z-[100] w-48 rounded-xl bg-[#1a1a1a] border border-white/[0.1] shadow-2xl overflow-hidden py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {!song.local && <MenuItem icon={Info} label="Song Info" onClick={handleInfo} color="text-blue-400" />}
            <MenuItem
              icon={Heart}
              label={liked ? "Unlike" : "Like"}
              onClick={handleLike}
              loading={liking}
              color={liked ? "text-red-400" : "text-pink-400"}
            />
            <MenuItem icon={ListOrdered} label="Add to Queue" onClick={handleAddToQueue} color="text-amber-400" />
            <MenuItem icon={CirclePlus} label="Add to Playlist" onClick={handleAddToPlaylist} color="text-purple-400" />
            <MenuItem icon={song.local ? FolderOpen : Download} label={song.local ? "Open in Explorer" : "Download"} onClick={handleDownload} loading={downloading} color="text-emerald-400" />
          </div>
        )}
      </div>

    </>
  );
}

function MenuItem({ icon: Icon, label, onClick, loading, color = "text-white/50" }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin text-white/30 flex-shrink-0" />
      ) : (
        <Icon size={14} className={`${color} flex-shrink-0`} />
      )}
      <span>{label}</span>
    </button>
  );
}

export default SongContextMenu;
