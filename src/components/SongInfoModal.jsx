import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X, Music2, Download, Tag, Calendar, Mic2, Radio, User,
  Disc3, Clock, FileAudio, Star, MessageSquare, Layers, Hash, Sparkles,
  MapPin, Folder, Users, Wrench, File, Globe, Heart, Zap, Shield,
} from "lucide-react";
import { getSongMetadata, getTrackerInfo, downloadFile } from "@/lib/api";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { useIsMobile } from "@/hooks/useMobile";
import { toApiUrl } from "@/lib/platform";

function norm(key) {
  return key.replace(/[-_ ]/g, "").toLowerCase();
}

const SKIP_NORMS = new Set([
  "id", "v", "songid", "matchedsongid", "matchedsongtitle",
  "tracknumber", "ogname", "othernames", "name", "altnames",
]);

function isSkipped(key) {
  const n = norm(key);
  return n.startsWith("_") || SKIP_NORMS.has(n);
}

const FIELD_STYLE = [
  { match: ["producer", "prod"],                        icon: Mic2,          color: "text-purple-400" },
  { match: ["artist"],                                  icon: Users,         color: "text-rose-400" },
  { match: ["engineer", "mixing", "mastering"],         icon: Wrench,        color: "text-amber-500" },
  { match: ["era"],                                     icon: Calendar,      color: "text-blue-400" },
  { match: ["leakdate", "leaked"],                      icon: Calendar,      color: "text-orange-400" },
  { match: ["recordingdate", "recorddate", "recorded"], icon: Calendar,      color: "text-sky-400" },
  { match: ["recordinglocation", "location", "studio"], icon: MapPin,        color: "text-lime-400" },
  { match: ["type", "songtype"],                        icon: Layers,        color: "text-emerald-400" },
  { match: ["quality", "bitrate", "audio"],             icon: Radio,         color: "text-yellow-400" },
  { match: ["features", "feat", "featuring"],           icon: User,          color: "text-pink-400" },
  { match: ["subsection", "section", "category"],       icon: Disc3,         color: "text-indigo-400" },
  { match: ["emoji", "status"],                         icon: Star,          color: "text-amber-400" },
  { match: ["notes", "note", "description"],            icon: MessageSquare, color: "text-slate-400" },
  { match: ["duration", "length"],                      icon: Clock,         color: "text-teal-400" },
  { match: ["filesize", "size"],                        icon: FileAudio,     color: "text-cyan-400" },
  { match: ["filename", "file"],                        icon: File,          color: "text-zinc-400" },
  { match: ["availablefile", "available", "version"],   icon: Folder,        color: "text-sky-500" },
  { match: ["bpm", "tempo"],                            icon: Hash,          color: "text-rose-400" },
  { match: ["key", "musicalkey"],                       icon: Sparkles,      color: "text-violet-400" },
  { match: ["name", "title", "song"],                   icon: Music2,        color: "text-white/50" },
  { match: ["album"],                                   icon: Disc3,         color: "text-fuchsia-400" },
  { match: ["year", "date"],                            icon: Calendar,      color: "text-blue-400" },
  { match: ["source", "origin"],                        icon: Globe,         color: "text-green-400" },
  { match: ["like", "favorite", "heart"],               icon: Heart,         color: "text-red-400" },
  { match: ["genre", "mood"],                           icon: Zap,           color: "text-orange-300" },
  { match: ["label", "copyright"],                      icon: Shield,        color: "text-neutral-400" },
];

const DEFAULT_STYLE = { icon: Tag, color: "text-white/40" };

function getStyle(key) {
  const n = norm(key);
  for (const entry of FIELD_STYLE) {
    if (entry.match.some((m) => n === m || n.includes(m))) return entry;
  }
  return DEFAULT_STYLE;
}

function formatKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(val) {
  if (val == null || val === "") return null;
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : null;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function getAltNames(meta, tracker) {
  const parts = [];
  if (meta?.alt_names && Array.isArray(meta.alt_names)) {
    parts.push(...meta.alt_names.filter(Boolean).map(String));
  }
  if (tracker) {
    for (const [k, v] of Object.entries(tracker)) {
      const n = norm(k);
      if ((n === "ogname" || n === "name") && v && String(v) !== meta?.title) parts.push(String(v));
      if ((n === "othernames" || n === "altnames") && Array.isArray(v)) parts.push(...v.filter(Boolean).map(String));
    }
  }
  const isRealName = (s) => s.length < 60 && !s.includes(".");
  const unique = [...new Set(parts.filter((p) => p !== meta?.title && isRealName(p)))];
  return unique.length > 0 ? unique.join("  |  ") : null;
}

function SongInfoModal({ songId, onClose }) {
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const [meta, setMeta] = useState(null);
  const [tracker, setTracker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!songId) return;
    setLoading(true);
    Promise.all([
      getSongMetadata(songId).catch(() => null),
      getTrackerInfo(songId).catch(() => null),
    ]).then(([m, t]) => {
      setMeta(m);
      setTracker(t);
      setLoading(false);
    });
  }, [songId]);

  const cover = meta?.cover ? toApiUrl(meta.cover) : null;

  const handleDownload = async () => {
    if (downloading || !meta) return;
    setDownloading(true);
    try {
      await downloadFile(`/music/download/${songId}`, meta.file_name || `${meta.title || songId}.mp3`);
    } catch {} finally {
      setDownloading(false);
    }
  };

  const altNames = getAltNames(meta, tracker);
  const trackerEntries = tracker
    ? Object.entries(tracker).filter(([k, v]) => !isSkipped(k) && formatValue(v) != null)
    : [];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className={`overflow-hidden flex flex-col ${isMobile ? 'w-full h-full' : 'w-full max-w-[560px] max-h-[85vh] rounded-2xl'}`}
        style={{ background: `linear-gradient(180deg, rgba(${a1}, 0.15) 0%, rgba(${a1}, 0.05) 100%), #111113`, border: isMobile ? 'none' : `1px solid rgba(${a1}, 0.18)`, boxShadow: isMobile ? 'none' : `0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(${a1}, 0.08)` }}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: theme.accent[0] }} />
          </div>
        ) : meta ? (
          <>
            <div className="relative flex-shrink-0">
              {cover ? (
                <div className="relative h-44 w-full">
                  <img src={cover} alt="" className="h-full w-full object-cover" style={{ filter: "blur(30px) brightness(0.4) saturate(1.4)" }} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img src={cover} alt="" className="h-28 w-28 rounded-xl object-cover shadow-2xl border border-white/[0.08]" />
                  </div>
                </div>
              ) : (
                <div className="flex h-44 items-center justify-center bg-white/[0.03]">
                  <Music2 size={40} className="text-white/10" />
                </div>
              )}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="p-1.5 rounded-lg bg-black/40 text-white/50 hover:text-white/80 backdrop-blur-sm disabled:opacity-50"
                  title="Save to disk"
                >
                  <Download size={15} />
                </button>
                <button onClick={onClose} className="p-1.5 rounded-lg bg-black/40 text-white/50 hover:text-white/80 backdrop-blur-sm">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5" style={isMobile ? { paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" } : undefined}>
              <h2 className="text-lg font-bold text-white">
                {meta.title}{altNames ? <span className="text-white/30 font-normal">  |  {altNames}</span> : null}
              </h2>
              <p className="text-sm text-white/40 mt-0.5">{meta.artist}</p>

              {trackerEntries.length > 0 ? (
                <div className="mt-5 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
                  {trackerEntries.map(([key, val]) => {
                    const { icon: Icon, color } = getStyle(key);
                    return (
                      <div key={key} className="flex items-start gap-3 px-4 py-2.5">
                        <Icon size={13} className={`${color} mt-0.5 flex-shrink-0 opacity-70`} />
                        <span className={`text-[11px] font-medium ${color} opacity-60 w-28 flex-shrink-0 pt-px`}>{formatKey(key)}</span>
                        <span className="text-[13px] text-white/70 break-words min-w-0 flex-1 leading-snug">{formatValue(val)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-white/20 mt-5">No tracker info available</p>
              )}

              <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <p className="text-[11px] text-white/15 truncate flex-1 mr-2">{meta.file_name}</p>
                <p className="text-[10px] text-white/10 flex-shrink-0">{meta.id}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-white/30 text-sm">Failed to load song info</div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default SongInfoModal;
