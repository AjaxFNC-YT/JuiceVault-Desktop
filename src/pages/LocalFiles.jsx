import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { HardDrive, Search, RefreshCw, Music2, FolderOpen } from "lucide-react";
import { useLocalFiles } from "@/stores/localFilesStore";
import { usePlayer } from "@/stores/playerStore";
import SongList from "@/components/SongList";

function LocalFiles({ onInfo, onAddToPlaylist }) {
  const { enabled, files, scanning, scanProgress, scanAllSources, sources } = useLocalFiles();
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("list");

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files.filter((f) =>
      f.title?.toLowerCase().includes(q) ||
      f.artist?.toLowerCase().includes(q) ||
      f.album?.toLowerCase().includes(q) ||
      f.file_name?.toLowerCase().includes(q)
    );
  }, [files, query]);

  if (!enabled) {
    return (
      <div className="px-4 md:px-8 py-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <HardDrive size={48} className="text-white/10 mb-4" />
          <h2 className="text-lg font-bold text-white/60 mb-2">Local Files Disabled</h2>
          <p className="text-sm text-white/30 max-w-xs">
            Enable local files in Settings to play audio files from your computer.
          </p>
        </div>
      </div>
    );
  }

  if (!sources.length) {
    return (
      <div className="px-4 md:px-8 py-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={48} className="text-white/10 mb-4" />
          <h2 className="text-lg font-bold text-white/60 mb-2">No Source Folders</h2>
          <p className="text-sm text-white/30 max-w-xs">
            Add source folders in Settings to start indexing your local audio files.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-white">Local Files</h1>
          <p className="text-sm text-white/30 mt-0.5">{files.length} files indexed</p>
        </div>
        <button
          onClick={scanAllSources}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.1] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
          {scanning ? scanProgress || "Scanning..." : "Rescan"}
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
        <input
          type="text"
          placeholder="Search local files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] py-2.5 pl-9 pr-4 text-[13px] text-white placeholder:text-white/20 outline-none focus:border-white/[0.12]"
        />
      </div>

      {scanning && !files.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <RefreshCw size={32} className="text-white/20 animate-spin mb-4" />
          <p className="text-sm text-white/40">{scanProgress || "Scanning..."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music2 size={32} className="text-white/10 mb-3" />
          <p className="text-sm text-white/30">{query ? "No results found" : "No audio files found in source folders"}</p>
        </div>
      ) : (
        <SongList
          songs={filtered}
          viewMode={viewMode}
          onViewChange={setViewMode}
          onInfo={onInfo}
          onAddToPlaylist={onAddToPlaylist}
        />
      )}
    </div>
  );
}

export default LocalFiles;
