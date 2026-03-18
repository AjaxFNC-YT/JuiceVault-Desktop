import { createContext, useContext, useReducer, useRef, useCallback, useEffect, useState } from "react";
import { logListen, getRadioNowPlaying, getCurrentUser, updateUserPreferences } from "@/lib/api";
import { convertFileSrc } from "@tauri-apps/api/core";

const API = "https://api.juicevault.xyz";
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

function getStreamUrl(track) {
  if (track?.local && track?.path) return convertFileSrc(track.path);
  return `${API}/music/stream/${track.id}?src=app`;
}

const initialState = {
  currentTrack: null,
  isPlaying: false,
  volume: 0.7,
  progress: 0,
  duration: 0,
  queue: [],
  queueIndex: -1,
  shuffle: false,
  repeat: "off",
  isRadio: false,
  radioData: null,
};

function playerReducer(state, action) {
  switch (action.type) {
    case "PLAY_TRACK":
      return { ...state, currentTrack: action.payload.track, queue: action.payload.queue, queueIndex: action.payload.index, isPlaying: true, progress: 0, duration: 0 };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.payload };
    case "SET_VOLUME":
      return { ...state, volume: action.payload };
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
    default:
      return state;
  }
}

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef(null);
  const listenStartRef = useRef(0);

  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
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
  const crossfadeRef = useRef(parseInt(localStorage.getItem("crossfade") || "0"));

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

  if (!audioRef.current) {
    audioRef.current = new Audio();
    audioRef.current.volume = initialState.volume;
    audioRef.current.crossOrigin = "anonymous";
  }

  const audio = audioRef.current;

  const crossfadeActiveRef = useRef(false);
  const preCrossfadeRef = useRef(null);
  const seekSuppressCfRef = useRef(false);

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
      audioRef.current.volume = prev.volume;
      dispatch({ type: "SET_TRACK_DIRECT", payload: { track: prev.track, index: prev.index } });
      preCrossfadeRef.current = null;
    }
  }, []);

  const doCrossfade = useCallback((newSrc, targetVolume, overrideDuration) => {
    const a = audioRef.current;
    const cfDuration = overrideDuration ?? crossfadeRef.current;
    if (cfDuration <= 0 || !a.currentSrc) {
      a.src = newSrc;
      a.volume = targetVolume;
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
    fadeIn.src = newSrc;
    fadeIn.volume = 0;
    fadeIn.play().catch(() => {});
    fadeOutAudioRef.current = fadeIn;

    const startVol = a.paused ? targetVolume : a.volume;
    if (!a.paused) {
      const steps = cfDuration * 25;
      const interval = (cfDuration * 1000) / steps;
      let step = 0;

      fadeTimerRef.current = setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);
        a.volume = Math.max(0, startVol * (1 - progress));
        fadeIn.volume = targetVolume * progress;
        if (step >= steps) {
          clearInterval(fadeTimerRef.current);
          a.pause();
          a.src = newSrc;
          a.currentTime = fadeIn.currentTime;
          a.volume = targetVolume;
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
        a.volume = targetVolume;
        a.play().catch(() => {});
        fadeIn.pause();
        fadeIn.src = "";
        fadeOutAudioRef.current = null;
        crossfadeActiveRef.current = false;
      }, 300);
    }
  }, []);

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
    if (IS_IOS) { setAnalyserReady(true); return; }
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

      source.connect(bass);
      bass.connect(mid);
      mid.connect(treble);
      treble.connect(gain);
      gain.connect(dryGain);
      dryGain.connect(analyser);
      gain.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(analyser);
      analyser.connect(actx.destination);

      bassRef.current = bass;
      midRef.current = mid;
      trebleRef.current = treble;
      gainRef.current = gain;
      dryGainRef.current = dryGain;
      wetGainRef.current = wetGain;
      convolverRef.current = convolver;
      analyserRef.current = analyser;

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
  const skipNextRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const autoCfTriggeredRef = useRef(false);

  useEffect(() => {
    const onTime = () => {
      if (stateRef.current.isRadio) return;
      dispatch({ type: "SET_PROGRESS", payload: audio.currentTime });

      const cf = crossfadeRef.current;
      if (cf > 0 && !autoCfTriggeredRef.current && !crossfadeActiveRef.current && !seekSuppressCfRef.current && audio.duration > 0 && audio.duration - audio.currentTime <= cf && audio.duration - audio.currentTime > 0.5 && stateRef.current.repeat !== "one") {
        autoCfTriggeredRef.current = true;
        const s = stateRef.current;
        if (s.currentTrack && !s.currentTrack.local) {
          const elapsed = Math.floor(audio.currentTime - listenStartRef.current);
          logListen(s.currentTrack.id, elapsed, true).catch(() => {});
        }
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
      if (s.currentTrack && !s.currentTrack.local) {
        const elapsed = Math.floor(audio.currentTime - listenStartRef.current);
        logListen(s.currentTrack.id, elapsed, true).catch(() => {});
      }
      if (s.repeat === "one") {
        audio.currentTime = 0;
        audio.play();
      } else {
        skipNextRef.current?.();
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const playTrack = useCallback((track, queue = [], index = 0) => {
    if (stateRef.current.isRadio) {
      clearInterval(radioPollingRef.current);
      dispatch({ type: "STOP_RADIO" });
    }
    ensureAnalyser();
    seekSuppressCfRef.current = false;
    autoCfTriggeredRef.current = false;
    dispatch({ type: "PLAY_TRACK", payload: { track, queue, index } });
    doCrossfade(getStreamUrl(track), stateRef.current.volume, 1);
    listenStartRef.current = 0;
  }, [ensureAnalyser, doCrossfade]);

  const togglePlay = useCallback(() => {
    if (state.isRadio) {
      if (state.isPlaying) {
        audio.pause();
        dispatch({ type: "SET_PLAYING", payload: false });
      } else {
        audio.src = `${API}/radio/stream`;
        audio.play().catch(() => {});
        dispatch({ type: "SET_PLAYING", payload: true });
      }
      return;
    }
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      cancelCrossfade();
      audio.pause();
      dispatch({ type: "SET_PLAYING", payload: false });
    } else {
      audio.play().catch(() => {});
      dispatch({ type: "SET_PLAYING", payload: true });
    }
  }, [state.currentTrack, state.isPlaying, state.isRadio, cancelCrossfade]);

  const seekVolRef = useRef(null);

  const seek = useCallback((time) => {
    audio.currentTime = time;
    dispatch({ type: "SET_PROGRESS", payload: time });
  }, []);

  const startSeek = useCallback(() => {
    seekVolRef.current = audio.volume;
    audio.volume = 0;
  }, []);

  const endSeek = useCallback((time) => {
    audio.currentTime = time;
    dispatch({ type: "SET_PROGRESS", payload: time });
    audio.volume = seekVolRef.current ?? state.volume;
    seekVolRef.current = null;
    seekSuppressCfRef.current = true;
  }, [state.volume]);

  const setVolume = useCallback((v) => {
    audio.volume = v;
    dispatch({ type: "SET_VOLUME", payload: v });
  }, []);

  const skipNext = useCallback(() => {
    if (!state.queue.length) return;
    let nextIdx;
    if (state.shuffle) {
      nextIdx = Math.floor(Math.random() * state.queue.length);
    } else {
      nextIdx = state.queueIndex + 1;
      if (nextIdx >= state.queue.length) {
        if (state.repeat === "all") nextIdx = 0;
        else { dispatch({ type: "SET_PLAYING", payload: false }); return; }
      }
    }
    const track = state.queue[nextIdx];
    seekSuppressCfRef.current = false;
    autoCfTriggeredRef.current = false;
    dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: nextIdx } });
    doCrossfade(getStreamUrl(track), state.volume, 1);
    listenStartRef.current = 0;
  }, [state.queue, state.queueIndex, state.shuffle, state.repeat, state.volume, doCrossfade]);

  skipNextRef.current = skipNext;

  const autoAdvanceNext = useCallback(() => {
    const s = stateRef.current;
    if (!s.queue.length) return;
    let nextIdx;
    if (s.shuffle) {
      nextIdx = Math.floor(Math.random() * s.queue.length);
    } else {
      nextIdx = s.queueIndex + 1;
      if (nextIdx >= s.queue.length) {
        if (s.repeat === "all") nextIdx = 0;
        else { dispatch({ type: "SET_PLAYING", payload: false }); return; }
      }
    }
    const track = s.queue[nextIdx];
    seekSuppressCfRef.current = false;
    dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: nextIdx } });
    doCrossfade(getStreamUrl(track), s.volume);
    listenStartRef.current = 0;
  }, [doCrossfade]);

  const autoAdvanceRef = useRef(autoAdvanceNext);
  autoAdvanceRef.current = autoAdvanceNext;

  const skipPrev = useCallback(() => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!state.queue.length) return;
    let prevIdx = state.queueIndex - 1;
    if (prevIdx < 0) prevIdx = state.repeat === "all" ? state.queue.length - 1 : 0;
    const track = state.queue[prevIdx];
    seekSuppressCfRef.current = false;
    autoCfTriggeredRef.current = false;
    dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: prevIdx } });
    doCrossfade(getStreamUrl(track), state.volume, 1);
    listenStartRef.current = 0;
  }, [state.queue, state.queueIndex, state.repeat, state.volume, doCrossfade]);

  const toggleShuffle = useCallback(() => {
    dispatch({ type: "TOGGLE_SHUFFLE" });
    setTimeout(() => savePrefsToApi({ shuffle: stateRef.current.shuffle }), 0);
  }, [savePrefsToApi]);
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
      }
    }, 1000);
  }, []);

  const playRadio = useCallback(() => {
    ensureAnalyser();
    audio.src = `${API}/radio/stream`;
    audio.play().catch(() => {});
    dispatch({ type: "PLAY_RADIO", payload: {} });

    const poll = async () => {
      try {
        const res = await getRadioNowPlaying();
        const d = res?.data || res;
        if (d?.current) {
          const track = { id: d.current.id, title: d.current.title, artist: d.current.artist, cover: d.current.cover };
          dispatch({ type: "SET_RADIO_DATA", payload: d });
          radioElapsedRef.current = d.current.elapsed || 0;
          dispatch({ type: "SET_PROGRESS", payload: radioElapsedRef.current });
          dispatch({ type: "SET_DURATION", payload: d.current.duration || 0 });
          if (stateRef.current.currentTrack?.id !== track.id) {
            dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: -1 } });
          }
        }
      } catch {}
    };
    poll();
    startRadioTick();
    clearInterval(radioPollingRef.current);
    radioPollingRef.current = setInterval(poll, 5000);
  }, [startRadioTick, ensureAnalyser]);

  const refreshRadio = useCallback(async () => {
    if (!stateRef.current.isRadio) return;
    try {
      const res = await getRadioNowPlaying();
      const d = res?.data || res;
      if (d?.current) {
        const track = { id: d.current.id, title: d.current.title, artist: d.current.artist, cover: d.current.cover };
        dispatch({ type: "SET_RADIO_DATA", payload: d });
        radioElapsedRef.current = d.current.elapsed || 0;
        dispatch({ type: "SET_PROGRESS", payload: radioElapsedRef.current });
        dispatch({ type: "SET_DURATION", payload: d.current.duration || 0 });
        if (stateRef.current.currentTrack?.id !== track.id) {
          dispatch({ type: "SET_TRACK_DIRECT", payload: { track, index: -1 } });
        }
      }
    } catch {}
  }, []);

  const stopRadio = useCallback(() => {
    clearInterval(radioPollingRef.current);
    clearInterval(radioTickRef.current);
    audio.pause();
    audio.src = "";
    dispatch({ type: "STOP_RADIO" });
    dispatch({ type: "SET_PLAYING", payload: false });
  }, []);

  useEffect(() => {
    return () => { clearInterval(radioPollingRef.current); clearInterval(radioTickRef.current); };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
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
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => { audio.play().catch(() => {}); dispatch({ type: "SET_PLAYING", payload: true }); });
    ms.setActionHandler("pause", () => { audio.pause(); dispatch({ type: "SET_PLAYING", payload: false }); });
    ms.setActionHandler("previoustrack", () => skipNextRef.current && skipPrev());
    ms.setActionHandler("nexttrack", () => skipNextRef.current?.());
    try { ms.setActionHandler("seekto", (details) => { if (details.seekTime != null) { audio.currentTime = details.seekTime; dispatch({ type: "SET_PROGRESS", payload: details.seekTime }); } }); } catch {}
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
      try { ms.setActionHandler("seekto", null); } catch {}
    };
  }, [skipPrev]);

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

        if (prefs.crossfadeDuration != null) {
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
    const keyMap = { bass: "eqBass", mid: "eqMid", treble: "eqTreble", reverb: "eqReverb", gain: "eqGain" };
    if (keyMap[param]) savePrefsToApi({ [keyMap[param]]: value });
  }, [savePrefsToApi]);

  const getEQ = useCallback(() => loadedEq.current, []);

  const setCrossfade = useCallback((seconds) => {
    crossfadeRef.current = seconds;
    localStorage.setItem("crossfade", String(seconds));
    savePrefsToApi({ crossfadeDuration: seconds });
  }, [savePrefsToApi]);

  const getCrossfade = useCallback(() => crossfadeRef.current, []);

  const value = {
    state,
    audioRef,
    analyserRef,
    analyserReady,
    ensureAnalyser,
    playTrack,
    playRadio,
    stopRadio,
    refreshRadio,
    togglePlay,
    seek,
    startSeek,
    endSeek,
    setVolume,
    skipNext,
    skipPrev,
    toggleShuffle,
    cycleRepeat,
    setEQ,
    getEQ,
    setCrossfade,
    getCrossfade,
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
