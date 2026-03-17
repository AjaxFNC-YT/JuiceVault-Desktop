import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import { scanLocalDirectory, updateUserPreferences } from "@/lib/api";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

const LocalFilesContext = createContext(null);

const initialState = {
  enabled: JSON.parse(localStorage.getItem("localFilesEnabled") || "false"),
  sources: JSON.parse(localStorage.getItem("localFilesSources") || "[]"),
  files: JSON.parse(localStorage.getItem("localFilesIndex") || "[]"),
  scanning: false,
  scanProgress: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_ENABLED":
      return { ...state, enabled: action.payload };
    case "SET_SOURCES":
      return { ...state, sources: action.payload };
    case "SET_FILES":
      return { ...state, files: action.payload };
    case "ADD_BATCH": {
      const existing = new Set(state.files.map((f) => f.file_hash));
      const newFiles = action.payload.filter((f) => !existing.has(f.file_hash));
      if (!newFiles.length) return state;
      return { ...state, files: [...state.files, ...newFiles] };
    }
    case "SET_SCANNING":
      return { ...state, scanning: action.payload };
    case "SET_SCAN_PROGRESS":
      return { ...state, scanProgress: action.payload };
    default:
      return state;
  }
}

function toLocalFile(f) {
  return {
    id: `local:${f.file_hash}`,
    local: true,
    path: f.path,
    file_name: f.file_name,
    file_hash: f.file_hash,
    title: f.title,
    artist: f.artist,
    album: f.album,
    duration: f.duration,
    length: formatDuration(f.duration),
    file_size: formatBytes(f.file_size),
    file_size_bytes: f.file_size,
    cover: f.cover ? convertFileSrc(f.cover) : null,
    rawCoverPath: f.cover || null,
    play_count: 0,
  };
}

export function LocalFilesProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const scanCountRef = useRef(0);

  useEffect(() => {
    const unsubs = [];
    listen("local-files-batch", (event) => {
      const { files, total } = event.payload;
      const mapped = (files || []).map(toLocalFile);
      dispatch({ type: "ADD_BATCH", payload: mapped });
      dispatch({ type: "SET_SCAN_PROGRESS", payload: `Indexing... ${total} files found` });
    }).then((u) => unsubs.push(u));

    listen("local-scan-complete", () => {
      dispatch({ type: "SET_SCANNING", payload: false });
      dispatch({ type: "SET_SCAN_PROGRESS", payload: null });
      const files = stateRef.current.files;
      localStorage.setItem("localFilesIndex", JSON.stringify(files));
    }).then((u) => unsubs.push(u));

    return () => unsubs.forEach((u) => u());
  }, []);

  const setEnabled = useCallback((enabled) => {
    dispatch({ type: "SET_ENABLED", payload: enabled });
    localStorage.setItem("localFilesEnabled", JSON.stringify(enabled));
    updateUserPreferences({ localFilesEnabled: enabled }).catch(() => {});
  }, []);

  const scanAllSources = useCallback(async () => {
    const sources = stateRef.current.sources;
    if (!sources.length) return;
    dispatch({ type: "SET_SCANNING", payload: true });
    scanCountRef.current = 0;
    dispatch({ type: "SET_SCAN_PROGRESS", payload: "Starting scan..." });

    const knownHashes = stateRef.current.files.map((f) => f.file_hash);

    for (let i = 0; i < sources.length; i++) {
      try {
        await scanLocalDirectory(sources[i], knownHashes.length ? knownHashes : null);
      } catch {}
    }
  }, []);

  const addSource = useCallback((path) => {
    const current = stateRef.current.sources;
    if (current.includes(path)) return;
    const next = [...current, path];
    dispatch({ type: "SET_SOURCES", payload: next });
    localStorage.setItem("localFilesSources", JSON.stringify(next));
    updateUserPreferences({ localFilesSources: next }).catch(() => {});
    setTimeout(() => scanAllSources(), 100);
  }, [scanAllSources]);

  const removeSource = useCallback((path) => {
    const next = stateRef.current.sources.filter((s) => s !== path);
    dispatch({ type: "SET_SOURCES", payload: next });
    localStorage.setItem("localFilesSources", JSON.stringify(next));
    updateUserPreferences({ localFilesSources: next }).catch(() => {});
    const files = stateRef.current.files.filter((f) => !f.path.startsWith(path));
    dispatch({ type: "SET_FILES", payload: files });
    localStorage.setItem("localFilesIndex", JSON.stringify(files));
  }, []);

  useEffect(() => {
    if (state.enabled && state.sources.length && !state.files.length) {
      scanAllSources();
    }
  }, []);

  return (
    <LocalFilesContext.Provider value={{ ...state, setEnabled, addSource, removeSource, scanAllSources }}>
      {children}
    </LocalFilesContext.Provider>
  );
}

export function useLocalFiles() {
  return useContext(LocalFilesContext);
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
