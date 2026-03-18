import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  SquareChartGantt, Compass, Radio,
  Clock, Music2, Film, HardDrive,
  Plus, ListMusic, Star, LogOut, Settings, ChevronRight,
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

function Sidebar({ user, onLogout, active, onNavigate, onCreatePlaylist, refreshTrigger, onSettings, mobile }) {
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

  return (
    <aside className={`relative z-10 flex flex-col overflow-hidden border-r border-white/[0.06] ${mobile ? 'h-full w-full' : 'h-full w-[240px] flex-shrink-0'}`} style={{ background: mobile ? theme.bg : 'rgba(255,255,255,0.02)' }}>
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

function NavButton({ icon: Icon, label, active, onClick, subtle, hasArrow }) {
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
