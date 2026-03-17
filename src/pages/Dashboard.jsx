import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

const pageFade = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" },
};

function Dashboard({ user, onLogout }) {
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
  useEffect(() => { localStorage.setItem("discordRpc", String(discordRpc)); updateUserPreferences({ discordRpc }).catch(() => {}); }, [discordRpc]);
  useDiscordRPC(discordRpc, { activePage, playlistName: playlistMeta.name, mediaViewing });
  const [playlistRefresh, setPlaylistRefresh] = useState(0);
  const refreshPlaylists = () => setPlaylistRefresh((n) => n + 1);
  const handleNavigate = (page, extra) => {
    if (page.startsWith("playlist:")) {
      const id = page.replace("playlist:", "");
      setPlaylistMeta({ id, name: extra || "Playlist" });
    }
    setActivePage(page);
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
      <div className="px-8 py-6">
        <h1 className="text-2xl font-bold text-white">{activePage}</h1>
        <p className="mt-1 text-sm text-white/30">Coming soon</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 top-9 flex flex-col overflow-hidden">
      <Background />

      <AnimatePresence>
        {showCreatePlaylist && (
          <CreatePlaylistModal
            onClose={() => setShowCreatePlaylist(false)}
            onCreated={handlePlaylistCreated}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-1 min-h-0">
        <Sidebar
          user={user}
          onLogout={onLogout}
          active={activePage}
          onNavigate={handleNavigate}
          onCreatePlaylist={() => setShowCreatePlaylist(true)}
          refreshTrigger={playlistRefresh}
          onSettings={() => setShowSettings(true)}
        />

        <main className="relative flex flex-1 flex-col overflow-hidden">
          <div className={`flex-1 overflow-y-auto pb-20 ${activePage === "Overview" ? "" : "hidden"}`}>
            <Overview user={user} />
          </div>

          <AnimatePresence mode="wait">
            {activePage !== "Overview" && (
              <motion.div key={activePage} className="flex-1 overflow-y-auto pb-20" {...pageFade}>
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
