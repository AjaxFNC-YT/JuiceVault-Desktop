import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Music2, Trash2, ArrowLeft, Pencil, ImagePlus, X, ListMusic, Shuffle, Search } from "lucide-react";
import { getPlaylist, removeSongFromPlaylist, updatePlaylist, deletePlaylist, uploadPlaylistCover, removePlaylistCover, fetchSongEras } from "@/lib/api";
import { usePlayer } from "@/stores/playerStore";
import { useTheme } from "@/stores/themeStore";
import SongContextMenu from "@/components/SongContextMenu";
import FilterBar, { getDefaultSort } from "@/components/FilterBar";

const CDN = "https://api.juicevault.xyz";

function PlaylistView({ playlistId, playlistName, onBack, onInfo, onAddToPlaylist, onPlaylistChanged, onPlaylistDeleted }) {
  const { theme } = useTheme();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const coverInputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState(() => getDefaultSort());
  const [eraMap, setEraMap] = useState({});
  const [eraLoading, setEraLoading] = useState(false);
  const [activeEras, setActiveEras] = useState(new Set());
  const { playTrack } = usePlayer();

  useEffect(() => {
    if (!playlistId) return;
    setLoading(true);
    getPlaylist(playlistId).then((res) => {
      const pl = res?.data || null;
      setPlaylist(pl);
      if (pl) {
        setEditName(pl.name || "");
        setEditDesc(pl.description || "");
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [playlistId]);

  const rawSongs = (playlist?.songs || []).map((s) => s.song).filter(Boolean);
  const coverUrl = playlist?.coverImage ? `${CDN}${playlist.coverImage}` : null;

  useEffect(() => {
    if (!rawSongs.length) return;
    const ids = rawSongs.map((s) => s.id).filter(Boolean);
    if (ids.length) {
      setEraLoading(true);
      fetchSongEras(ids).then((m) => setEraMap(m || {})).catch(() => {}).finally(() => setEraLoading(false));
    }
  }, [playlist]);

  const { allEras, hasOther } = useMemo(() => {
    const set = new Set();
    let other = false;
    for (const s of rawSongs) {
      const era = s.era || eraMap[s.id];
      if (era) set.add(era);
      else other = true;
    }
    return { allEras: set, hasOther: other };
  }, [rawSongs, eraMap]);

  const handleEraToggle = (era) => {
    setActiveEras((prev) => {
      const next = new Set(prev);
      if (next.has(era)) next.delete(era);
      else next.add(era);
      return next;
    });
  };

  const songs = useMemo(() => {
    let list = rawSongs;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.artist || "").toLowerCase().includes(q)
      );
    }
    if (activeEras.size > 0) {
      list = list.filter((s) => {
        const era = s.era || eraMap[s.id];
        if (era && activeEras.has(era)) return true;
        if (!era && activeEras.has("__other__")) return true;
        return false;
      });
    }
    return [...list].sort((a, b) => {
      if (sortBy === "a-z") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "z-a") return (b.title || "").localeCompare(a.title || "");
      if (sortBy === "most-played") return (b.play_count || 0) - (a.play_count || 0);
      return 0;
    });
  }, [rawSongs, query, sortBy, activeEras, eraMap]);

  const handlePlay = (song, idx) => playTrack(song, songs, idx);

  const handlePlayAll = () => {
    if (songs.length > 0) playTrack(songs[0], songs, 0);
  };

  const handleShufflePlay = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled, 0);
  };

  const handleRemove = async (songId) => {
    try {
      await removeSongFromPlaylist(playlistId, songId);
      setPlaylist((prev) => ({ ...prev, songs: prev.songs.filter((s) => s.songId !== songId) }));
    } catch {}
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updatePlaylist(playlistId, editName.trim(), editDesc.trim(), playlist?.isPublic ?? true);
      setPlaylist((prev) => ({ ...prev, name: editName.trim(), description: editDesc.trim() }));
      setEditing(false);
      onPlaylistChanged?.();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    try {
      await deletePlaylist(playlistId);
      onPlaylistDeleted?.();
    } catch {}
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await uploadPlaylistCover(playlistId, new Uint8Array(buf), file.name);
      const newCover = res?.data?.coverImage;
      if (newCover) setPlaylist((prev) => ({ ...prev, coverImage: newCover }));
      onPlaylistChanged?.();
    } catch (err) {
      console.error("Cover upload failed:", err);
    }
    setCoverUploading(false);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const handleCoverRemove = async () => {
    try {
      await removePlaylistCover(playlistId);
      setPlaylist((prev) => ({ ...prev, coverImage: null }));
      onPlaylistChanged?.();
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
      </div>
    );
  }

  return (
    <motion.div className="px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/50 mb-4">
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="flex gap-5 mb-6">
        <div className="relative group flex-shrink-0">
          <div className="w-32 h-32 rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden flex items-center justify-center">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : songs.length >= 4 ? (
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                {songs.slice(-4).reverse().map((s, i) => (
                  <div key={i} className="overflow-hidden">
                    {s.cover ? <img src={`${CDN}${s.cover}`} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/[0.03]" />}
                  </div>
                ))}
              </div>
            ) : (
              <ListMusic size={32} className="text-white/10" />
            )}
          </div>
          <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => coverInputRef.current?.click()}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
              title="Upload cover"
            >
              {coverUploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : <ImagePlus size={16} />}
            </button>
            {coverUrl && (
              <button onClick={handleCoverRemove} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 transition-colors" title="Remove cover">
                <X size={16} />
              </button>
            )}
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
        </div>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-bold text-white bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-1.5 outline-none focus:border-white/20"
                autoFocus
              />
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Description (optional)"
                className="text-sm text-white/60 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 outline-none focus:border-white/15 placeholder-white/20"
              />
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5 ml-auto">
                  <button onClick={() => setEditing(false)} className="text-[12px] text-white/30 hover:text-white/50 px-3 py-1 rounded-lg">Cancel</button>
                  <button onClick={handleSave} disabled={saving || !editName.trim()} className="text-[12px] font-semibold text-white bg-brand-red/80 hover:bg-brand-red px-3 py-1 rounded-lg disabled:opacity-40">
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white truncate">{playlist?.name || playlistName}</h1>
                <button onClick={() => setEditing(true)} className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0" title="Edit">
                  <Pencil size={14} />
                </button>
              </div>
              <p className="text-sm text-white/30 mb-2">
                {songs.length} song{songs.length !== 1 ? "s" : ""}
                {playlist?.description && <span className="text-white/20"> · {playlist.description}</span>}
              </p>
              <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 mt-2 text-[11px] text-white/20 hover:text-brand-red transition-colors">
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] rounded-2xl bg-[#141414] border border-white/[0.08] p-6"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-red/10">
                  <Trash2 size={18} className="text-brand-red" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-white">Delete Playlist</h3>
                  <p className="text-[12px] text-white/30">This action cannot be undone</p>
                </div>
              </div>
              <p className="text-[13px] text-white/50 mb-5">
                Are you sure you want to delete <span className="text-white/80 font-medium">{playlist?.name}</span>? All songs will be removed from this playlist.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="text-[13px] text-white/40 hover:text-white/60 px-4 py-2 rounded-lg hover:bg-white/[0.05] transition-colors">Cancel</button>
                <button onClick={handleDelete} className="text-[13px] font-semibold text-white bg-brand-red hover:bg-brand-red/80 px-4 py-2 rounded-lg transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {rawSongs.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <button onClick={handlePlayAll} className="flex items-center gap-1.5 text-[12px] font-semibold text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity" style={{ background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})` }}>
            <Play size={14} fill="currentColor" /> Play All
          </button>
          <button onClick={handleShufflePlay} className="flex items-center gap-1.5 text-[12px] font-medium text-white/50 hover:text-white/70 bg-white/[0.05] border border-white/[0.08] px-4 py-2 rounded-lg transition-colors">
            <Shuffle size={14} /> Shuffle
          </button>
        </div>
      )}

      {rawSongs.length > 0 && (
        <>
          <FilterBar
            eras={allEras}
            eraLoading={eraLoading}
            activeEras={activeEras}
            onEraToggle={handleEraToggle}
            onClearEras={() => setActiveEras(new Set())}
            sortBy={sortBy}
            onSortChange={setSortBy}
            hasOther={hasOther}
          />
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search in playlist..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] pl-10 pr-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/15"
            />
          </div>
        </>
      )}

      {songs.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {songs.map((song, i) => {
            const cover = song.cover ? `${CDN}${song.cover}` : null;
            return (
              <div key={song.id} className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.05]">
                <button onClick={() => handlePlay(song, i)} className="w-6 text-center flex-shrink-0">
                  <span className="text-[12px] text-white/20 group-hover:hidden">{i + 1}</span>
                  <span className="hidden group-hover:block">
                    <Play size={12} className="text-white mx-auto" fill="white" />
                  </span>
                </button>
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
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0 ml-2">
                  <SongContextMenu song={song} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} />
                  <button
                    onClick={() => handleRemove(song.id)}
                    className="p-1 rounded-md text-white/20 hover:text-brand-red hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        rawSongs.length > 0 ? (
          <p className="text-center text-white/25 py-16 text-sm">No matches found</p>
        ) : (
          <p className="text-center text-white/25 py-16 text-sm">This playlist is empty — add songs from Browse or the play bar</p>
        )
      )}
    </motion.div>
  );
}

export default PlaylistView;
