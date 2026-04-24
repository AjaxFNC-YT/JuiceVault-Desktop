import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Headphones, Clock, Music2, Flame, TrendingUp, Trophy, Play, SquareChartGantt } from "lucide-react";
import { getListeningStats, getListeningActivity, getArchiveStats } from "@/lib/api";
import { useTheme } from "@/stores/themeStore";
import { usePlayer } from "@/stores/playerStore";

const stagger = { animate: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };

function formatDuration(seconds) {
  if (!seconds) return "0m";
  const weeks = Math.floor(seconds / 604800);
  const days = Math.floor((seconds % 604800) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.join(" ") || "0m";
}

function Overview({ user }) {
  const { theme } = useTheme();
  const { playTrack } = usePlayer();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [statsRes, activityRes, archiveRes] = await Promise.allSettled([
          getListeningStats(),
          getListeningActivity(),
          getArchiveStats(),
        ]);

        if (cancelled) return;

        if (statsRes.status === "rejected") console.warn("[Overview] Stats fetch failed:", statsRes.reason);
        else console.log("[Overview] Stats response:", JSON.stringify(statsRes.value).slice(0, 300));
        if (activityRes.status === "rejected") console.warn("[Overview] Activity fetch failed:", activityRes.reason);
        else console.log("[Overview] Activity response:", JSON.stringify(activityRes.value).slice(0, 300));
        if (archiveRes.status === "rejected") console.warn("[Overview] Archive fetch failed:", archiveRes.reason);
        else console.log("[Overview] Archive response:", JSON.stringify(archiveRes.value).slice(0, 200));

        const sData = statsRes.status === "fulfilled" && statsRes.value?.data;
        const aData = activityRes.status === "fulfilled" && activityRes.value?.data;
        const archTotal = archiveRes.status === "fulfilled" && (archiveRes.value?.total_songs || archiveRes.value?.data?.total_songs);

        if (sData) setStats(sData);
        if (aData) setActivity(aData);
        if (archTotal) setArchiveTotal(archTotal);

        if (!sData && !aData && retries < 5) {
          setTimeout(() => {
            if (!cancelled) setRetries((r) => r + 1);
          }, 2000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [retries]);

  const totalListens = stats?.stats?.totalListens || 0;
  const totalDuration = stats?.stats?.totalDuration || 0;
  const uniqueSongs = stats?.stats?.uniqueSongs || 0;
  const completionPct = archiveTotal > 0 ? Math.round((uniqueSongs / archiveTotal) * 100) : 0;

  const currentStreak = activity?.currentStreak || 0;
  const longestStreak = activity?.longestStreak || 0;
  const avgDaily = activity?.avgDailyPlays || 0;
  const hourly = activity?.hourly || [];

  const topSongs = stats?.topSongs || [];

  const peakHour = hourly.length
    ? hourly.reduce((a, b) => (b.count > a.count ? b : a), hourly[0])
    : null;
  const maxHourCount = hourly.length ? Math.max(...hourly.map((h) => h.count), 1) : 1;

  const displayName = user?.displayName || user?.username || "there";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: theme.accent[0] }} />
      </div>
    );
  }

  return (
    <motion.div className="px-4 md:px-8 py-6" variants={stagger} initial="initial" animate="animate">
      <motion.div variants={fadeUp} className="flex items-center gap-2 mb-1">
        <SquareChartGantt size={20} className="text-white/40" />
        <h1 className="text-2xl font-bold text-white">Hey, {displayName}</h1>
      </motion.div>
      <motion.p variants={fadeUp} className="text-sm text-white/30 mb-8">Your listening overview</motion.p>

      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={Headphones}
          label="Total Plays"
          value={totalListens.toLocaleString()}
        />
        <StatCard
          icon={Clock}
          label="Time Listened"
          value={formatDuration(totalDuration)}
        />
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame size={14} className="text-white/30" />
            <span className="text-[12px] font-medium text-white/40">Streak</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
              <p className="text-[10px] font-medium text-white/30">Current</p>
              <p className="text-base font-bold text-white">{currentStreak}d</p>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
              <p className="text-[10px] font-medium text-white/30">Best</p>
              <p className="text-base font-bold" style={{ color: theme.accent[0] }}>{longestStreak}d</p>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Music2 size={16} style={{ color: theme.accent[1] }} />
            <span className="text-[13px] font-semibold text-white/60">Archive Completion</span>
          </div>
          <div className="mb-3">
            <span className="text-3xl font-bold text-white">{completionPct}%</span>
            <p className="text-[12px] text-white/25 mt-1">{uniqueSongs.toLocaleString()} / {archiveTotal.toLocaleString()} songs</p>
          </div>
          <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(completionPct, 100)}%`, background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})` }}
            />
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: theme.accent[0] }} />
            <span className="text-[13px] font-semibold text-white/60">Quick Stats</span>
          </div>
          <div className="space-y-3">
            <QuickStat label="Avg Daily Plays" value={avgDaily} />
            <QuickStat label="Unique Songs" value={uniqueSongs.toLocaleString()} />
            <QuickStat
              label="Peak Hour"
              value={peakHour ? formatHour(peakHour.hour) : "—"}
            />
            <QuickStat label="Longest Streak" value={`${longestStreak} days`} />
          </div>
        </div>
      </motion.div>

      {topSongs.length > 0 && (
        <motion.div variants={fadeUp} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 mt-6">
          <div className="flex items-center gap-2 mb-5">
            <Trophy size={16} style={{ color: theme.accent[0] }} />
            <span className="text-[13px] font-semibold text-white/60">Most Played</span>
            {/* <span className="ml-auto text-[11px] text-white/20">{topSongs.length} songs</span> */}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {topSongs.slice(0, 10).map((entry, i) => (
              <SongCard key={entry.songId} entry={entry} rank={i + 1} onPlay={() => {
                const song = entry.song || {};
                const track = { id: entry.songId, title: song.title, artist: song.artist, cover: song.cover };
                const allTracks = topSongs.slice(0, 10).map((e) => ({ id: e.songId, title: e.song?.title, artist: e.song?.artist, cover: e.song?.cover }));
                playTrack(track, allTracks, i, "library");
              }} />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

const CDN = "https://api.juicevault.xyz";

function SongCard({ entry, rank, onPlay }) {
  const song = entry.song || {};
  const cover = song.cover ? `${CDN}${song.cover}` : null;

  return (
    <div onClick={onPlay} className="flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5 hover:bg-white/[0.05] group cursor-pointer">
      <span className="w-5 text-center text-[11px] font-bold text-white/20 flex-shrink-0">#{rank}</span>
      <div className="relative h-10 w-10 rounded-md bg-white/[0.06] overflow-hidden flex-shrink-0">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music2 size={14} className="text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
          <Play size={14} className="text-white" fill="white" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-white/80">{song.title || "Unknown"}</p>
        <p className="truncate text-[11px] text-white/30">{song.artist || "Unknown"}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-[12px] font-semibold text-white/50">{entry.count}</p>
        <p className="text-[10px] text-white/20">plays</p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-white/30" />
        <span className="text-[12px] font-medium text-white/40">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-white/20 mt-0.5">{sub}</p>}
    </div>
  );
}

function QuickStat({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-white/40">{label}</span>
      <span className="text-[13px] font-semibold text-white/80">{value}</span>
    </div>
  );
}

function formatHour(h) {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export default Overview;
