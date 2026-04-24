import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio as RadioIcon, Users, SkipForward, Play, Pause, Music2 } from "lucide-react";
import { getRadioNowPlaying, getRadioSchedule, voteSkipRadio } from "@/lib/api";
import { usePlayer } from "@/stores/playerStore";
import { useTheme, hexToRgb } from "@/stores/themeStore";
import { toApiUrl } from "@/lib/platform";

function fmt(s) {
  if (!s || !isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function Radio() {
  const { theme } = useTheme();
  const a0 = hexToRgb(theme.accent[0]);
  const a1 = hexToRgb(theme.accent[1]);
  const { state, playRadio, stopRadio } = usePlayer();
  const [upcoming, setUpcoming] = useState([]);
  const [listeners, setListeners] = useState(0);
  const [playlistLength, setPlaylistLength] = useState(0);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [skipVotes, setSkipVotes] = useState(null);
  const [loading, setLoading] = useState(true);

  const isActive = state.isRadio && state.isPlaying;

  const fetchData = useCallback(async () => {
    try {
      const [npRes, schRes] = await Promise.all([getRadioNowPlaying(), getRadioSchedule(20)]);
      const np = npRes?.data || npRes;
      const sch = schRes?.data || schRes;
      if (np?.current) setNowPlaying(np.current);
      if (np?.next) setNextSong(np.next);
      if (np?.listeners !== undefined) setListeners(np.listeners);
      if (np?.playlist_length) setPlaylistLength(np.playlist_length);
      setUpcoming(sch?.upcoming || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggle = () => {
    if (state.isRadio) stopRadio();
    else playRadio();
  };

  const handleSkip = async () => {
    try {
      const res = await voteSkipRadio();
      const d = res?.data || res;
      setSkipVotes(d);
      if (d?.skipped) setTimeout(() => { fetchData(); setSkipVotes(null); }, 2000);
      else setTimeout(() => setSkipVotes(null), 4000);
    } catch (e) {
      console.error("Vote skip failed:", e);
    }
  };

  const current = state.isRadio ? state.currentTrack : nowPlaying;
  const cover = current?.cover ? toApiUrl(current.cover) : null;
  const nextCover = nextSong?.cover ? toApiUrl(nextSong.cover) : null;

  return (
    <motion.div className="px-4 md:px-8 py-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <RadioIcon size={20} className="text-white/40" />
            <h1 className="text-2xl font-bold text-white">Radio</h1>
          </div>
          <p className="text-sm text-white/30">Live stream — everyone hears the same thing</p>
        </div>
        <div className="flex items-center gap-2 text-white/40 text-sm">
          <Users size={14} />
          <span>{listeners} listening</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: theme.accent[0] }} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 p-4 sm:p-5">
              <div className="relative flex-shrink-0">
                <div className="w-24 h-24 rounded-xl overflow-hidden" style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                  {cover ? (
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                      <Music2 size={28} className="text-white/15" />
                    </div>
                  )}
                </div>
                {isActive && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: theme.accent[0], boxShadow: `0 0 8px rgba(${a0},0.6)` }} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.accent[0] }}>Now Playing</span>
                  {isActive && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: `rgba(${a0},0.6)` }}>
                      <RadioIcon size={10} className="animate-pulse" /> Live
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold text-white truncate">{current?.title || "—"}</p>
                <p className="text-sm text-white/50 truncate">{current?.artist || "—"}</p>
              </div>

              <button
                onClick={handleToggle}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] flex-shrink-0"
                style={{ background: isActive ? `rgba(${a0},0.15)` : `linear-gradient(135deg, rgba(${a0},0.3), rgba(${a1},0.3))`, border: `1px solid ${isActive ? `rgba(${a0},0.25)` : `rgba(${a0},0.2)`}` }}
              >
                {isActive ? <><Pause size={16} fill="currentColor" /> Leave Radio</> : <><Play size={16} fill="currentColor" /> Join Radio</>}
              </button>
            </div>

            {state.isRadio && (
              <div className="flex items-center gap-3 px-5 pb-4 border-t border-white/[0.04] pt-3">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  <SkipForward size={14} />
                  Vote to skip
                </button>
                <AnimatePresence>
                  {skipVotes && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`text-xs font-medium ${skipVotes.skipped ? "text-green-400" : "text-white/40"}`}
                    >
                      {skipVotes.skipped ? "Skipped!" : `${skipVotes.votes}/${skipVotes.needed} votes`}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {nextSong && (
            <div className="rounded-xl flex items-center gap-3 p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                {nextCover ? (
                  <img src={nextCover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                    <Music2 size={14} className="text-white/15" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/25 uppercase tracking-wider font-medium">Up Next</p>
                <p className="text-[13px] font-semibold text-white truncate">{nextSong.title}</p>
                <p className="text-[11px] text-white/35 truncate">{nextSong.artist}</p>
              </div>
              <span className="text-[11px] text-white/20 tabular-nums">{fmt(nextSong.duration || 0)}</span>
            </div>
          )}

          {upcoming.length > 0 && (
            <div>
              <p className="text-[12px] text-white/20 mb-2">Schedule ({upcoming.length} upcoming)</p>
              <div className="flex flex-col gap-0.5">
                {upcoming.map((song, i) => {
            const songCover = song.cover ? toApiUrl(song.cover) : null;
                  return (
                    <div key={`${song.id}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                      <span className="text-[11px] text-white/15 w-5 text-right tabular-nums">{i + 1}</span>
                      <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0">
                        {songCover ? (
                          <img src={songCover} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                            <Music2 size={10} className="text-white/15" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate">{song.title}</p>
                        <p className="text-[11px] text-white/30 truncate">{song.artist}</p>
                      </div>
                      <span className="text-[11px] text-white/15 tabular-nums">{fmt(song.duration || 0)}</span>
                      {song.starts_in !== undefined && (
                        <span className="text-[10px] text-white/10 tabular-nums w-14 text-right">in {fmt(song.starts_in)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-[11px] text-white/15 pt-1">
            <span>{playlistLength} songs in rotation</span>
            <span>·</span>
            <span>128 kbps</span>
            <span>·</span>
            <span>{listeners} listener{listeners !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default Radio;
