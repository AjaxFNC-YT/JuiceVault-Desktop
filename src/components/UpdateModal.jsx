import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, ArrowUpCircle, Sparkles } from "lucide-react";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { open } from "@tauri-apps/plugin-shell";

const CDN = "https://api.juicevault.xyz";

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UpdateModal({ updateInfo, onUpdate, onSkip }) {
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const [downloading, setDownloading] = useState(false);

  const release = updateInfo?.release;
  const latestVersion = updateInfo?.latestVersion || "Unknown";
  const currentVersion = updateInfo?.currentVersion || "Unknown";
  const notes = release?.notes || "";
  const fileSize = release?.size ? formatBytes(release.size) : "";
  const downloadUrl = release?.downloadUrl ? `${CDN}${release.downloadUrl}` : null;

  const handleUpdate = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (downloadUrl) await open(downloadUrl);
      onUpdate?.();
    } catch {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onSkip} />

        <motion.div
          className="relative z-10 w-[420px] rounded-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: "linear-gradient(180deg, rgba(26,26,26,0.98) 0%, rgba(18,18,18,0.99) 100%)",
            border: `1px solid rgba(${a1}, 0.2)`,
            boxShadow: `0 40px 100px rgba(0,0,0,0.6), 0 0 80px rgba(${a1}, 0.08)`,
          }}
        >
          <div
            className="relative px-6 pt-6 pb-4"
            style={{
              background: `linear-gradient(135deg, rgba(${a1}, 0.08) 0%, rgba(${a0}, 0.04) 100%)`,
            }}
          >
            <button
              onClick={onSkip}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`,
                  boxShadow: `0 4px 16px rgba(${a1}, 0.3)`,
                }}
              >
                <ArrowUpCircle size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-[15px] font-bold text-white">Update Available</h2>
                <p className="text-[11px] text-white/40">A new version of JuiceVault is ready</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.06] text-white/50">
                v{currentVersion}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{
                  background: `rgba(${a1}, 0.15)`,
                  color: theme.accent[1],
                  border: `1px solid rgba(${a1}, 0.2)`,
                }}
              >
                v{latestVersion}
              </span>
              {fileSize && (
                <span className="text-[10px] text-white/25 ml-auto">{fileSize}</span>
              )}
            </div>
          </div>

          {notes && (
            <div className="px-6 py-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles size={12} className="text-white/30" />
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">What's New</span>
              </div>
              <div className="text-[12px] text-white/50 leading-relaxed max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                {notes.split("\n").map((line, i) => (
                  <p key={i} className={line.trim() ? "mb-1" : "mb-2"}>{line || "\u00A0"}</p>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 py-4 flex items-center gap-3 border-t border-white/[0.06]">
            <button
              onClick={onSkip}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/60 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] transition-all"
            >
              Skip
            </button>
            <button
              onClick={handleUpdate}
              disabled={downloading || !downloadUrl}
              className="flex-[2] py-2.5 rounded-xl text-[12px] font-bold text-white flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`,
                boxShadow: `0 4px 20px rgba(${a1}, 0.25)`,
              }}
            >
              {downloading ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Opening...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Update Now
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default UpdateModal;
