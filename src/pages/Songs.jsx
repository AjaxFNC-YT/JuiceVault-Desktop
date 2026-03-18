import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, Heart } from "lucide-react";
import { getLikedSongs, fetchSongEras } from "@/lib/api";
import SongList from "@/components/SongList";
import FilterBar, { getDefaultSort } from "@/components/FilterBar";
import { useLocalFiles } from "@/stores/localFilesStore";

function Songs({ onInfo, onAddToPlaylist }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [sortBy, setSortBy] = useState(() => getDefaultSort());
  const [query, setQuery] = useState("");
  const [eraMap, setEraMap] = useState({});
  const [eraLoading, setEraLoading] = useState(false);
  const [activeEras, setActiveEras] = useState(new Set());
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

      const serverIds = liked.filter((s) => !s.local).map((s) => s.id);
      if (serverIds.length) {
        setEraLoading(true);
        fetchSongEras(serverIds).then((m) => setEraMap(m || {})).catch(() => {}).finally(() => setEraLoading(false));
      }
    }).catch(() => setLoading(false));
  }, [localFiles]);

  const { allEras, hasOther } = useMemo(() => {
    const set = new Set();
    let other = false;
    for (const s of songs) {
      const era = s.era || eraMap[s.id];
      if (era) set.add(era);
      else if (!s.local) other = true;
    }
    return { allEras: set, hasOther: other };
  }, [songs, eraMap]);

  const filtered = useMemo(() => {
    let list = songs;
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
        if (!era && !s.local && activeEras.has("__other__")) return true;
        return false;
      });
    }
    return [...list].sort((a, b) => {
      if (sortBy === "a-z") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "z-a") return (b.title || "").localeCompare(a.title || "");
      if (sortBy === "most-played") return (b.play_count || 0) - (a.play_count || 0);
      return 0;
    });
  }, [songs, sortBy, query, activeEras, eraMap]);

  const handleEraToggle = (era) => {
    setActiveEras((prev) => {
      const next = new Set(prev);
      if (next.has(era)) next.delete(era);
      else next.add(era);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
      </div>
    );
  }

  return (
    <motion.div className="px-4 md:px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Heart size={20} className="text-brand-red" fill="currentColor" />
          <div>
            <h1 className="text-2xl font-bold text-white">Liked Songs</h1>
            <p className="text-sm text-white/30">{songs.length} song{songs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

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
