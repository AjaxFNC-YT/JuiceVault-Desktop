import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check, SlidersHorizontal, FolderSync, HardDrive, FolderPlus, Trash2, RefreshCw } from "lucide-react";
import { useTheme, THEMES, hexToRgb } from "@/stores/themeStore";
import { useLocalFiles } from "@/stores/localFilesStore";
import { open } from "@tauri-apps/plugin-dialog";
import { updateUserPreferences } from "@/lib/api";
import { useIsMobile } from "@/hooks/useMobile";
import { getTitlebarStyle, setTitlebarStyle, IS_TAURI } from "@/lib/platform";
import { getFuzzySearchEnabled, setFuzzySearchEnabled } from "@/lib/search";

function Toggle({ on, onToggle, color = "bg-brand-red" }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${on ? color : "bg-white/[0.1]"}`}
    >
      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-[2px]"}`} />
    </button>
  );
}

function SettingsModal({ onClose, discordRpc, setDiscordRpc, onOpenPlayerPrefs }) {
  const isMobile = useIsMobile();
  const { themeId, setThemeId, theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const { enabled: localEnabled, sources, scanning, scanProgress, setEnabled: setLocalEnabled, addSource, removeSource, scanAllSources } = useLocalFiles();
  const [mergeSE, setMergeSE] = useState(localStorage.getItem("mergeSessionEdits") === "true");
  const [titlebarStyle, setTitlebarStyleState] = useState(getTitlebarStyle());
  const [fuzzySearch, setFuzzySearchState] = useState(getFuzzySearchEnabled());

  const handleAddSource = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select Music Folder" });
      if (selected) addSource(selected);
    } catch {}
  };

  const handleTitlebarStyleChange = (style) => {
    setTitlebarStyleState(style);
    setTitlebarStyle(style);
    updateUserPreferences({ titlebarStyle: style }).catch(() => {});
  };

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
        className={`overflow-hidden flex flex-col ${isMobile ? 'w-full h-full' : 'w-full max-w-[580px] max-h-[85vh] rounded-2xl'}`}
        style={{ background: `linear-gradient(180deg, rgba(${a1}, 0.15) 0%, rgba(${a1}, 0.05) 100%), #111113`, border: isMobile ? 'none' : `1px solid rgba(${a1}, 0.18)`, boxShadow: isMobile ? 'none' : `0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(${a1}, 0.08)` }}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: `1px solid rgba(${a1}, 0.1)`, paddingTop: isMobile ? "max(16px, env(safe-area-inset-top, 16px))" : undefined }}>
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6" style={isMobile ? { paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" } : undefined}>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Theme</p>
            <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-4'} gap-3`}>
              {THEMES.map((t) => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`group relative rounded-xl overflow-hidden border transition-all ${
                      active ? "ring-1" : "border-white/[0.08] hover:border-white/[0.15]"
                    }`}
                    style={active ? { borderColor: theme.accent[0], boxShadow: `0 0 0 1px rgba(${a0}, 0.3)` } : {}}
                  >
                    <div
                      className="h-16 w-full"
                      style={{
                        backgroundColor: t.bg,
                        backgroundImage: t.gradients.join(", ") || "none",
                      }}
                    />
                    <div className="px-2 py-1.5 bg-white/[0.02]">
                      <p className={`text-[10px] font-medium truncate ${active ? "text-white" : "text-white/40"}`}>{t.name}</p>
                    </div>
                    {active && (
                      <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full flex items-center justify-center" style={{ background: theme.accent[0] }}>
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Player</p>
            <button
              onClick={() => { onClose(); onOpenPlayerPrefs?.(); }}
              className="w-full flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-3">
                <SlidersHorizontal size={18} className="text-white/40" />
                <div className="text-left">
                  <p className="text-[13px] font-medium text-white/80">Player Preferences</p>
                  <p className="text-[11px] text-white/30">{isMobile ? "Equalizer & audio settings" : "Equalizer, crossfade & audio settings"}</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </section>

          {IS_TAURI && !isMobile && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Window</p>
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2 flex gap-2">
                {[
                  { id: "windows", label: "Windows", hint: "Right-side controls" },
                  { id: "macos", label: "macOS", hint: "Traffic lights on left" },
                ].map((option) => {
                  const active = titlebarStyle === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleTitlebarStyleChange(option.id)}
                      className="flex-1 rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={active ? { background: `rgba(${a1}, 0.12)`, boxShadow: `0 0 0 1px rgba(${a1}, 0.18) inset` } : undefined}
                    >
                      <p className={`text-[13px] font-medium ${active ? "text-white" : "text-white/65"}`}>{option.label}</p>
                      <p className="text-[11px] text-white/30 mt-0.5">{option.hint}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Local Files</p>

            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 mb-3">
              <div className="flex items-center gap-3">
                <HardDrive size={18} className="text-emerald-400/60 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-medium text-white/80">Enable Local Files</p>
                  <p className="text-[11px] text-white/30">Play audio files from your computer</p>
                </div>
              </div>
              <Toggle on={localEnabled} onToggle={() => setLocalEnabled(!localEnabled)} color="bg-emerald-500" />
            </div>

            {localEnabled && (
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
                  <p className="text-[12px] font-medium text-white/50">Source Folders</p>
                  <div className="flex items-center gap-1.5">
                    {sources.length > 0 && (
                      <button
                        onClick={scanAllSources}
                        disabled={scanning}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
                        {scanning ? "Scanning..." : "Rescan"}
                      </button>
                    )}
                    <button
                      onClick={handleAddSource}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/[0.08] transition-colors"
                    >
                      <FolderPlus size={12} />
                      Add Folder
                    </button>
                  </div>
                </div>

                {sources.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[12px] text-white/20">No source folders added yet</p>
                    <p className="text-[11px] text-white/10 mt-1">Click "Add Folder" to index your music</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {sources.map((src) => (
                      <div key={src} className="flex items-center justify-between px-4 py-2.5 group">
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-[12px] text-white/60 truncate" title={src}>{src}</p>
                        </div>
                        <button
                          onClick={() => removeSource(src)}
                          className="p-1 rounded text-white/15 hover:text-red-400 hover:bg-red-400/[0.08] transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove source"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {scanning && scanProgress && (
                  <div className="px-4 py-2 border-t border-white/[0.04] bg-emerald-400/[0.03]">
                    <p className="text-[11px] text-emerald-400/60">{scanProgress}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Browse</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-3">
                  <FolderSync size={18} className="text-amber-400/60 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-white/80">Merge Session Edits</p>
                    <p className="text-[11px] text-white/30">Show session edits inline instead of a folder</p>
                  </div>
                </div>
                <Toggle on={mergeSE} onToggle={() => { const v = !mergeSE; setMergeSE(v); localStorage.setItem("mergeSessionEdits", String(v)); updateUserPreferences({ mergeSessionEdits: v }).catch(() => {}); }} color="bg-amber-500" />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-3">
                  <SlidersHorizontal size={18} className="text-sky-400/60 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-white/80">Fuzzy Search</p>
                    <p className="text-[11px] text-white/30">Match spacing, punctuation, plurals, and close spellings</p>
                  </div>
                </div>
                <Toggle
                  on={fuzzySearch}
                  onToggle={() => {
                    const next = !fuzzySearch;
                    setFuzzySearchState(next);
                    setFuzzySearchEnabled(next);
                  }}
                  color="bg-sky-500"
                />
              </div>
            </div>
          </section>

          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 mb-3">Integrations</p>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#5865F2] flex-shrink-0">
                  <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.36-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" fill="currentColor"/>
                </svg>
                <div>
                  <p className="text-[13px] font-medium text-white/80">Discord Rich Presence</p>
                  <p className="text-[11px] text-white/30">Show what you're listening to</p>
                </div>
              </div>
              <Toggle on={discordRpc} onToggle={() => setDiscordRpc?.(!discordRpc)} />
            </div>
          </section>

        </div>
      </motion.div>
    </motion.div>
  );
}

export default SettingsModal;
