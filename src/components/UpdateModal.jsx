import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
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
  const [opening, setOpening] = useState(false);

  const release = updateInfo?.release;
  const latestVersion = updateInfo?.latestVersion || "Unknown";
  const currentVersion = updateInfo?.currentVersion || "Unknown";
  const fileSize = release?.size ? formatBytes(release.size) : "";
  const downloadUrl = release?.downloadUrl ? `${CDN}${release.downloadUrl}` : null;

  const handleUpdate = async () => {
    if (opening || !downloadUrl) return;
    setOpening(true);
    try {
      await open(downloadUrl);
      onUpdate?.();
    } catch {
      setOpening(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="w-full max-w-lg overflow-hidden rounded-2xl"
          style={{
            background: `linear-gradient(180deg, rgba(${a1}, 0.16) 0%, rgba(${a0}, 0.07) 42%, rgba(11, 13, 18, 0.985) 100%), #0d1016`,
            border: `1px solid rgba(${a1}, 0.18)`,
            boxShadow: `0 40px 100px rgba(0,0,0,0.62), 0 0 80px rgba(${a1}, 0.1)`,
          }}
        >
          <div
            className="border-b border-white/[0.06] px-6 pb-4 pt-6"
            style={{
              background: `radial-gradient(circle at top left, rgba(${a1}, 0.18), transparent 48%), radial-gradient(circle at top right, rgba(${a0}, 0.12), transparent 44%)`,
            }}
          >
            <div className="mb-4 flex items-center gap-3">
              <img src="/jv-logo.png" alt="JuiceVault" className="h-10 w-10 rounded-xl" />
              <div>
                <h2 className="text-sm font-bold leading-tight text-white">JuiceVault</h2>
                <p className="text-[10px] text-white/40">A new version is available</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-white/45">
                v{currentVersion}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span
                className="rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold"
                style={{
                  background: `rgba(${a1}, 0.16)`,
                  color: theme.accent[1],
                  border: `1px solid rgba(${a1}, 0.24)`,
                }}
              >
                v{latestVersion}
              </span>
              {fileSize && (
                <span className="ml-auto text-[10px] text-white/25">{fileSize}</span>
              )}
            </div>
          </div>

          <div className="border-b border-white/[0.06] px-6 py-5">
            <p className="text-[12px] leading-6 text-white/52">
              This update does not include a changelog in-app. For full details, check the Discord server. It may include new features, removed features, bug fixes, and other improvements.
            </p>
          </div>

          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={onSkip}
              className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65"
            >
              Skip
            </button>
            <button
              onClick={handleUpdate}
              disabled={opening || !downloadUrl}
              className="flex items-center gap-2 rounded-lg px-5 py-2 text-[11px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`,
                boxShadow: `0 4px 20px rgba(${a1}, 0.25)`,
              }}
            >
              {opening ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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
