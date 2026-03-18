import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  SquareChartGantt, Compass, Radio,
  Clock, Music2, Film, HardDrive,
  Plus, ListMusic, Star, LogOut, Settings, ChevronRight, X,
} from "lucide-react";
import { getMyPlaylists } from "@/lib/api";
import { useTheme } from "@/stores/themeStore";

const NAV_ITEMS = [
  { icon: SquareChartGantt, label: "Overview" },
  { icon: Compass, label: "Browse" },
  { icon: Radio, label: "Radio" },
];

const LIBRARY_ITEMS = [
  { icon: Music2, label: "Liked Songs" },
  { icon: Film, label: "Media" },
  { icon: HardDrive, label: "Local Files" },
];

function Sidebar({ user, onLogout, active, onNavigate, onCreatePlaylist, refreshTrigger, onSettings, mobile, onClose }) {
  const { theme } = useTheme();
  const [playlists, setPlaylists] = useState([]);

  const refreshPlaylists = () => {
    getMyPlaylists()
      .then((res) => {
        const owned = res?.data || [];
        const collab = res?.collaborated || [];
        setPlaylists([...owned, ...collab]);
      })
      .catch(() => {});
  };

  useEffect(() => { refreshPlaylists(); }, [refreshTrigger]);

  if (mobile) {
    return (
      <aside className="relative z-10 flex flex-col h-full w-full" style={{ background: theme.bg }}>
        <div className="flex items-center justify-between flex-shrink-0 px-5" style={{ paddingTop: "max(12px, env(safe-area-inset-top, 12px))" }}>
          <div className="flex items-center gap-2">
            <img src="/jv-logo.png" alt="" className="h-5 w-5 rounded-[4px]" />
            <span className="text-[14px] font-bold uppercase tracking-widest text-white/90">JuiceVault</span>
          </div>
          <button onClick={onClose} className="text-white/50 active:text-white p-2 -mr-2">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-8 -mt-8">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ icon: Icon, label }) => (
              <NavButton key={label} icon={Icon} label={label} active={active === label} onClick={() => onNavigate(label)} mobile />
            ))}
          </div>
          <div className="my-3 border-t border-white/[0.06]" />
          <div className="flex flex-col gap-1">
            {LIBRARY_ITEMS.map(({ icon: Icon, label }) => (
              <NavButton key={label} icon={Icon} label={label} active={active === label} onClick={() => onNavigate(label)} mobile />
            ))}
          </div>
          {playlists.length > 0 && (
            <>
              <div className="my-3 border-t border-white/[0.06]" />
              <div className="flex flex-col gap-1 max-h-[30vh] overflow-y-auto no-scrollbar">
                {playlists.map((pl) => (
                  <NavButton key={pl._id} icon={pl.isPinned ? Star : ListMusic} label={pl.name} active={active === `playlist:${pl._id}`} onClick={() => onNavigate(`playlist:${pl._id}`, pl.name)} mobile />
                ))}
              </div>
            </>
          )}
          <NavButton icon={Plus} label="Create Playlist" onClick={() => { onClose?.(); onCreatePlaylist?.(); }} subtle mobile />
        </div>

        <div className="flex-shrink-0 px-5 pb-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}>
          <div className="flex items-center gap-3">
            {user?.avatar ? (
              <img src={`https://api.juicevault.xyz${user.avatar}`} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${theme.accent[0]}, ${theme.accent[1]})` }}>
                {(user?.displayName || user?.username || "?")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-white/80">{user?.displayName || user?.username}</p>
            </div>
            <button onClick={() => { onClose?.(); onSettings?.(); }} className="text-white/30 active:text-white/60 p-2"><Settings size={18} /></button>
            <button onClick={onLogout} className="text-white/30 active:text-brand-red p-2"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="relative z-10 flex flex-col overflow-hidden border-r border-white/[0.06] h-full w-[240px] flex-shrink-0" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
        <SectionLabel>JuiceVault</SectionLabel>
        {NAV_ITEMS.map(({ icon: Icon, label }) => (
          <NavButton
            key={label}
            icon={Icon}
            label={label}
            active={active === label}
            onClick={() => onNavigate(label)}
          />
        ))}

        <SectionLabel>Library</SectionLabel>
        {LIBRARY_ITEMS.map(({ icon: Icon, label }) => (
          <NavButton
            key={label}
            icon={Icon}
            label={label}
            active={active === label}
            onClick={() => onNavigate(label)}
          />
        ))}

        <SectionLabel>Playlists</SectionLabel>
        <NavButton
          icon={Plus}
          label="Create New..."
          onClick={() => onCreatePlaylist?.()}
          subtle
        />
        {playlists.map((pl) => (
          <NavButton
            key={pl._id}
            icon={pl.isPinned ? Star : ListMusic}
            label={pl.name}
            active={active === `playlist:${pl._id}`}
            onClick={() => onNavigate(`playlist:${pl._id}`, pl.name)}
            hasArrow
          />
        ))}
      </div>

      <div className="flex-shrink-0 border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-3">
          {user?.avatar ? (
            <img src={`https://api.juicevault.xyz${user.avatar}`} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${theme.accent[0]}, ${theme.accent[1]})` }}>
              {(user?.displayName || user?.username || "?")[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white/80">
              {user?.displayName || user?.username}
            </p>
          </div>
          <button
            onClick={onSettings}
            className="text-white/25 hover:text-white/50 transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button
            onClick={onLogout}
            className="text-white/25 hover:text-brand-red transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-widest text-white/25">
      {children}
    </p>
  );
}

function NavButton({ icon: Icon, label, active, onClick, subtle, hasArrow, mobile }) {
  if (mobile) {
    return (
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[16px] ${
          active
            ? "bg-white/[0.08] font-semibold text-white"
            : subtle
              ? "text-white/30 active:text-white/50"
              : "text-white/50 active:bg-white/[0.06] active:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 rounded-md px-3 py-[6px] text-[13px] ${
        active
          ? "bg-white/[0.08] font-semibold text-white"
          : subtle
            ? "text-white/30 hover:text-white/50"
            : "text-white/50 hover:bg-white/[0.08] hover:text-white"
      }`}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
      <span className="truncate">{label}</span>
      {hasArrow && (
        <ChevronRight size={14} className="ml-auto flex-shrink-0 text-white/15 opacity-0 group-hover:opacity-100" />
      )}
    </motion.button>
  );
}

export default Sidebar;
