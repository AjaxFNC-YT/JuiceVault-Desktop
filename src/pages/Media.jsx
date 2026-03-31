import { useState, useEffect, useRef, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Film, Play, LayoutGrid, List, Search, Image, Video } from "lucide-react";
import { getAllMedia } from "@/lib/api";
import MediaViewer from "@/components/MediaViewer";
import { useFuzzySearchEnabled } from "@/hooks/useFuzzySearch";
import { searchCollection } from "@/lib/search";

const TYPE_FILTERS = [
  { key: "all", label: "All", icon: Film },
  { key: "video", label: "Videos", icon: Video },
  { key: "image", label: "Images", icon: Image },
];

const CDN = "https://api.juicevault.xyz";
const ROW_H = 52;
const OVERSCAN = 20;
const CARD_BATCH = 40;

function getScrollParent(el) {
  let p = el?.parentElement;
  while (p) {
    if (p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY !== "visible") return p;
    p = p.parentElement;
  }
  return document.documentElement;
}

function Media({ onMediaView }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewing, setViewing] = useState(null);
  const fuzzySearch = useFuzzySearchEnabled();

  useEffect(() => {
    if (viewing) {
      onMediaView?.({ type: viewing.type, title: viewing.title || viewing.file_name });
    } else {
      onMediaView?.(null);
    }
  }, [viewing]);
  const wrapRef = useRef(null);
  const [visRange, setVisRange] = useState({ s: 0, e: 80 });
  const [cardLimit, setCardLimit] = useState(CARD_BATCH);

  useEffect(() => {
    getAllMedia().then((res) => {
      setMedia(res?.media || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = media;
    if (typeFilter === "video") list = list.filter((m) => m.type?.startsWith("video/"));
    else if (typeFilter === "image") list = list.filter((m) => m.type?.startsWith("image/"));
    if (query.trim()) {
      list = searchCollection(
        list,
        query,
        (item) => [item.title, item.file_name, item.type],
        { fuzzy: fuzzySearch },
      );
    }
    return list;
  }, [media, typeFilter, query, fuzzySearch]);

  useEffect(() => { setCardLimit(CARD_BATCH); }, [filtered, viewMode]);

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
      const e = Math.min(filtered.length, Math.ceil((off + vh) / ROW_H) + OVERSCAN);
      setVisRange({ s, e });
    };

    sp.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => { sp.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [filtered.length, viewMode]);

  useEffect(() => {
    if (viewMode !== "card" || cardLimit >= filtered.length) return;
    const el = wrapRef.current;
    if (!el) return;
    const sp = getScrollParent(el);

    const onScroll = () => {
      const h = sp === document.documentElement ? document.body.scrollHeight : sp.scrollHeight;
      const st = sp === document.documentElement ? window.scrollY : sp.scrollTop;
      const ch = sp === document.documentElement ? window.innerHeight : sp.clientHeight;
      if (st + ch > h - 600) setCardLimit((c) => Math.min(c + CARD_BATCH, filtered.length));
    };

    sp.addEventListener("scroll", onScroll, { passive: true });
    return () => sp.removeEventListener("scroll", onScroll);
  }, [filtered.length, viewMode, cardLimit]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-brand-red" />
      </div>
    );
  }

  return (
    <motion.div className="px-4 md:px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Film size={20} className="text-white/40" />
            <h1 className="text-2xl font-bold text-white">Media</h1>
          </div>
          <p className="text-sm text-white/30">{filtered.length} of {media.length} files</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1">
            {TYPE_FILTERS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  onClick={() => setTypeFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    typeFilter === f.key
                      ? "bg-white/[0.1] text-white"
                      : "text-white/35 hover:text-white/55"
                  }`}
                >
                  <Icon size={13} />
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md ${viewMode === "list" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"}`}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => setViewMode("card")}
              className={`p-1.5 rounded-md ${viewMode === "card" ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"}`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search media..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] pl-10 pr-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-white/15"
        />
      </div>

      <div ref={wrapRef}>
        {viewMode === "list" ? (
          <div style={{ height: filtered.length * ROW_H, position: "relative" }}>
            {filtered.slice(visRange.s, visRange.e).map((item, i) => {
              const idx = visRange.s + i;
              return (
                <div key={item.id} style={{ position: "absolute", top: idx * ROW_H, left: 0, right: 0, height: ROW_H }}>
                  <MemoMediaRow item={item} onClick={setViewing} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.slice(0, cardLimit).map((item) => (
              <MemoMediaCard key={item.id} item={item} onClick={setViewing} />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewing && <MediaViewer item={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

const MemoMediaCard = memo(function MediaCard({ item, onClick }) {
  const thumb = item.thumbnail ? `${CDN}${item.thumbnail}` : null;

  return (
    <button
      onClick={() => onClick(item)}
      className="group flex flex-col rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 hover:bg-white/[0.06] text-left w-full"
    >
      <div className="relative aspect-video w-full rounded-lg bg-white/[0.06] overflow-hidden mb-3">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film size={24} className="text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-red">
            <Play size={18} className="text-white ml-0.5" fill="white" />
          </div>
        </div>
        {item.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white/70">
            {item.duration}
          </span>
        )}
      </div>
      <p className="truncate text-[13px] font-medium text-white/80">{item.title || item.file_name}</p>
      <p className="truncate text-[11px] text-white/30 mt-0.5">{item.file_size}</p>
    </button>
  );
});

const MemoMediaRow = memo(function MediaRow({ item, onClick }) {
  const thumb = item.thumbnail ? `${CDN}${item.thumbnail}` : null;

  return (
    <button
      onClick={() => onClick(item)}
      className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.05] w-full h-full text-left"
    >
      <div className="h-9 w-14 rounded bg-white/[0.06] overflow-hidden flex-shrink-0">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film size={12} className="text-white/20" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white/80">{item.title || item.file_name}</p>
        <p className="truncate text-[11px] text-white/30">{item.type}</p>
      </div>
      <span className="text-[12px] text-white/20 flex-shrink-0">{item.duration}</span>
      <span className="text-[11px] text-white/15 w-16 text-right flex-shrink-0">{item.file_size}</span>
    </button>
  );
});

export default Media;
