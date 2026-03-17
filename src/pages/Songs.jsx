import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, Heart, Loader2 } from "lucide-react";
import { getLikedSongs } from "@/lib/api";
import SongList from "@/components/SongList";
import { useLocalFiles } from "@/stores/localFilesStore";

function Songs({ onInfo, onAddToPlaylist }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [sortBy, setSortBy] = useState("title");
  const [query, setQuery] = useState("");
  const { files: localFiles } = useLocalFiles() || { files: [] };

  useEffect(() => {
    const localMap = new Map(localFiles.map((f) => [f.file_hash, f]));
    getLikedSongs().then((res) => {
      const liked = (res?.data || []).map((entry) => {
        const song = entry.song;
        if (!song) return null;
        if (song.id?.startsWith("local:") || entry.songId?.startsWith("local:")) {
          const hash = (song.id || entry.songId).replace("local:", "");
          const local = localMap.get(hash);
          if (local) return local;
          return { ...song, id: `local:${hash}`, local: true };
        }
        return song;
      }).filter(Boolean);
      setSongs(liked);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [localFiles]);

  const filtered = useMemo(() => {
    let list = songs;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.artist || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "plays") return (b.play_count || 0) - (a.play_count || 0);
      return 0;
    });
  }, [songs, sortBy, query]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
      </div>
    );
  }

  return (
    <motion.div className="px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart size={20} className="text-brand-red" fill="currentColor" />
          <div>
            <h1 className="text-2xl font-bold text-white">Liked Songs</h1>
            <p className="text-sm text-white/30">{songs.length} song{songs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {["title", "plays"].map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1 rounded-lg text-[12px] ${
                sortBy === s ? "bg-white/[0.08] text-white font-medium" : "text-white/30 hover:text-white/50"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search liked songs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] pl-10 pr-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/15"
        />
      </div>

      {filtered.length > 0 ? (
        <SongList songs={filtered} viewMode={viewMode} onViewChange={setViewMode} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} likedIds={new Set(songs.map((s) => s.id))} />
      ) : query.trim() ? (
        <p className="text-center text-white/25 py-16 text-sm">No matches found</p>
      ) : (
        <p className="text-center text-white/25 py-16 text-sm">No liked songs yet</p>
      )}
    </motion.div>
  );
}

export default Songs;
