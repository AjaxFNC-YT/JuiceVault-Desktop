import { useState, useEffect } from "react";
import { X, Music2, Search, Loader2, Heart, AlertCircle } from "lucide-react";
import { getMyPlaylists, addSongsToPlaylist, removeSongFromPlaylist, likeSong, unlikeSong, getLikedSongs } from "@/lib/api";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { useIsMobile } from "@/hooks/useMobile";

const CDN = "https://api.juicevault.xyz";

function PlaylistCover({ playlist }) {
  if (playlist.coverImage) {
    return <img src={`${CDN}${playlist.coverImage}`} alt="" className="h-full w-full object-cover" />;
  }
  const songIds = (playlist.songs || []).slice(-4).map((s) => s.songId || s);
  if (songIds.length >= 4) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
        {songIds.slice(0, 4).map((id, i) => (
          <img key={i} src={`${CDN}/cdn/music/covers/${id}`} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
        ))}
      </div>
    );
  }
  if (songIds.length > 0) {
    return <img src={`${CDN}/cdn/music/covers/${songIds[songIds.length - 1]}`} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />;
  }
  return <Music2 size={14} className="text-white/20" />;
}

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${on ? "" : "bg-white/[0.12]"}`}
      style={on ? { background: `linear-gradient(135deg, ${"#10b981"}, ${"#14b8a6"})` } : {}}
    >
      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function AddToPlaylistModal({ song, onClose }) {
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addedTo, setAddedTo] = useState(new Set());
  const [likedDone, setLikedDone] = useState(false);
  const [likedCount, setLikedCount] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getMyPlaylists().catch(() => null),
      getLikedSongs().catch(() => null),
    ]).then(([plRes, likedRes]) => {
      const owned = Array.isArray(plRes?.data) ? plRes.data : [];
      const collab = Array.isArray(plRes?.collaborated) ? plRes.collaborated : [];
      setPlaylists([...owned, ...collab]);
      const liked = likedRes?.data || [];
      setLikedCount(liked.length);
      if (liked.some((e) => (e.song?.id || e.songId) === song.id)) setLikedDone(true);
      setLoading(false);
    });
  }, [song.id]);

  const filtered = query.trim()
    ? playlists.filter((p) => (p.name || "").toLowerCase().includes(query.trim().toLowerCase()))
    : playlists;

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

  const handleToggle = async (plId) => {
    const wasAdded = addedTo.has(plId);
    setAddedTo((prev) => {
      const next = new Set(prev);
      wasAdded ? next.delete(plId) : next.add(plId);
      return next;
    });
    try {
      if (wasAdded) await removeSongFromPlaylist(plId, song.id);
      else await addSongsToPlaylist(plId, [song.id]);
    } catch {
      setAddedTo((prev) => {
        const next = new Set(prev);
        wasAdded ? next.add(plId) : next.delete(plId);
        return next;
      });
      showError(wasAdded ? "Failed to remove from playlist" : "Failed to add to playlist");
    }
  };

  const handleLike = async () => {
    const wasLiked = likedDone;
    const prevCount = likedCount;
    setLikedDone(!wasLiked);
    if (likedCount != null) setLikedCount(wasLiked ? likedCount - 1 : likedCount + 1);
    try {
      if (wasLiked) await unlikeSong(song.id);
      else {
        const meta = song.local ? { title: song.title, artist: song.artist, album: song.album, duration: song.duration, fileHash: song.file_hash, fileName: song.file_name } : null;
        await likeSong(song.id, meta);
      }
    } catch {
      setLikedDone(wasLiked);
      setLikedCount(prevCount);
      showError(wasLiked ? "Failed to unlike" : "Failed to like");
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`overflow-hidden flex flex-col ${isMobile ? 'w-full h-full' : 'w-full max-w-[400px] rounded-2xl max-h-[75vh]'}`} style={{ background: `linear-gradient(180deg, rgba(${a1}, 0.15) 0%, rgba(${a1}, 0.05) 100%), #111113`, border: isMobile ? 'none' : `1px solid rgba(${a1}, 0.18)`, boxShadow: isMobile ? 'none' : `0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(${a1}, 0.08)` }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={isMobile ? { paddingTop: "max(20px, env(safe-area-inset-top, 20px))" } : undefined}>
          <div>
            <h3 className="text-[15px] font-semibold text-white">Add to Playlist</h3>
            <p className="text-[11px] text-white/30 mt-0.5 truncate max-w-[280px]">{song.title || song.file_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06]">
            <X size={15} />
          </button>
        </div>
        {playlists.length > 3 && (
          <div className="px-5 pb-3">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
              <input
                type="text"
                placeholder="Search playlists..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg bg-white/[0.05] border border-white/[0.06] pl-8 pr-3 py-2 text-[12px] text-white placeholder-white/20 outline-none transition-colors"
                onFocus={(e) => e.target.style.borderColor = `rgba(${a1}, 0.3)`}
                onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.06)"}
              />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-3 pb-4" style={isMobile ? { paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))" } : undefined}>
          <div
            onClick={handleLike}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors mb-1 hover:bg-white/[0.05]"
          >
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${likedDone ? "bg-red-500/20" : "bg-gradient-to-br from-brand-red/30 to-brand-purple/30"}`}>
              <Heart size={16} className={likedDone ? "text-red-400" : "text-red-400/70"} fill={likedDone ? "currentColor" : "none"} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/70">Liked Songs</p>
              <p className="text-[10px] text-white/20">{likedCount != null ? `${likedCount} song${likedCount !== 1 ? "s" : ""}` : "Loading..."}</p>
            </div>
            <Toggle on={likedDone} onClick={handleLike} />
          </div>

          {!query.trim() && <div className="border-t border-white/[0.04] my-2" />}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="animate-spin text-white/30" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-white/20 text-[12px] py-8">
              {query.trim() ? "No matching playlists" : "No playlists yet"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((pl) => {
                const plId = pl._id || pl.id;
                const isAdded = addedTo.has(plId);
                const songCount = Array.isArray(pl.songs) ? pl.songs.length : null;
                return (
                  <div
                    key={plId}
                    onClick={() => handleToggle(plId)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="h-10 w-10 rounded-lg bg-white/[0.06] overflow-hidden flex items-center justify-center flex-shrink-0">
                      <PlaylistCover playlist={pl} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate text-white/70">{pl.name}</p>
                      <p className="text-[10px] text-white/20">
                        {songCount != null ? `${songCount} song${songCount !== 1 ? "s" : ""}` : "Playlist"}
                        {pl._isCollaborator && " · Collab"}
                      </p>
                    </div>
                    <Toggle on={isAdded} onClick={() => handleToggle(plId)} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] font-medium shadow-lg">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}

export default AddToPlaylistModal;
