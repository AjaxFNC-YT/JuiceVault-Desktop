import { createContext, useContext, useReducer, useRef, useCallback, useEffect, useState } from "react";
import { logListen, getRadioNowPlaying, getCurrentUser, updateUserPreferences } from "@/lib/api";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { IS_TAURI } from "@/lib/platform";

const API = "https://api.juicevault.xyz";
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_MOBILE = IS_IOS || IS_ANDROID;
const SHUFFLE_MEMORY_KEY = "player.shuffle.memory.v1";
const EARLY_SKIP_WINDOW_SECONDS = 10;
const MAX_SHUFFLE_MEMORY_TRACKS = 750;
const MAX_SESSION_HISTORY = 250;
const PLAYER_VOLUME_KEY = "player.volume";
const PLAYER_VOLUME_SNAP_KEY = "player.volume.snap";
const PLAYER_VOLUME_CURVE_KEY = "player.volume.curve";
const COMPLETE_LISTEN_RATIO = 0.7;
const MAX_TRUSTED_PROGRESS_DELTA_SECONDS = 2.5;
const DEFAULT_PLAYBACK_SOURCE = "library";

function isRetryableListenError(error) {
  const message = typeof error === "string" ? error : error?.message || String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("network error")
    || normalized.includes("timed out")
    || normalized.includes("timeout")
    || normalized.includes("failed to reach")
    || normalized.includes("invalid token")
    || normalized.includes("expired")
    || normalized.includes("unauthorized");
}

function useProxyApiInDev() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname, port } = window.location;
  return protocol.startsWith("http") && (hostname === "localhost" || hostname === "127.0.0.1") && port === "1420";
}

function getStoredVolume() {
  try {
    const raw = localStorage.getItem(PLAYER_VOLUME_KEY);
    if (raw == null) return 0.7;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return 0.7;
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return 0.7;
  }
}

function getStoredVolumeSnapEnabled() {
  try {
    return localStorage.getItem(PLAYER_VOLUME_SNAP_KEY) !== "false";
  } catch {
    return true;
  }
}

function getStoredVolumeCurve() {
  try {
    const raw = localStorage.getItem(PLAYER_VOLUME_CURVE_KEY);
    if (raw == null) return 1;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(0.5, Math.min(2, parsed));
  } catch {
    return 1;
  }
}
function getStreamUrl(track) {
  if (track?.local && track?.path) return convertFileSrc(track.path);
  const base = useProxyApiInDev() ? "/proxy-api" : (IS_TAURI ? API : "/proxy-api");
  return `${base}/music/stream/${track.id}?src=app`;
}

function getRadioStreamUrl() {
  return `${useProxyApiInDev() ? "/proxy-api" : (IS_TAURI ? API : "/proxy-api")}/radio/stream`;
}

const initialState = {
  currentTrack: null,
  isPlaying: false,
  volume: getStoredVolume(),
  volumeSnapEnabled: getStoredVolumeSnapEnabled(),
  volumeCurve: getStoredVolumeCurve(),
  progress: 0,
  duration: 0,
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: "off",
  queueSource: DEFAULT_PLAYBACK_SOURCE,
  queuePrompt: null,
  isRadio: false,
  radioData: null,
};

function createPlaybackContextSnapshot(snapshot) {
  return {
    queue: Array.isArray(snapshot.queue) ? snapshot.queue : [],
    queueIndex: Number.isInteger(snapshot.queueIndex) ? snapshot.queueIndex : -1,
    queueSource: snapshot.queueSource || DEFAULT_PLAYBACK_SOURCE,
    playlistId: snapshot.currentTrack?.playlistId || null,
  };
}

function normalizePlaybackSource(source) {
  const allowed = new Set(["library", "playlist", "search", "radio", "queue"]);
  return allowed.has(source) ? source : DEFAULT_PLAYBACK_SOURCE;
}

function playerReducer(state, action) {
  switch (action.type) {
    case "PLAY_TRACK":
      return {
        ...state,
        currentTrack: action.payload.track,
        queue: action.payload.queue,
        queueIndex: action.payload.index,
        queueSource: action.payload.queueSource ?? state.queueSource,
        isPlaying: true,
        progress: 0,
        duration: 0,
      };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.payload };
    case "SET_VOLUME":
      return { ...state, volume: action.payload };
    case "SET_VOLUME_PREFERENCES":
      return { ...state, ...action.payload };
    case "SET_PROGRESS":
      return { ...state, progress: action.payload };
    case "SET_DURATION":
      return { ...state, duration: action.payload };
    case "SET_TRACK_DIRECT":
      return { ...state, currentTrack: action.payload.track, queueIndex: action.payload.index, isPlaying: true, progress: 0, duration: 0 };
    case "TOGGLE_SHUFFLE":
      return { ...state, shuffle: !state.shuffle };
    case "CYCLE_REPEAT":
      return { ...state, repeat: state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off" };
    case "PLAY_RADIO":
      return { ...state, isRadio: true, isPlaying: true, currentTrack: action.payload?.track || state.currentTrack, radioData: action.payload?.radioData || null, queue: [], queueIndex: -1, progress: 0, duration: 0 };
    case "STOP_RADIO":
      return { ...state, isRadio: false, radioData: null };
    case "SET_RADIO_DATA":
      return { ...state, radioData: action.payload };
    case "SET_QUEUE_STATE":
      return { ...state, ...action.payload };
    case "SET_QUEUE_PROMPT":
      return { ...state, queuePrompt: action.payload };
    default:
      return state;
  }
}

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const outputGainRef = useRef(null);
  const [analyserReady, setAnalyserReady] = useState(false);

  const bassRef = useRef(null);
  const midRef = useRef(null);
  const trebleRef = useRef(null);
  const gainRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);
  const convolverRef = useRef(null);

  const loadedEq = useRef((() => {
    try { return JSON.parse(localStorage.getItem("eq") || "{}"); } catch { return {}; }
  })());
  const crossfadeRef = useRef(IS_MOBILE ? 0 : parseInt(localStorage.getItem("crossfade") || "0"));

  const prefsSaveTimer = useRef(null);
  const savePrefsToApi = useCallback((overrides = {}) => {
    clearTimeout(prefsSaveTimer.current);
    prefsSaveTimer.current = setTimeout(() => {
      const eq = loadedEq.current;
      const s = stateRef.current;
      const repeatMap = { off: "none", all: "all", one: "none" };
      const payload = {
        eqBass: eq.bass ?? 0,
        eqMid: eq.mid ?? 0,
        eqTreble: eq.treble ?? 0,
        eqReverb: eq.reverb ?? 0,
        eqGain: eq.gain ?? 0,
        crossfadeDuration: crossfadeRef.current,
        shuffle: s.shuffle,
        repeat: repeatMap[s.repeat] || "none",
        ...overrides,
      };
      updateUserPreferences(payload).catch(() => {
        setTimeout(() => updateUserPreferences(payload).catch(() => {}), 2000);
      });
    }, 800);
  }, []);
  const fadeTimerRef = useRef(null);
  const fadeOutAudioRef = useRef(null);
  const playbackWatchdogRef = useRef(null);
  const endGuardRef = useRef(false);
  const stalledNearEndRef = useRef(0);
  const basePlaybackContextRef = useRef(null);

  if (!audioRef.current) {
    audioRef.current = new Audio();
    audioRef.current.volume = 1;
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.playbackRate = 1;
    audioRef.current.defaultPlaybackRate = 1;
  }

  const audio = audioRef.current;

  const crossfadeActiveRef = useRef(false);
  const preCrossfadeRef = useRef(null);
  const seekSuppressCfRef = useRef(false);
  const sessionHistoryRef = useRef([]);
  const shuffleMemoryRef = useRef((() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SHUFFLE_MEMORY_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })());
  const shuffleCycleRef = useRef({ signature: "", remainingIndices: [] });

  const cancelCrossfade = useCallback(() => {
    if (!crossfadeActiveRef.current) return;
    clearInterval(fadeTimerRef.current);
    if (fadeOutAudioRef.current) {
      fadeOutAudioRef.current.pause();
      fadeOutAudioRef.current.src = "";
      fadeOutAudioRef.current = null;
    }
    crossfadeActiveRef.current = false;
    const prev = preCrossfadeRef.current;
    if (prev) {
      if (outputGainRef.current) outputGainRef.current.gain.value = prev.volume;
      else audioRef.current.volume = prev.volume;
      dispatch({ type: "SET_TRACK_DIRECT", payload: { track: prev.track, index: prev.index } });
      preCrossfadeRef.current = null;
    }
  }, []);

  const applyDesktopPlaybackState = useCallback((volume = stateRef.current.volume) => {
    const activeAudio = audioRef.current;
    activeAudio.playbackRate = 1;
    activeAudio.defaultPlaybackRate = 1;
    activeAudio.preservesPitch = true;
    activeAudio.mozPreservesPitch = true;
    activeAudio.webkitPreservesPitch = true;

    if (fadeOutAudioRef.current) {
      fadeOutAudioRef.current.playbackRate = 1;
      fadeOutAudioRef.current.defaultPlaybackRate = 1;
      fadeOutAudioRef.current.preservesPitch = true;
      fadeOutAudioRef.current.mozPreservesPitch = true;
      fadeOutAudioRef.current.webkitPreservesPitch = true;
    }

    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }

    if (outputGainRef.current) outputGainRef.current.gain.value = volume;
    else activeAudio.volume = volume;
  }, []);

  const getQueueTrackKey = useCallback((track) => {
    if (!track) return null;
    if (track.local && track.path) return `local:${track.path}`;
    if (track.id != null) return `remote:${track.id}`;

    const title = track.title || "unknown-title";
    const artist = track.artist || "unknown-artist";
    const album = track.album || "unknown-album";
    return `meta:${title}|${artist}|${album}`;
  }, []);

  const saveShuffleMemory = useCallback(() => {
    try {
      const trimmed = Object.fromEntries(
        Object.entries(shuffleMemoryRef.current)
          .sort(([, a], [, b]) => (b?.lastPlayedAt || 0) - (a?.lastPlayedAt || 0))
          .slice(0, MAX_SHUFFLE_MEMORY_TRACKS),
      );

      shuffleMemoryRef.current = trimmed;
      localStorage.setItem(SHUFFLE_MEMORY_KEY, JSON.stringify(trimmed));
    } catch {}
  }, []);

  const getQueueCurrentIndex = useCallback((snapshot) => {
    if (snapshot.queueIndex >= 0 && snapshot.queueIndex < snapshot.queue.length) return snapshot.queueIndex;

    const currentKey = getQueueTrackKey(snapshot.currentTrack);
    if (!currentKey) return -1;

    return snapshot.queue.findIndex((track) => getQueueTrackKey(track) === currentKey);
  }, [getQueueTrackKey]);

  const pushSessionHistory = useCallback((snapshot) => {
    if (!snapshot.currentTrack || !snapshot.queue.length) return;

    const entry = {
      track: snapshot.currentTrack,
      queue: snapshot.queue,
      index: getQueueCurrentIndex(snapshot),
    };

    const lastEntry = sessionHistoryRef.current[sessionHistoryRef.current.length - 1];
    if (
      lastEntry &&
      lastEntry.queue === entry.queue &&
      lastEntry.index === entry.index &&
      getQueueTrackKey(lastEntry.track) === getQueueTrackKey(entry.track)
    ) {
      return;
    }

    sessionHistoryRef.current = [
      ...sessionHistoryRef.current.slice(-(MAX_SESSION_HISTORY - 1)),
      entry,
    ];
  }, [getQueueCurrentIndex, getQueueTrackKey]);

  const recordTrackShuffleOutcome = useCallback((track, snapshot, { completed = false } = {}) => {
    const key = getQueueTrackKey(track);
    if (!key) return;

    const elapsedSeconds = Math.max(0, Math.floor(snapshot.progress || audio.currentTime || 0));
    const durationSeconds = Math.max(0, Number(snapshot.duration || audio.duration || 0));
    const rewardThreshold = durationSeconds > 0
      ? Math.min(90, Math.max(30, durationSeconds * 0.35))
      : 30;
    const outcome = completed
      ? "completed"
      : elapsedSeconds < EARLY_SKIP_WINDOW_SECONDS
        ? "early-skip"
        : elapsedSeconds >= rewardThreshold
          ? "played"
          : "neutral";

    const current = shuffleMemoryRef.current[key] || {};
    const now = Date.now();
    const next = {
      starts: Number(current.starts) || 0,
      plays: Number(current.plays) || 0,
      completions: Number(current.completions) || 0,
      earlySkips: Number(current.earlySkips) || 0,
      skipPenalty: Math.max(0, Number(current.skipPenalty) || 0),
      lastPlayedAt: current.lastPlayedAt || 0,
      totalSeconds: Number(current.totalSeconds) || 0,
    };

    next.starts += 1;
    next.lastPlayedAt = now;
    next.totalSeconds += elapsedSeconds;

    if (outcome === "completed") {
      next.plays += 1;
      next.completions += 1;
      next.skipPenalty = Math.max(0, next.skipPenalty - 0.75);
    } else if (outcome === "played") {
      next.plays += 1;
      next.skipPenalty = Math.max(0, next.skipPenalty - 0.35);
    } else if (outcome === "early-skip") {
      next.earlySkips += 1;
      next.skipPenalty = Math.min(8, next.skipPenalty + 1);
    }

    shuffleMemoryRef.current = {
      ...shuffleMemoryRef.current,
      [key]: next,
    };
    saveShuffleMemory();
  }, [audio, getQueueTrackKey, saveShuffleMemory]);

  const resetShuffleCycle = useCallback(() => {
    shuffleCycleRef.current = { signature: "", remainingIndices: [] };
  }, []);

  const getQueueSignature = useCallback((snapshot) => (
    snapshot.queue.map((track, index) => `${index}:${getQueueTrackKey(track) || `unknown-${index}`}`).join("||")
  ), [getQueueTrackKey]);

  const getShuffleWeights = useCallback((snapshot, candidateIndices) => {
    const now = Date.now();
    return candidateIndices.map((index) => {
      const track = snapshot.queue[index];
      const key = getQueueTrackKey(track);
      const stats = key ? shuffleMemoryRef.current[key] || {} : {};
      const starts = Number(stats.starts) || 0;
      const plays = Number(stats.plays) || 0;
      const completions = Number(stats.completions) || 0;
      const skipPenalty = Math.max(0, Number(stats.skipPenalty) || 0);
      const lastPlayedAt = Number(stats.lastPlayedAt) || 0;
      const neverStarted = starts === 0;

      let weight = neverStarted ? 18 : 1.4;
      weight *= 1 + Math.min(1.75, completions * 0.18 + plays * 0.06);
      weight *= Math.max(0.04, Math.pow(0.42, skipPenalty));

      if (lastPlayedAt > 0) {
        const hoursSinceLastPlay = (now - lastPlayedAt) / 3600000;
        const freshnessFactor = Math.min(1.2, 0.25 + Math.max(0, hoursSinceLastPlay) / 8);
        weight *= Math.max(0.2, freshnessFactor);
      } else {
        weight *= 1.2;
      }

      return { index, weight: Math.max(0.02, weight) };
    });
  }, [getQueueTrackKey]);

  const buildWeightedShuffleOrder = useCallback((snapshot, candidateIndices) => {
    const remaining = [...candidateIndices];
    const order = [];

    while (remaining.length) {
      const weightedCandidates = getShuffleWeights(snapshot, remaining);
      const totalWeight = weightedCandidates.reduce((sum, candidate) => sum + candidate.weight, 0);
      const fallbackIndex = weightedCandidates[weightedCandidates.length - 1]?.index ?? remaining[0];

      let selectedIndex = fallbackIndex;
      if (totalWeight > 0) {
        let cursor = Math.random() * totalWeight;
        for (const candidate of weightedCandidates) {
          cursor -= candidate.weight;
          if (cursor <= 0) {
            selectedIndex = candidate.index;
            break;
          }
        }
      }

      order.push(selectedIndex);
      remaining.splice(remaining.indexOf(selectedIndex), 1);
    }

    return order;
  }, [getShuffleWeights]);

  const ensureShuffleCycle = useCallback((snapshot) => {
    if (!snapshot.shuffle || !snapshot.queue.length) {
      resetShuffleCycle();
      return [];
    }

    const currentIndex = getQueueCurrentIndex(snapshot);
    const signature = getQueueSignature(snapshot);

    let remainingIndices = shuffleCycleRef.current.signature === signature
      ? shuffleCycleRef.current.remainingIndices.filter((index) => index >= 0 && index < snapshot.queue.length)
      : [];

    if (currentIndex >= 0) {
      remainingIndices = remainingIndices.filter((index) => index !== currentIndex);
    }

    if (!remainingIndices.length) {
      remainingIndices = buildWeightedShuffleOrder(
        snapshot,
        snapshot.queue.map((_, index) => index).filter((index) => index !== currentIndex),
      );
    }

    shuffleCycleRef.current = { signature, remainingIndices };
    return remainingIndices;
  }, [buildWeightedShuffleOrder, getQueueCurrentIndex, getQueueSignature, resetShuffleCycle]);

  const getWeightedShuffleIndex = useCallback((snapshot) => {
    return ensureShuffleCycle(snapshot)[0] ?? -1;
  }, [ensureShuffleCycle]);

  const getNextQueueIndex = useCallback((snapshot) => {
    if (!snapshot.queue.length) return -1;

    const currentIndex = getQueueCurrentIndex(snapshot);

    if (snapshot.shuffle) {
      return getWeightedShuffleIndex(snapshot);
    }

    const startIndex = currentIndex >= 0 ? currentIndex : -1;
    const nextIdx = startIndex + 1;
    if (nextIdx >= snapshot.queue.length) {
      return snapshot.repeat === "all" ? 0 : -1;
    }
    return nextIdx;
  }, [getQueueCurrentIndex, getWeightedShuffleIndex]);

  const doCrossfade = useCallback((newSrc, targetVolume, overrideDuration) => {
    const a = audioRef.current;
    const cfDuration = overrideDuration ?? crossfadeRef.current;
    if (cfDuration <= 0 || !a.currentSrc) {
      a.src = newSrc;
      a.volume = 1;
      applyDesktopPlaybackState(targetVolume);
      a.play().catch(() => {});
      return;
    }

    if (fadeOutAudioRef.current) {
      fadeOutAudioRef.current.pause();
      fadeOutAudioRef.current.src = "";
      fadeOutAudioRef.current = null;
    }
    clearInterval(fadeTimerRef.current);
    crossfadeActiveRef.current = true;
    preCrossfadeRef.current = {
      track: stateRef.current.currentTrack,
      index: stateRef.current.queueIndex,
      volume: targetVolume,
    };

    const fadeIn = new Audio();
    fadeIn.crossOrigin = "anonymous";
    fadeIn.playbackRate = 1;
    fadeIn.defaultPlaybackRate = 1;
    fadeIn.preservesPitch = true;
    fadeIn.mozPreservesPitch = true;
    fadeIn.webkitPreservesPitch = true;
    fadeIn.src = newSrc;
    fadeIn.volume = 0;
    fadeIn.play().catch(() => {});
    fadeOutAudioRef.current = fadeIn;

    const startVol = a.paused
      ? targetVolume
      : (outputGainRef.current?.gain.value ?? targetVolume);
    if (!a.paused) {
      const steps = cfDuration * 25;
      const interval = (cfDuration * 1000) / steps;
      let step = 0;

      fadeTimerRef.current = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        applyDesktopPlaybackState(Math.max(0, startVol * (1 - progress)));
        fadeIn.volume = targetVolume * progress;
        if (step >= steps) {
          clearInterval(fadeTimerRef.current);
          a.pause();
          a.src = newSrc;
          a.currentTime = fadeIn.currentTime;
          a.volume = 1;
          applyDesktopPlaybackState(targetVolume);
          a.play().catch(() => {});
          fadeIn.pause();
          fadeIn.src = "";
          fadeOutAudioRef.current = null;
          crossfadeActiveRef.current = false;
        }
      }, interval);
    } else {
      fadeIn.volume = targetVolume;
      setTimeout(() => {
        a.src = newSrc;
        a.currentTime = fadeIn.currentTime;
        a.volume = 1;
        applyDesktopPlaybackState(targetVolume);
        a.play().catch(() => {});
        fadeIn.pause();
        fadeIn.src = "";
        fadeOutAudioRef.current = null;
        crossfadeActiveRef.current = false;
      }, 300);
    }
  }, [applyDesktopPlaybackState]);

  const createImpulse = useCallback((actx, duration = 2, decay = 2.5) => {
    const rate = actx.sampleRate;
    const len = rate * duration;
    const buf = actx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }, []);

  const ensureAnalyser = useCallback(() => {
    if (analyserRef.current) { setAnalyserReady(true); return; }
    if (IS_MOBILE) { setAnalyserReady(true); return; }
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const actx = audioCtxRef.current;
      if (actx.state === "suspended") actx.resume();
      const source = actx.createMediaElementSource(audio);

      const bass = actx.createBiquadFilter();
      bass.type = "lowshelf"; bass.frequency.value = 200;
      const mid = actx.createBiquadFilter();
      mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 1;
      const treble = actx.createBiquadFilter();
      treble.type = "highshelf"; treble.frequency.value = 4000;
      const gain = actx.createGain();

      const convolver = actx.createConvolver();
      convolver.buffer = createImpulse(actx);
      const dryGain = actx.createGain();
      const wetGain = actx.createGain();
      wetGain.gain.value = 0;

      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      const outputGain = actx.createGain();
      outputGain.gain.value = stateRef.current.volume;

      source.connect(bass);
      bass.connect(mid);
      mid.connect(treble);
      treble.connect(gain);
      gain.connect(dryGain);
      dryGain.connect(analyser);
      gain.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(analyser);
      analyser.connect(outputGain);
      outputGain.connect(actx.destination);

      bassRef.current = bass;
      midRef.current = mid;
      trebleRef.current = treble;
      gainRef.current = gain;
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
      convolverRef.current = convolver;
      analyserRef.current = analyser;
      outputGainRef.current = outputGain;

      const eq = loadedEq.current;
      if (eq.bass) bass.gain.value = eq.bass;
      if (eq.mid) mid.gain.value = eq.mid;
      if (eq.treble) treble.gain.value = eq.treble;
      if (eq.gain) gain.gain.value = Math.pow(10, eq.gain / 20);
      if (eq.reverb) {
        const w = eq.reverb / 100;
        dryGain.gain.value = 1 - w * 0.5;
        wetGain.gain.value = w;
      }

      setAnalyserReady(true);
    } catch (e) { console.warn("Audio chain setup failed:", e); }
  }, [createImpulse]);
  const nativePlayTrack = useCallback(async (track) => {
    const url = getStreamUrl(track);
    const coverUrl = track.cover ? (track.local ? track.cover : `${API}${track.cover}`) : undefined;
    try {
      await invoke("plugin:nativeaudio|play_track", {
        url,
        title: track.title || "Unknown",
        artist: track.artist || "Unknown",
        artworkUrl: coverUrl,
      });
    } catch (e) { console.warn("[NativeAudio] play failed:", e); }
  }, []);

  const skipNextRef = useRef(null);
  const skipPrevRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const listenLogStateRef = useRef({ trackKey: null, logged: false });
  const listenMetricsRef = useRef({
    trackKey: null,
    lastPosition: null,
    listenedSeconds: 0,
    coveredSeconds: 0,
    segments: [],
  });

  const mergeListenSegment = useCallback((start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const segmentStart = Math.max(0, Math.min(start, end));
    const segmentEnd = Math.max(0, Math.max(start, end));
    if (segmentEnd <= segmentStart) return;

    const metrics = listenMetricsRef.current;
    const nextSegments = [];
    let pendingStart = segmentStart;
    let pendingEnd = segmentEnd;
    let inserted = false;

    for (const [existingStart, existingEnd] of metrics.segments) {
      if (existingEnd < pendingStart) {
        nextSegments.push([existingStart, existingEnd]);
      } else if (pendingEnd < existingStart) {
        if (!inserted) {
          nextSegments.push([pendingStart, pendingEnd]);
          inserted = true;
        }
        nextSegments.push([existingStart, existingEnd]);
      } else {
        pendingStart = Math.min(pendingStart, existingStart);
        pendingEnd = Math.max(pendingEnd, existingEnd);
      }
    }

    if (!inserted) nextSegments.push([pendingStart, pendingEnd]);

    metrics.segments = nextSegments;
    metrics.coveredSeconds = nextSegments.reduce((sum, [rangeStart, rangeEnd]) => sum + (rangeEnd - rangeStart), 0);
  }, []);

  const resetListenLogging = useCallback((track) => {
    const trackKey = getQueueTrackKey(track);
    listenLogStateRef.current = {
      trackKey,
      logged: false,
    };
    listenMetricsRef.current = {
      trackKey,
      lastPosition: 0,
      listenedSeconds: 0,
      coveredSeconds: 0,
      segments: [],
    };
  }, [getQueueTrackKey]);

  const syncListenProgress = useCallback((snapshot, position) => {
    const track = snapshot?.currentTrack;
    if (!track || track.local || !Number.isFinite(position)) return;

    const trackKey = getQueueTrackKey(track);
    if (!trackKey) return;

    if (listenMetricsRef.current.trackKey !== trackKey) {
      listenMetricsRef.current = {
        trackKey,
        lastPosition: Math.max(0, position),
        listenedSeconds: 0,
        coveredSeconds: 0,
        segments: [],
      };
    }

    const metrics = listenMetricsRef.current;
    const currentPosition = Math.max(0, position);

    if (metrics.lastPosition != null) {
      const delta = currentPosition - metrics.lastPosition;
      if (delta > 0 && delta <= MAX_TRUSTED_PROGRESS_DELTA_SECONDS) {
        metrics.listenedSeconds += delta;
        mergeListenSegment(metrics.lastPosition, currentPosition);
      }
    }

    metrics.lastPosition = currentPosition;
  }, [getQueueTrackKey, mergeListenSegment]);

  const maybeLogCurrentListen = useCallback((snapshot, { positionOverride = null } = {}) => {
    const track = snapshot?.currentTrack;
    if (!track || track.local) return false;

    const trackKey = getQueueTrackKey(track);
    if (!trackKey) return false;

    if (positionOverride != null) {
      syncListenProgress(snapshot, positionOverride);
    }

    if (listenLogStateRef.current.trackKey !== trackKey) {
      listenLogStateRef.current = { trackKey, logged: false };
    }

    if (listenLogStateRef.current.logged) return false;

    const metrics = listenMetricsRef.current;
    const listenedSeconds = Math.max(0, Math.floor(metrics.listenedSeconds || 0));
    const durationSeconds = Math.max(0, Math.floor(Number(snapshot.duration || audio.duration || 0) || 0));
    const coveredSeconds = Math.max(0, metrics.coveredSeconds || 0);
    if (listenedSeconds <= 0) return false;

    const completed = durationSeconds > 0 && (coveredSeconds / durationSeconds) >= COMPLETE_LISTEN_RATIO;
    const source = normalizePlaybackSource(snapshot?.isRadio ? "radio" : snapshot?.queueSource);
    const playlistId = source === "playlist" ? track.playlistId || null : null;

    listenLogStateRef.current.logged = true;
    logListen(track.id, listenedSeconds, completed, source, playlistId).catch((error) => {
      console.warn("[ListenLog] Failed to log listen:", error);
      if (listenLogStateRef.current.trackKey === trackKey && isRetryableListenError(error)) {
        listenLogStateRef.current.logged = false;
      }
    });
    return true;
  }, [audio, getQueueTrackKey, syncListenProgress]);

  const autoCfTriggeredRef = useRef(false);

  const finishTrack = useCallback(() => {
    const snapshot = stateRef.current;
    if (snapshot.isRadio || endGuardRef.current) return;
    endGuardRef.current = true;
    stalledNearEndRef.current = 0;

    if (snapshot.currentTrack) {
      recordTrackShuffleOutcome(snapshot.currentTrack, snapshot, { completed: true });
    }

    maybeLogCurrentListen(snapshot, {
      positionOverride: audio.duration || audio.currentTime || snapshot.duration || snapshot.progress,
    });

    if (snapshot.repeat === "one") {
      audio.currentTime = 0;
      audio.playbackRate = 1;
      applyDesktopPlaybackState();
      audio.play().catch(() => {});
    } else {
      skipNextRef.current?.({ recordCurrentOutcome: false });
    }

    window.setTimeout(() => {
      endGuardRef.current = false;
    }, 200);
  }, [applyDesktopPlaybackState, audio, maybeLogCurrentListen, recordTrackShuffleOutcome]);

  const setQueueState = useCallback((payload, { resetShuffle = true } = {}) => {
    if (resetShuffle) resetShuffleCycle();
    dispatch({ type: "SET_QUEUE_STATE", payload });
  }, [resetShuffleCycle]);

  const setQueuePrompt = useCallback((payload) => {
    dispatch({ type: "SET_QUEUE_PROMPT", payload });
  }, []);

  const addToQueue = useCallback((track) => {
    if (!track) return;
    const snapshot = stateRef.current;
    if (snapshot.currentTrack && snapshot.queueSource !== "queue") {
      setQueuePrompt({ track });
      return;
    }

    if (snapshot.queueSource === "queue") {
      const nextQueue = [...snapshot.queue, track];
      setQueueState({ queue: nextQueue, queueSource: "queue" }, { resetShuffle: true });
      return;
    }

    const nextQueue = snapshot.currentTrack ? [snapshot.currentTrack, track] : [track];
    setQueueState({
      queue: nextQueue,
      queueIndex: snapshot.currentTrack ? 0 : -1,
      queueSource: "queue",
    }, { resetShuffle: true });
  }, [setQueuePrompt, setQueueState]);

  const dismissQueuePrompt = useCallback(() => {
    setQueuePrompt(null);
  }, [setQueuePrompt]);

  const enableCustomQueuePlayback = useCallback(() => {
    const snapshot = stateRef.current;
    if (snapshot.queueSource === "queue") return;

    basePlaybackContextRef.current = createPlaybackContextSnapshot(snapshot);
    const nextQueue = snapshot.currentTrack ? [snapshot.currentTrack] : [];

    setQueueState({
      queue: nextQueue,
      queueIndex: snapshot.currentTrack ? 0 : -1,
      queueSource: "queue",
    }, { resetShuffle: true });
  }, [setQueueState]);

  const requestDisableCustomQueue = useCallback((payload = {}) => {
    const snapshot = stateRef.current;
    if (snapshot.queueSource !== "queue") return;
    setQueuePrompt({ type: "disable-custom", ...payload });
  }, [setQueuePrompt]);

  const toggleCustomQueuePlayback = useCallback((enabled, payload = {}) => {
    if (enabled) {
      enableCustomQueuePlayback();
      return;
    }
    requestDisableCustomQueue(payload);
  }, [enableCustomQueuePlayback, requestDisableCustomQueue]);

  const confirmQueueSwitch = useCallback(() => {
    const snapshot = stateRef.current;
    const prompt = snapshot.queuePrompt;
    if (!prompt) return;

    if (prompt.type === "disable-custom") {
      const restoredContext = Array.isArray(prompt.queue)
        ? {
            queue: prompt.queue,
            queueIndex: Number.isInteger(prompt.index) ? prompt.index : -1,
            queueSource: prompt.queueSource || DEFAULT_PLAYBACK_SOURCE,
          }
        : basePlaybackContextRef.current;

      const nextPayload = {
        queue: restoredContext?.queue || [],
        queueIndex: restoredContext?.queueIndex ?? -1,
        queueSource: restoredContext?.queueSource || DEFAULT_PLAYBACK_SOURCE,
        queuePrompt: null,
      };
      basePlaybackContextRef.current = null;
      setQueueState(nextPayload, { resetShuffle: true });
      return;
    }

    const pendingTrack = prompt.track;
    if (!pendingTrack) return;

    if (!basePlaybackContextRef.current) {
      basePlaybackContextRef.current = createPlaybackContextSnapshot(snapshot);
    }

    const nextQueue = snapshot.currentTrack ? [snapshot.currentTrack, pendingTrack] : [pendingTrack];
    setQueueState({
      queue: nextQueue,
      queueIndex: snapshot.currentTrack ? 0 : -1,
      queueSource: "queue",
      queuePrompt: null,
    }, { resetShuffle: true });
  }, [setQueueState]);

  const removeQueueItem = useCallback((queueIndex) => {
    const snapshot = stateRef.current;
    const currentIndex = getQueueCurrentIndex(snapshot);
    if (queueIndex < 0 || queueIndex >= snapshot.queue.length || queueIndex === currentIndex) return;

    const nextQueue = snapshot.queue.filter((_, index) => index !== queueIndex);
    const nextQueueIndex = snapshot.queueIndex >= 0 && queueIndex < snapshot.queueIndex
      ? snapshot.queueIndex - 1
      : snapshot.queueIndex;

    setQueueState({ queue: nextQueue, queueIndex: nextQueueIndex }, { resetShuffle: true });
  }, [getQueueCurrentIndex, setQueueState]);

  const moveQueueItem = useCallback((fromIndex, toIndex, options = {}) => {
    const snapshot = stateRef.current;
    const currentIndex = getQueueCurrentIndex(snapshot);
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= snapshot.queue.length || toIndex >= snapshot.queue.length) return;
    if (fromIndex <= currentIndex || toIndex <= currentIndex) return;

    if (snapshot.shuffle) {
      const signature = getQueueSignature(snapshot);
      const currentCycle = shuffleCycleRef.current.signature === signature
        ? shuffleCycleRef.current.remainingIndices.filter((index) => index > currentIndex && index >= 0 && index < snapshot.queue.length)
        : ensureShuffleCycle(snapshot).filter((index) => index > currentIndex);

      const sourcePosition = currentCycle.indexOf(fromIndex);
      const targetPosition = currentCycle.indexOf(toIndex);
      if (sourcePosition === -1 || targetPosition === -1) return;

      const nextCycle = [...currentCycle];
      const [movedIndex] = nextCycle.splice(sourcePosition, 1);
      const targetAfterRemoval = nextCycle.indexOf(toIndex);
      if (targetAfterRemoval === -1) return;
      const insertPosition = options.placement === "after" ? targetAfterRemoval + 1 : targetAfterRemoval;
      nextCycle.splice(insertPosition, 0, movedIndex);

      shuffleCycleRef.current = { signature, remainingIndices: nextCycle };
      setQueueState({ queue: [...snapshot.queue] }, { resetShuffle: false });
      return;
    }

    const nextQueue = [...snapshot.queue];
    const [moved] = nextQueue.splice(fromIndex, 1);
    const insertIndex = options.placement === "after" ? toIndex + 1 : toIndex;
    const destinationIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    if (destinationIndex === fromIndex) return;
    nextQueue.splice(destinationIndex, 0, moved);
    setQueueState({ queue: nextQueue }, { resetShuffle: true });
  }, [ensureShuffleCycle, getQueueCurrentIndex, getQueueSignature, setQueueState]);

  const getUpcomingQueue = useCallback((limit = 100) => {
    const snapshot = stateRef.current;
    if (!snapshot.queue.length) return [];

    const currentIndex = getQueueCurrentIndex(snapshot);
    const indices = snapshot.shuffle
      ? ensureShuffleCycle(snapshot)
      : snapshot.queue
          .map((_, index) => index)
          .filter((index) => index > currentIndex);

    const capped = Number.isFinite(limit) ? indices.slice(0, limit) : indices;
    return capped.map((queueIndex, order) => ({
      ...snapshot.queue[queueIndex],
      queueIndex,
      queueOrder: order + 1,
    }));
  }, [ensureShuffleCycle, getQueueCurrentIndex]);

  const startTrackPlayback = useCallback((track, queue, index, volume = stateRef.current.volume, crossfadeDuration = 1, replaceQueue = false, queueSource = null) => {
    seekSuppressCfRef.current = false;
    autoCfTriggeredRef.current = false;
    endGuardRef.current = false;
    stalledNearEndRef.current = 0;
    dispatch({
      type: replaceQueue ? "PLAY_TRACK" : "SET_TRACK_DIRECT",
      payload: replaceQueue
        ? { track, queue, index, queueSource: queueSource ?? stateRef.current.queueSource }
        : { track, index },
    });
    if (IS_MOBILE) nativePlayTrack(track);
    else {
      applyDesktopPlaybackState(volume);
      doCrossfade(getStreamUrl(track), volume, crossfadeDuration);
    }
    resetListenLogging(track);
  }, [applyDesktopPlaybackState, doCrossfade, nativePlayTrack, resetListenLogging]);

  useEffect(() => {
    if (IS_MOBILE) return;
    const onTime = () => {
      if (stateRef.current.isRadio) return;
      dispatch({ type: "SET_PROGRESS", payload: audio.currentTime });
      syncListenProgress(stateRef.current, audio.currentTime);

      const cf = crossfadeRef.current;
      if (cf > 0 && !autoCfTriggeredRef.current && !crossfadeActiveRef.current && !seekSuppressCfRef.current && audio.duration > 0 && audio.duration - audio.currentTime <= cf && audio.duration - audio.currentTime > 0.5 && stateRef.current.repeat !== "one") {
        autoCfTriggeredRef.current = true;
        const s = stateRef.current;
        maybeLogCurrentListen(s, { positionOverride: audio.currentTime });
        autoAdvanceRef.current?.();
      }
    };
    const onDuration = () => { if (!stateRef.current.isRadio) dispatch({ type: "SET_DURATION", payload: audio.duration }); };
    const onEnded = () => {
      const s = stateRef.current;
      if (s.isRadio) return;
      if (crossfadeActiveRef.current || autoCfTriggeredRef.current) {
        autoCfTriggeredRef.current = false;
        return;
      }
      finishTrack();
    };
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") return;
      applyDesktopPlaybackState();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    window.addEventListener("focus", onVisibilityOrFocus);
    window.addEventListener("pageshow", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
      window.removeEventListener("focus", onVisibilityOrFocus);
      window.removeEventListener("pageshow", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [applyDesktopPlaybackState, audio, finishTrack, maybeLogCurrentListen, syncListenProgress]);

  useEffect(() => {
    if (IS_MOBILE) return undefined;
    clearInterval(playbackWatchdogRef.current);

    if (!state.isPlaying || state.isRadio || !state.currentTrack) return undefined;

    playbackWatchdogRef.current = setInterval(() => {
      if (crossfadeActiveRef.current || autoCfTriggeredRef.current || endGuardRef.current) return;
      if (!audio.duration || Number.isNaN(audio.duration)) return;

      dispatch({ type: "SET_PROGRESS", payload: audio.currentTime });

      const nearEnd = audio.currentTime >= Math.max(0, audio.duration - 0.2);
      stalledNearEndRef.current = (audio.ended || nearEnd)
        ? stalledNearEndRef.current + 1
        : 0;

      if (stalledNearEndRef.current >= 2) {
        finishTrack();
      }
    }, 500);

    return () => clearInterval(playbackWatchdogRef.current);
  }, [audio, finishTrack, state.currentTrack, state.isPlaying, state.isRadio]);

  useEffect(() => {
    if (!IS_MOBILE) return;
    let unlisten;
    const init = async () => {
      try {
        await invoke("plugin:nativeaudio|initialize");
        unlisten = await listen("plugin:nativeaudio://state", (event) => {
          const ns = event.payload;
          if (!ns) return;
          if (stateRef.current.isRadio) return;
          if (ns.duration > 0) dispatch({ type: "SET_DURATION", payload: ns.duration });
          if (ns.currentTime != null) dispatch({ type: "SET_PROGRESS", payload: ns.currentTime });
          if (ns.currentTime != null) {
            syncListenProgress(stateRef.current, ns.currentTime);
          }
          if (ns.status === "ended") {
            const s = stateRef.current;
            maybeLogCurrentListen(s, {
              positionOverride: ns.duration || ns.currentTime || s.duration || s.progress,
            });
            if (s.repeat === "one") {
              if (s.currentTrack) {
                recordTrackShuffleOutcome(s.currentTrack, s, { completed: true });
              }
              invoke("plugin:nativeaudio|seek", { time: 0 }).then(() => invoke("plugin:nativeaudio|resume")).catch(() => {});
            } else {
              skipNextRef.current?.({ completedCurrent: true });
            }
          } else if (ns.status === "next") {
            skipNextRef.current?.();
          } else if (ns.status === "prev") {
            skipPrevRef.current?.();
          }
          if (ns.isPlaying !== undefined && ns.isPlaying !== stateRef.current.isPlaying) {
            dispatch({ type: "SET_PLAYING", payload: ns.isPlaying });
          }
        });
        invoke("plugin:nativeaudio|set_crossfade", { seconds: 0 }).catch(() => {});
      } catch (e) { console.warn("[NativeAudio] init failed:", e); }
    };
    init();
    return () => { unlisten?.(); invoke("plugin:nativeaudio|dispose").catch(() => {}); };
  }, [maybeLogCurrentListen, recordTrackShuffleOutcome, syncListenProgress]);

  const playTrack = useCallback((track, queue = [], index = 0, queueSource = DEFAULT_PLAYBACK_SOURCE) => {
    const snapshot = stateRef.current;
    if (snapshot.currentTrack && getQueueTrackKey(snapshot.currentTrack) !== getQueueTrackKey(track)) {
      maybeLogCurrentListen(snapshot);
      recordTrackShuffleOutcome(snapshot.currentTrack, snapshot);
      pushSessionHistory(snapshot);
    }
    if (snapshot.isRadio) {
      clearInterval(radioPollingRef.current);
      dispatch({ type: "STOP_RADIO" });
    }
    const incomingQueue = Array.isArray(queue) ? queue : [];
    const queueChanged = incomingQueue !== snapshot.queue;
    const incomingKey = getQueueTrackKey(track);
    const currentTrackKey = getQueueTrackKey(snapshot.currentTrack);
    const trackInExistingQueue =
      snapshot.queue.some((queuedTrack) => getQueueTrackKey(queuedTrack) === incomingKey)
      || (currentTrackKey != null && currentTrackKey === incomingKey);

    if (queueSource !== "queue") {
      basePlaybackContextRef.current = {
        queue: incomingQueue,
        queueIndex: index,
        queueSource: normalizePlaybackSource(queueSource),
        playlistId: track?.playlistId || null,
      };
    }

    if (snapshot.queueSource === "queue" && queueSource !== "queue" && currentTrackKey != null && incomingKey === currentTrackKey) {
      return;
    }

    if (snapshot.queueSource === "queue" && queueSource !== "queue" && queueChanged && !trackInExistingQueue) {
      if (!IS_MOBILE) ensureAnalyser();
      startTrackPlayback(track, snapshot.queue, snapshot.queueIndex, snapshot.volume, 1, false);
      setQueuePrompt({
        type: "disable-custom",
        track,
        queue: incomingQueue,
        index,
        queueSource: normalizePlaybackSource(queueSource),
      });
      return;
    }

    if (queueChanged) resetShuffleCycle();
    if (!IS_MOBILE) ensureAnalyser();
    startTrackPlayback(track, incomingQueue, index, snapshot.volume, 1, true, normalizePlaybackSource(queueSource));
  }, [ensureAnalyser, getQueueTrackKey, maybeLogCurrentListen, recordTrackShuffleOutcome, resetShuffleCycle, pushSessionHistory, startTrackPlayback, setQueuePrompt]);

  const playQueueItem = useCallback((queueIndex) => {
    const snapshot = stateRef.current;
    if (queueIndex < 0 || queueIndex >= snapshot.queue.length) return;
    playTrack(snapshot.queue[queueIndex], snapshot.queue, queueIndex, snapshot.queueSource || "queue");
  }, [playTrack]);

  const togglePlay = useCallback(() => {
    if (state.isRadio) {
      if (state.isPlaying) {
        if (IS_MOBILE) invoke("plugin:nativeaudio|pause").catch(() => {});
        else audio.pause();
        dispatch({ type: "SET_PLAYING", payload: false });
      } else {
        if (IS_MOBILE) {
          invoke("plugin:nativeaudio|play_track", { url: getRadioStreamUrl(), title: "JuiceVault Radio", artist: "Live" }).catch(() => {});
        } else {
          applyDesktopPlaybackState();
          audio.src = getRadioStreamUrl();
          audio.play().catch(() => {});
        }
        dispatch({ type: "SET_PLAYING", payload: true });
      }
      return;
    }
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      if (!IS_MOBILE) cancelCrossfade();
      if (IS_MOBILE) invoke("plugin:nativeaudio|pause").catch(() => {});
      else audio.pause();
      dispatch({ type: "SET_PLAYING", payload: false });
    } else {
      if (IS_MOBILE) invoke("plugin:nativeaudio|resume").catch(() => {});
      else {
        applyDesktopPlaybackState();
        audio.play().catch(() => {});
      }
      dispatch({ type: "SET_PLAYING", payload: true });
    }
  }, [state.currentTrack, state.isPlaying, state.isRadio, cancelCrossfade, applyDesktopPlaybackState]);

  const seekVolRef = useRef(null);

  const seek = useCallback((time) => {
    if (IS_MOBILE) invoke("plugin:nativeaudio|seek", { time }).catch(() => {});
    else audio.currentTime = time;
    if (listenMetricsRef.current.trackKey) {
      listenMetricsRef.current.lastPosition = Math.max(0, time);
    }
    dispatch({ type: "SET_PROGRESS", payload: time });
  }, [audio]);

  const startSeek = useCallback(() => {
    if (IS_MOBILE) return;
    seekVolRef.current = outputGainRef.current?.gain.value ?? state.volume;
    if (outputGainRef.current) outputGainRef.current.gain.value = 0;
    else audio.volume = 0;
  }, [audio, state.volume]);

  const endSeek = useCallback((time) => {
    if (IS_MOBILE) {
      invoke("plugin:nativeaudio|seek", { time }).catch(() => {});
    } else {
      audio.currentTime = time;
      if (outputGainRef.current) outputGainRef.current.gain.value = seekVolRef.current ?? state.volume;
      else audio.volume = seekVolRef.current ?? state.volume;
      seekVolRef.current = null;
    }
    if (listenMetricsRef.current.trackKey) {
      listenMetricsRef.current.lastPosition = Math.max(0, time);
    }
    dispatch({ type: "SET_PROGRESS", payload: time });
    seekSuppressCfRef.current = true;
  }, [state.volume]);

  const setVolume = useCallback((v) => {
    const nextVolume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(PLAYER_VOLUME_KEY, String(nextVolume));
    } catch {}

    if (IS_MOBILE) invoke("plugin:nativeaudio|set_volume", { volume: nextVolume }).catch(() => {});
    else {
      if (outputGainRef.current) outputGainRef.current.gain.value = nextVolume;
      else audio.volume = nextVolume;
      if (fadeOutAudioRef.current) fadeOutAudioRef.current.volume = nextVolume;
    }
    dispatch({ type: "SET_VOLUME", payload: nextVolume });
  }, [audio]);

  const skipNext = useCallback(({ recordCurrentOutcome = true, completedCurrent = false } = {}) => {
    maybeLogCurrentListen(state);
    if (recordCurrentOutcome && state.currentTrack) {
      recordTrackShuffleOutcome(state.currentTrack, state, { completed: completedCurrent });
    }
    if (state.currentTrack) pushSessionHistory(state);
    const nextIdx = getNextQueueIndex(state);
    if (nextIdx < 0) {
      dispatch({ type: "SET_PLAYING", payload: false });
      endGuardRef.current = false;
      return;
    }
    const track = state.queue[nextIdx];
    startTrackPlayback(track, state.queue, nextIdx, state.volume, 1);
  }, [state, getNextQueueIndex, maybeLogCurrentListen, recordTrackShuffleOutcome, pushSessionHistory, startTrackPlayback]);

  skipNextRef.current = skipNext;

  const autoAdvanceNext = useCallback(() => {
    const s = stateRef.current;
    maybeLogCurrentListen(s);
    if (s.currentTrack) {
      recordTrackShuffleOutcome(s.currentTrack, s, { completed: true });
      pushSessionHistory(s);
    }
    const nextIdx = getNextQueueIndex(s);
    if (nextIdx < 0) {
      dispatch({ type: "SET_PLAYING", payload: false });
      endGuardRef.current = false;
      return;
    }
    const track = s.queue[nextIdx];
    startTrackPlayback(track, s.queue, nextIdx, s.volume);
  }, [getNextQueueIndex, maybeLogCurrentListen, recordTrackShuffleOutcome, pushSessionHistory, startTrackPlayback]);

  const autoAdvanceRef = useRef(autoAdvanceNext);
  autoAdvanceRef.current = autoAdvanceNext;

  const skipPrev = useCallback(() => {
    if (IS_MOBILE) {
      if (stateRef.current.progress > 3) { invoke("plugin:nativeaudio|seek", { time: 0 }).catch(() => {}); return; }
    } else {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    }
    const previousEntry = sessionHistoryRef.current.pop();
    if (previousEntry?.track) {
      if (state.currentTrack) {
        maybeLogCurrentListen(state);
        recordTrackShuffleOutcome(state.currentTrack, state);
      }
      const previousQueue = Array.isArray(previousEntry.queue) ? previousEntry.queue : state.queue;
      const previousIndex = previousEntry.index >= 0
        ? previousEntry.index
        : previousQueue.findIndex((track) => getQueueTrackKey(track) === getQueueTrackKey(previousEntry.track));
      startTrackPlayback(previousEntry.track, previousQueue, previousIndex >= 0 ? previousIndex : 0, state.volume, 1, previousQueue !== state.queue);
      return;
    }
    if (!state.queue.length) return;
    if (state.currentTrack) {
      maybeLogCurrentListen(state);
      recordTrackShuffleOutcome(state.currentTrack, state);
    }
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.repeat === "all" ? state.queue.length - 1 : 0;
    const track = state.queue[prevIdx];
    startTrackPlayback(track, state.queue, prevIdx, state.volume, 1);
  }, [state, audio, maybeLogCurrentListen, recordTrackShuffleOutcome, getQueueTrackKey, startTrackPlayback]);

  skipPrevRef.current = skipPrev;

  const toggleShuffle = useCallback(() => {
    resetShuffleCycle();
    dispatch({ type: "TOGGLE_SHUFFLE" });
    setTimeout(() => savePrefsToApi({ shuffle: stateRef.current.shuffle }), 0);
  }, [resetShuffleCycle, savePrefsToApi]);
  const cycleRepeat = useCallback(() => {
    dispatch({ type: "CYCLE_REPEAT" });
    setTimeout(() => {
      const repeatMap = { off: "none", all: "all", one: "none" };
      savePrefsToApi({ repeat: repeatMap[stateRef.current.repeat] || "none" });
    }, 0);
  }, [savePrefsToApi]);

  const radioPollingRef = useRef(null);
  const radioTickRef = useRef(null);
  const radioElapsedRef = useRef(0);

  const startRadioTick = useCallback(() => {
    clearInterval(radioTickRef.current);
    radioTickRef.current = setInterval(() => {
      if (stateRef.current.isRadio && stateRef.current.isPlaying) {
        radioElapsedRef.current += 1;
        dispatch({ type: "SET_PROGRESS", payload: radioElapsedRef.current });
        syncListenProgress(stateRef.current, radioElapsedRef.current);
      }
    }, 1000);
  }, [syncListenProgress]);

  const playRadio = useCallback(() => {
    if (!IS_MOBILE) ensureAnalyser();
    if (IS_MOBILE) {
      invoke("plugin:nativeaudio|play_track", { url: getRadioStreamUrl(), title: "JuiceVault Radio", artist: "Live" }).catch(() => {});
    } else {
      applyDesktopPlaybackState();
      audio.src = getRadioStreamUrl();
      audio.play().catch(() => {});
    }
    dispatch({ type: "PLAY_RADIO", payload: {} });

    const poll = async () => {
      try {
        const res = await getRadioNowPlaying();
        const d = res?.data || res;
        if (d?.current) {
          const track = { id: d.current.id, title: d.current.title, artist: d.current.artist, cover: d.current.cover };
          const previous = stateRef.current.currentTrack;
          dispatch({ type: "SET_RADIO_DATA", payload: d });
          radioElapsedRef.current = d.current.elapsed || 0;
          dispatch({ type: "SET_PROGRESS", payload: radioElapsedRef.current });
          dispatch({ type: "SET_DURATION", payload: d.current.duration || 0 });
          if (previous?.id !== track.id) {
            if (previous?.id) {
              maybeLogCurrentListen(stateRef.current, {
                positionOverride: stateRef.current.progress || radioElapsedRef.current,
              });
            }
            dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: -1 } });
            resetListenLogging(track);
          } else {
            syncListenProgress(stateRef.current, radioElapsedRef.current);
          }
        }
      } catch {}
    };
    poll();
    startRadioTick();
    clearInterval(radioPollingRef.current);
    radioPollingRef.current = setInterval(poll, 5000);
  }, [startRadioTick, ensureAnalyser, applyDesktopPlaybackState, maybeLogCurrentListen, resetListenLogging, syncListenProgress]);

  const refreshRadio = useCallback(async () => {
    if (!stateRef.current.isRadio) return;
    try {
      const res = await getRadioNowPlaying();
      const d = res?.data || res;
      if (d?.current) {
        const track = { id: d.current.id, title: d.current.title, artist: d.current.artist, cover: d.current.cover };
        const previous = stateRef.current.currentTrack;
        dispatch({ type: "SET_RADIO_DATA", payload: d });
        radioElapsedRef.current = d.current.elapsed || 0;
        dispatch({ type: "SET_PROGRESS", payload: radioElapsedRef.current });
        dispatch({ type: "SET_DURATION", payload: d.current.duration || 0 });
        if (previous?.id !== track.id) {
          if (previous?.id) {
            maybeLogCurrentListen(stateRef.current, {
              positionOverride: stateRef.current.progress || radioElapsedRef.current,
            });
          }
          dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: -1 } });
          resetListenLogging(track);
        } else {
          syncListenProgress(stateRef.current, radioElapsedRef.current);
        }
      }
    } catch {}
  }, [maybeLogCurrentListen, resetListenLogging, syncListenProgress]);

  const stopRadio = useCallback(() => {
    clearInterval(radioPollingRef.current);
    clearInterval(radioTickRef.current);
    if (stateRef.current.isRadio && stateRef.current.currentTrack) {
      maybeLogCurrentListen(stateRef.current, {
        positionOverride: stateRef.current.progress || radioElapsedRef.current,
      });
    }
    if (IS_MOBILE) invoke("plugin:nativeaudio|stop").catch(() => {});
    else { audio.pause(); audio.src = ""; }
    dispatch({ type: "STOP_RADIO" });
    dispatch({ type: "SET_PLAYING", payload: false });
  }, [audio, maybeLogCurrentListen]);

  useEffect(() => {
    return () => { clearInterval(radioPollingRef.current); clearInterval(radioTickRef.current); };
  }, []);

  useEffect(() => {
    if (IS_MOBILE || !("mediaSession" in navigator)) return;
    const track = state.currentTrack;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const coverUrl = track.cover ? (track.local ? track.cover : `${API}${track.cover}`) : undefined;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown",
      artist: track.artist || "Unknown",
      album: state.isRadio ? "JuiceVault Radio" : "JuiceVault",
      ...(coverUrl ? { artwork: [{ src: coverUrl, sizes: "512x512", type: "image/jpeg" }] } : {}),
    });
  }, [state.currentTrack?.id, state.currentTrack?.title, state.isRadio]);

  useEffect(() => {
    if (IS_MOBILE || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.isPlaying]);

  useEffect(() => {
    if (IS_MOBILE || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => {
      applyDesktopPlaybackState();
      audio.play().catch(() => {});
      dispatch({ type: "SET_PLAYING", payload: true });
    });
    ms.setActionHandler("pause", () => { audio.pause(); dispatch({ type: "SET_PLAYING", payload: false }); });
    ms.setActionHandler("previoustrack", () => skipNextRef.current && skipPrev());
    ms.setActionHandler("nexttrack", () => skipNextRef.current?.());
    try {
      ms.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) {
          audio.currentTime = details.seekTime;
          if (listenMetricsRef.current.trackKey) {
            listenMetricsRef.current.lastPosition = Math.max(0, details.seekTime);
          }
          dispatch({ type: "SET_PROGRESS", payload: details.seekTime });
        }
      });
    } catch {}
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
      try { ms.setActionHandler("seekto", null); } catch {}
    };
  }, [applyDesktopPlaybackState, audio, skipPrev]);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        if (!localStorage.getItem("accessToken")) return;
        const res = await getCurrentUser();
        const prefs = res?.data?.preferences || res?.preferences;
        if (!prefs) return;

        const eq = {};
        if (prefs.eqBass != null) eq.bass = prefs.eqBass;
        if (prefs.eqMid != null) eq.mid = prefs.eqMid;
        if (prefs.eqTreble != null) eq.treble = prefs.eqTreble;
        if (prefs.eqReverb != null) eq.reverb = prefs.eqReverb;
        if (prefs.eqGain != null) eq.gain = prefs.eqGain;
        if (Object.keys(eq).length) {
          loadedEq.current = eq;
          localStorage.setItem("eq", JSON.stringify(eq));
          if (eq.bass != null && bassRef.current) bassRef.current.gain.value = eq.bass;
          if (eq.mid != null && midRef.current) midRef.current.gain.value = eq.mid;
          if (eq.treble != null && trebleRef.current) trebleRef.current.gain.value = eq.treble;
          if (eq.gain != null && gainRef.current) gainRef.current.gain.value = Math.pow(10, eq.gain / 20);
          if (eq.reverb != null) {
            const w = eq.reverb / 100;
            if (dryGainRef.current) dryGainRef.current.gain.value = 1 - w * 0.5;
            if (wetGainRef.current) wetGainRef.current.gain.value = w;
          }
        }

        if (prefs.crossfadeDuration != null && !IS_MOBILE) {
          crossfadeRef.current = prefs.crossfadeDuration;
          localStorage.setItem("crossfade", String(prefs.crossfadeDuration));
        }

        if (prefs.shuffle != null && prefs.shuffle !== stateRef.current.shuffle) {
          dispatch({ type: "TOGGLE_SHUFFLE" });
        }

        if (prefs.repeat != null) {
          const apiToLocal = { none: "off", all: "all" };
          const target = apiToLocal[prefs.repeat] || "off";
          while (stateRef.current.repeat !== target) {
            dispatch({ type: "CYCLE_REPEAT" });
            if (stateRef.current.repeat === target) break;
          }
        }
      } catch {}
    };
    loadPrefs();
  }, []);

  const setEQ = useCallback((param, value) => {
    const eq = { ...loadedEq.current, [param]: value };
    loadedEq.current = eq;
    localStorage.setItem("eq", JSON.stringify(eq));

    if (param === "bass" && bassRef.current) bassRef.current.gain.value = value;
    if (param === "mid" && midRef.current) midRef.current.gain.value = value;
    if (param === "treble" && trebleRef.current) trebleRef.current.gain.value = value;
    if (param === "gain" && gainRef.current) gainRef.current.gain.value = Math.pow(10, value / 20);
    if (param === "reverb") {
      const w = value / 100;
      if (dryGainRef.current) dryGainRef.current.gain.value = 1 - w * 0.5;
      if (wetGainRef.current) wetGainRef.current.gain.value = w;
    }
    if (IS_MOBILE) {
      const eq = loadedEq.current;
      invoke("plugin:nativeaudio|set_eq", {
        bass: eq.bass ?? 0, mid: eq.mid ?? 0, treble: eq.treble ?? 0,
        reverb: eq.reverb ?? 0, gain: eq.gain ?? 0,
      }).catch(() => {});
    }
    const keyMap = { bass: "eqBass", mid: "eqMid", treble: "eqTreble", reverb: "eqReverb", gain: "eqGain" };
    if (keyMap[param]) savePrefsToApi({ [keyMap[param]]: value });
  }, [savePrefsToApi]);

  const getEQ = useCallback(() => loadedEq.current, []);

  const setCrossfade = useCallback((seconds) => {
    if (IS_MOBILE) {
      crossfadeRef.current = 0;
      localStorage.setItem("crossfade", "0");
      invoke("plugin:nativeaudio|set_crossfade", { seconds: 0 }).catch(() => {});
      return;
    }
    crossfadeRef.current = seconds;
    localStorage.setItem("crossfade", String(seconds));
    savePrefsToApi({ crossfadeDuration: seconds });
  }, [savePrefsToApi]);

  const getCrossfade = useCallback(() => (IS_MOBILE ? 0 : crossfadeRef.current), []);

  const setVolumeSnapEnabled = useCallback((enabled) => {
    const nextEnabled = Boolean(enabled);
    localStorage.setItem(PLAYER_VOLUME_SNAP_KEY, String(nextEnabled));
    dispatch({ type: "SET_VOLUME_PREFERENCES", payload: { volumeSnapEnabled: nextEnabled } });
  }, []);

  const setVolumeCurve = useCallback((curve) => {
    const nextCurve = Math.max(0.5, Math.min(2, Number(curve) || 1));
    localStorage.setItem(PLAYER_VOLUME_CURVE_KEY, String(nextCurve));
    dispatch({ type: "SET_VOLUME_PREFERENCES", payload: { volumeCurve: nextCurve } });
  }, []);

  const value = {
    state,
    audioRef,
    analyserRef,
    analyserReady,
    ensureAnalyser,
    playTrack,
    playQueueItem,
    playRadio,
    stopRadio,
    refreshRadio,
    togglePlay,
    seek,
    startSeek,
    endSeek,
    setVolume,
    setVolumeSnapEnabled,
    setVolumeCurve,
    skipNext,
    skipPrev,
    toggleShuffle,
    cycleRepeat,
    setEQ,
    getEQ,
    setCrossfade,
    getCrossfade,
    addToQueue,
    removeQueueItem,
    moveQueueItem,
    getUpcomingQueue,
    enableCustomQueuePlayback,
    toggleCustomQueuePlayback,
    dismissQueuePrompt,
    confirmQueueSwitch,
    isMobile: IS_MOBILE,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}


