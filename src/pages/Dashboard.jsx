import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu } from "lucide-react";
import Background from "@/components/Background";
import Sidebar from "@/components/Sidebar";
import Overview from "@/pages/Overview";
import Browse from "@/pages/Browse";
import Songs from "@/pages/Songs";
import Media from "@/pages/Media";
import Radio from "@/pages/Radio";
import RecentlyAdded from "@/pages/RecentlyAdded";
import LocalFiles from "@/pages/LocalFiles";
import PlaylistView from "@/pages/PlaylistView";
import PlayBar from "@/components/PlayBar";
import FullscreenPlayer from "@/components/FullscreenPlayer";
import CreatePlaylistModal from "@/components/CreatePlaylistModal";
import SongInfoModal from "@/components/SongInfoModal";
import AddToPlaylistModal from "@/components/AddToPlaylistModal";
import SettingsModal from "@/components/SettingsModal";
import PlayerPreferencesModal from "@/components/PlayerPreferencesModal";
import { useDiscordRPC } from "@/hooks/useDiscordRPC";
import { updateUserPreferences } from "@/lib/api";
import { useIsMobile } from "@/hooks/useMobile";
import { IS_TAURI } from "@/lib/platform";
import { useTheme } from "@/stores/themeStore";

const SKIPPED_UPDATE_VERSION_KEY = "skipped_update_version";
const LAST_UPDATE_INFO_KEY = "last_update_info";
const UPDATE_STATE_EVENT = "juicevault-update-state";

const pageFade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" },
};

function Dashboard({ user, onLogout }) {
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const [activePage, setActivePage] = useState("Overview");
  const [playlistMeta, setPlaylistMeta] = useState({ id: null, name: "" });
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [infoSongId, setInfoSongId] = useState(null);
  const [addToPlaylistSong, setAddToPlaylistSong] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlayerPrefs, setShowPlayerPrefs] = useState(false);
  const [discordRpc, setDiscordRpc] = useState(() => localStorage.getItem("discordRpc") !== "false");
  const [mediaViewing, setMediaViewing] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasUpdateNotice, setHasUpdateNotice] = useState(false);
  useEffect(() => { localStorage.setItem("discordRpc", String(discordRpc)); updateUserPreferences({ discordRpc }).catch(() => {}); }, [discordRpc]);
  useDiscordRPC(discordRpc, { activePage, playlistName: playlistMeta.name, mediaViewing });
  const [playlistRefresh, setPlaylistRefresh] = useState(0);
  const refreshPlaylists = () => setPlaylistRefresh((n) => n + 1);

  useEffect(() => {
    const syncUpdateNotice = () => {
      const updateInfo = localStorage.getItem(LAST_UPDATE_INFO_KEY);
      const skipped = localStorage.getItem(SKIPPED_UPDATE_VERSION_KEY);
      setHasUpdateNotice(Boolean(updateInfo || skipped));
    };

    syncUpdateNotice();
    window.addEventListener(UPDATE_STATE_EVENT, syncUpdateNotice);
    window.addEventListener("storage", syncUpdateNotice);
    return () => {
      window.removeEventListener(UPDATE_STATE_EVENT, syncUpdateNotice);
      window.removeEventListener("storage", syncUpdateNotice);
    };
  }, []);

  const handleNavigate = (page, extra) => {
    if (page.startsWith("playlist:")) {
      const id = page.replace("playlist:", "");
      setPlaylistMeta({ id, name: extra || "Playlist" });
    }
    setActivePage(page);
    if (isMobile) setSidebarOpen(false);
  };

  const handlePlaylistCreated = () => {
    setShowCreatePlaylist(false);
    refreshPlaylists();
  };

  const isPlaylist = activePage.startsWith("playlist:");

  const renderPage = () => {
    const songActions = { onInfo: (id) => setInfoSongId(id), onAddToPlaylist: (song) => setAddToPlaylistSong(song) };
    if (activePage === "Browse") return <Browse {...songActions} />;
    if (activePage === "Liked Songs") return <Songs {...songActions} />;
    if (activePage === "Radio") return <Radio />;
    if (activePage === "Recently Added") return <RecentlyAdded {...songActions} />;
    if (activePage === "Media") return <Media onMediaView={setMediaViewing} />;
    if (activePage === "Local Files") return <LocalFiles {...songActions} />;
    if (isPlaylist) return <PlaylistView playlistId={playlistMeta.id} playlistName={playlistMeta.name} onBack={() => setActivePage("Overview")} onPlaylistChanged={refreshPlaylists} onPlaylistDeleted={() => { refreshPlaylists(); setActivePage("Overview"); }} {...songActions} />;
    return (
      <div className="px-4 md:px-8 py-6">
        <h1 className="text-2xl font-bold text-white">{activePage}</h1>
        <p className="mt-1 text-sm text-white/30">Coming soon</p>
      </div>
    );
  };

  return (
    <div className={`${isMobile || !IS_TAURI ? "app-fixed-viewport" : "desktop-safe-fixed-viewport"} flex flex-col overflow-hidden`}>
      <Background />

      {isMobile && !sidebarOpen && (
        <div className="relative z-30 flex items-center justify-between px-4 flex-shrink-0"
          style={{
            background: `${theme.bg}ee`,
            backdropFilter: "blur(12px)",
            paddingTop: "max(8px, env(safe-area-inset-top, 8px))",
            paddingBottom: "8px",
            paddingLeft: "max(16px, env(safe-area-inset-left, 16px))",
            paddingRight: "max(16px, env(safe-area-inset-right, 16px))",
          }}
        >
          <button onClick={() => setSidebarOpen(true)} className="text-white/60 active:text-white p-1">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <img src="/jv-logo.png" alt="" className="h-[18px] w-[18px] rounded-[4px]" />
            <span className="text-[13px] font-bold uppercase tracking-widest text-white/90">JuiceVault</span>
          </div>
          <div className="w-[30px]" />
        </div>
      )}

      <AnimatePresence>
        {showCreatePlaylist && (
          <CreatePlaylistModal
            onClose={() => setShowCreatePlaylist(false)}
            onCreated={handlePlaylistCreated}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-1 min-h-0">
        {isMobile ? (
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                className="fixed inset-0 z-50 flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ background: theme.bg }}
              >
                <Sidebar
                  user={user}
                  onLogout={onLogout}
                  active={activePage}
                  onNavigate={handleNavigate}
                  onCreatePlaylist={() => setShowCreatePlaylist(true)}
                  refreshTrigger={playlistRefresh}
                  onSettings={() => setShowSettings(true)}
                  hasUpdateNotice={hasUpdateNotice}
                  mobile
                  onClose={() => setSidebarOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <Sidebar
            user={user}
            onLogout={onLogout}
            active={activePage}
            onNavigate={handleNavigate}
            onCreatePlaylist={() => setShowCreatePlaylist(true)}
            refreshTrigger={playlistRefresh}
            onSettings={() => setShowSettings(true)}
            hasUpdateNotice={hasUpdateNotice}
          />
        )}

        <main className="relative flex flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {activePage === "Overview" ? (
              <motion.div key="Overview" className={`flex-1 overflow-y-auto ${isMobile ? 'pb-24' : 'pb-20'}`} {...pageFade}>
                <Overview user={user} />
              </motion.div>
            ) : (
              <motion.div key={activePage} className={`flex-1 overflow-y-auto ${isMobile ? 'pb-24' : 'pb-20'}`} {...pageFade}>
                {renderPage()}
              </motion.div>
            )}
          </AnimatePresence>

          <PlayBar onFullscreen={() => setShowFullscreen(true)} onInfo={(id) => setInfoSongId(id)} onAddToPlaylist={(song) => setAddToPlaylistSong(song)} />
        </main>
      </div>

      <AnimatePresence>
        {showFullscreen && <FullscreenPlayer onClose={() => setShowFullscreen(false)} onInfo={(id) => setInfoSongId(id)} onAddToPlaylist={(song) => setAddToPlaylistSong(song)} />}
      </AnimatePresence>
      <AnimatePresence>
        {infoSongId && <SongInfoModal songId={infoSongId} onClose={() => setInfoSongId(null)} />}
      </AnimatePresence>
      {addToPlaylistSong && <AddToPlaylistModal song={addToPlaylistSong} onClose={() => setAddToPlaylistSong(null)} />}
      <AnimatePresence>
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} discordRpc={discordRpc} setDiscordRpc={setDiscordRpc} onOpenPlayerPrefs={() => setShowPlayerPrefs(true)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showPlayerPrefs && <PlayerPreferencesModal onClose={() => setShowPlayerPrefs(false)} />}
      </AnimatePresence>
    </div>
  );
}

export default Dashboard;
