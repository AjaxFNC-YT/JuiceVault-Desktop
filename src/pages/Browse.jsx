import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Compass, Folder, ChevronLeft, Music2 } from "lucide-react";
import { searchSongs, getAllSongs, fetchSongEras } from "@/lib/api";
import SongList from "@/components/SongList";
import FilterBar, { getDefaultSort } from "@/components/FilterBar";

const isSessionEdit = (song) => !!song.is_session_edit;

function Browse({ onInfo, onAddToPlaylist }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [initialLoad, setInitialLoad] = useState(true);
  const [inSessionEdits, setInSessionEdits] = useState(false);
  const [sortBy, setSortBy] = useState(() => getDefaultSort());
  const [eraMap, setEraMap] = useState({});
  const [eraLoading, setEraLoading] = useState(false);
  const [activeEras, setActiveEras] = useState(new Set());
  const mergeSessionEdits = localStorage.getItem("mergeSessionEdits") === "true";

  useEffect(() => {
    getAllSongs().then((res) => {
      const songs = res?.songs || [];
      setFeatured(songs);
      setInitialLoad(false);

      const ids = songs.map((s) => s.id).filter(Boolean);
      if (ids.length) {
        setEraLoading(true);
        fetchSongEras(ids).then((m) => setEraMap(m || {})).catch(() => {}).finally(() => setEraLoading(false));
      }
    }).catch(() => setInitialLoad(false));
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchSongs(q.trim());
      const apiResults = res?.results || [];

      const lower = q.trim().toLowerCase();
      const altMatches = featured.filter((song) => {
        const alts = song.alt_names || [];
        return alts.some((name) => name.toLowerCase().includes(lower));
      });

      const seen = new Set();
      const all = [];
      for (const s of [...apiResults, ...altMatches]) {
        const id = s.id || s._id;
        if (!seen.has(id)) { seen.add(id); all.push(s); }
      }

      all.sort((a, b) => {
        const scoreAlt = (song) => {
          const alts = (song.alt_names || []).map((n) => n.toLowerCase());
          if (alts.includes(lower)) return 0;
          if (alts.some((n) => n.includes(lower))) return 1;
          return 2;
        };
        const scoreTitle = (song) => {
          const t = (song.title || "").toLowerCase();
          const ar = (song.artist || "").toLowerCase();
          if (t === lower || ar === lower) return 0;
          if (t.includes(lower) || ar.includes(lower)) return 1;
          return 2;
        };
        const sa = Math.min(scoreAlt(a), scoreTitle(a));
        const sb = Math.min(scoreAlt(b), scoreTitle(b));
        return sa - sb;
      });

      setResults(all.filter((s) => s.title));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [featured]);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const { allEras, hasOther } = useMemo(() => {
    const set = new Set();
    let other = false;
    for (const s of featured) {
      const era = s.era || eraMap[s.id];
      if (era) set.add(era);
      else other = true;
    }
    return { allEras: set, hasOther: other };
  }, [featured, eraMap]);

  const handleEraToggle = (era) => {
    setActiveEras((prev) => {
      const next = new Set(prev);
      if (next.has(era)) next.delete(era);
      else next.add(era);
      return next;
    });
  };

  const applySortAndFilter = (list) => {
    let out = list;
    if (activeEras.size > 0) {
      out = out.filter((s) => {
        const era = s.era || eraMap[s.id];
        if (era && activeEras.has(era)) return true;
        if (!era && activeEras.has("__other__")) return true;
        return false;
      });
    }
    return [...out].sort((a, b) => {
      if (sortBy === "a-z") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "z-a") return (b.title || "").localeCompare(a.title || "");
      if (sortBy === "most-played") return (b.play_count || 0) - (a.play_count || 0);
      return 0;
    });
  };

  const sessionEditSongs = useMemo(() => featured.filter(isSessionEdit), [featured]);
  const regularSongs = useMemo(() => mergeSessionEdits ? featured : featured.filter((s) => !isSessionEdit(s)), [featured, mergeSessionEdits]);
  const searchFiltered = useMemo(() => {
    if (mergeSessionEdits) return results;
    if (inSessionEdits) return results.filter(isSessionEdit);
    return results.filter((s) => !isSessionEdit(s));
  }, [results, mergeSessionEdits, inSessionEdits]);

  const displaySongs = useMemo(() => {
    const base = query.trim() ? searchFiltered : (inSessionEdits ? sessionEditSongs : regularSongs);
    return applySortAndFilter(base);
  }, [query, searchFiltered, inSessionEdits, sessionEditSongs, regularSongs, sortBy, activeEras, eraMap]);

  return (
    <div className="px-4 md:px-8 py-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={inSessionEdits ? "session" : "browse"}
          initial={{ opacity: 0, x: inSessionEdits ? 40 : -40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: inSessionEdits ? -40 : 40 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <div className="flex items-center gap-2 mb-1">
            {inSessionEdits ? (
              <>
                <button onClick={() => { setInSessionEdits(false); setQuery(""); }} className="text-white/40 hover:text-white/60 transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <Folder size={20} className="text-amber-400/60" />
                <h1 className="text-2xl font-bold text-white">Session Edits</h1>
              </>
            ) : (
              <>
                <Compass size={20} className="text-white/40" />
                <h1 className="text-2xl font-bold text-white">Browse</h1>
              </>
            )}
          </div>
          <p className="text-sm text-white/30 mb-4">{inSessionEdits ? `${sessionEditSongs.length} session edits` : "Search the archive"}</p>

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

          <div className="relative mb-6">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder={inSessionEdits ? "Search session edits..." : "Search songs..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] pl-10 pr-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/15"
            />
            {loading && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />}
          </div>

          {initialLoad ? (
            <div className="flex justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
            </div>
          ) : (
            <>
              {!inSessionEdits && !mergeSessionEdits && !query.trim() && sessionEditSongs.length > 0 && (
                <motion.button
                  onClick={() => { setInSessionEdits(true); setQuery(""); }}
                  className="w-full flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 hover:bg-white/[0.05] transition-colors mb-5 group"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="h-12 w-12 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Folder size={22} className="text-amber-400/70" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-white/80 group-hover:text-white transition-colors">Session Edits</p>
                    <p className="text-[11px] text-white/30">{sessionEditSongs.length} songs</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 flex-shrink-0"><path d="M9 18l6-6-6-6" /></svg>
                </motion.button>
              )}

              {displaySongs.length > 0 ? (
                <>
                  {!query.trim() && !inSessionEdits && <p className="text-[12px] text-white/20 mb-3">Popular songs</p>}
                  {!query.trim() && inSessionEdits && <p className="text-[12px] text-white/20 mb-3">All session edits</p>}
                  {query.trim() && <p className="text-[12px] text-white/20 mb-3">{displaySongs.length} result{displaySongs.length !== 1 ? "s" : ""}</p>}
                  <SongList songs={displaySongs} viewMode={viewMode} onViewChange={setViewMode} onInfo={onInfo} onAddToPlaylist={onAddToPlaylist} />
                </>
              ) : query.trim() ? (
                <p className="text-center text-white/25 py-16 text-sm">No results found</p>
              ) : null}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default Browse;
