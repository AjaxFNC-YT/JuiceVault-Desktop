import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { getAllSongs } from "@/lib/api";
import SongList from "@/components/SongList";

function RecentlyAdded({ onInfo, onAddToPlaylist }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");

  useEffect(() => {
    getAllSongs()
      .then((res) => {
        const all = res?.songs || [];
        const hasObjectIds = all.length > 0 && /^[a-f0-9]{24}$/i.test(all[0].id);
        let sorted;
        if (hasObjectIds) {
          sorted = [...all].sort((a, b) => {
            const tsA = parseInt(a.id.slice(0, 8), 16);
            const tsB = parseInt(b.id.slice(0, 8), 16);
            return tsB - tsA;
          });
        } else {
          sorted = [...all].reverse();
        }
        setSongs(sorted.slice(0, 100));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div className="px-4 md:px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex items-center gap-3 mb-1">
        <Clock size={20} className="text-white/40" />
        <h1 className="text-2xl font-bold text-white">Recently Added</h1>
      </div>
      <p className="text-sm text-white/30 mb-6">Newest songs in the archive</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
        </div>
      ) : songs.length > 0 ? (
        <>
          <p className="text-[12px] text-white/20 mb-3">{songs.length} songs</p>
          <SongList songs={songs} viewMode={viewMode} onViewChange={setViewMode} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} />
        </>
      ) : (
        <p className="text-center text-white/25 py-16 text-sm">No songs found</p>
      )}
    </motion.div>
  );
}

export default RecentlyAdded;
