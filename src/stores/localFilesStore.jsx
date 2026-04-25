import { createContext, useContext, useReducer, useCallback, useEffect, useMemo, useRef } from "react";
import { scanLocalDirectory, updateUserPreferences } from "@/lib/api";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";

const LocalFilesContext = createContext(null);
const LOCAL_FILES_CACHE_KEY = "localFilesIndex";
const LOCAL_FILES_MANIFEST_KEY = "localFilesManifest";
const MAX_LOCAL_FILES_CACHE_BYTES = 4 * 1024 * 1024;
const PERSIST_DEBOUNCE_MS = 1000;

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persistFilesCache(files) {
  try {
    const serialized = JSON.stringify(files);
    if (serialized.length <= MAX_LOCAL_FILES_CACHE_BYTES) {
      localStorage.setItem(LOCAL_FILES_CACHE_KEY, serialized);
    } else {
      console.warn("[LocalFiles] Cached index too large for localStorage, keeping it memory-only");
      localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
    }
  } catch (error) {
    console.warn("[LocalFiles] Failed to persist cached index:", error);
    localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
  }
}

function buildManifest(files) {
  return files.map((file) => ({
    path: file.path,
    file_hash: file.file_hash,
    file_size: file.file_size_bytes ?? file.file_size ?? 0,
    modified_at: file.modified_at ?? 0,
  }));
}

function persistManifest(files) {
  try {
    localStorage.setItem(LOCAL_FILES_MANIFEST_KEY, JSON.stringify(buildManifest(files)));
  } catch (error) {
    console.warn("[LocalFiles] Failed to persist manifest:", error);
    localStorage.removeItem(LOCAL_FILES_MANIFEST_KEY);
  }
}

function resolveLocalCover(coverPath) {
  if (!coverPath) return null;
  if (/^(https?:|asset:|data:|blob:)/i.test(coverPath)) {
    return coverPath;
  }
  return convertFileSrc(coverPath);
}

function normalizeCachedFiles(files) {
  return (Array.isArray(files) ? files : []).map((file) => {
    const rawCoverPath = file.rawCoverPath || file.cover || null;
    return {
      ...file,
      local: true,
      rawCoverPath,
      cover: resolveLocalCover(rawCoverPath),
      modified_at: file.modified_at ?? file.modifiedAt ?? 0,
      file_size_bytes: file.file_size_bytes ?? file.file_size ?? 0,
    };
  });
}

function createInitialState() {
  const enabled = readJsonStorage("localFilesEnabled", false);
  return {
    enabled,
    sources: readJsonStorage("localFilesSources", []),
    files: [],
    manifest: enabled ? readJsonStorage(LOCAL_FILES_MANIFEST_KEY, []) : [],
    scanning: false,
    scanProgress: null,
    rescanRequiredCount: 0,
    hydrated: false,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_ENABLED":
      return action.payload
        ? { ...state, enabled: true }
        : { ...state, enabled: false, files: [], manifest: [], scanning: false, scanProgress: null, rescanRequiredCount: 0 };
    case "SET_SOURCES":
      return { ...state, sources: action.payload };
    case "SET_FILES":
      return { ...state, files: action.payload, manifest: buildManifest(action.payload) };
    case "UPSERT_BATCH": {
      if (!action.payload.length) return state;
      const next = [...state.files];
      const byPath = action.byPath || new Map(next.map((file, index) => [file.path, index]));
      for (const file of action.payload) {
        const existingIndex = byPath.get(file.path);
        if (existingIndex == null) {
          next.push(file);
        } else {
          next[existingIndex] = { ...next[existingIndex], ...file };
        }
      }
      return { ...state, files: next };
    }
    case "SET_SCANNING":
      return { ...state, scanning: action.payload };
    case "SET_SCAN_PROGRESS":
      return { ...state, scanProgress: action.payload };
    case "REMOVE_PATHS": {
      if (!action.payload.length) return state;
      const removed = new Set(action.payload);
      const next = state.files.filter((file) => !removed.has(file.path));
      if (next.length === state.files.length) return state;
      return { ...state, files: next, manifest: buildManifest(next) };
    }
    case "SET_FILE_COVER": {
      const existingIndex = state.files.findIndex((file) => file.path === action.payload.path);
      if (existingIndex < 0) return state;
      const next = [...state.files];
      next[existingIndex] = {
        ...next[existingIndex],
        cover: resolveLocalCover(action.payload.cover),
        rawCoverPath: action.payload.cover,
      };
      return { ...state, files: next };
    }
    case "SET_RESCAN_REQUIRED_COUNT":
      return { ...state, rescanRequiredCount: action.payload };
    case "SET_HYDRATED":
      return { ...state, hydrated: action.payload };
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
    modified_at: f.modified_at ?? f.modifiedAt ?? 0,
    title: f.title,
    artist: f.artist,
    album: f.album,
    duration: f.duration,
    length: formatDuration(f.duration),
    file_size: formatBytes(f.file_size),
    file_size_bytes: f.file_size,
    cover: resolveLocalCover(f.cover),
    rawCoverPath: f.cover || null,
    play_count: 0,
  };
}

export function LocalFilesProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const autoScanStartedRef = useRef(false);
  const filesByPathRef = useRef(new Map());

  useEffect(() => {
    filesByPathRef.current = new Map(state.files.map((file, index) => [file.path, index]));
  }, [state.files]);

  useEffect(() => {
    const hydrate = () => {
      const enabled = readJsonStorage("localFilesEnabled", false);
      if (!enabled) {
        localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
        localStorage.removeItem(LOCAL_FILES_MANIFEST_KEY);
        dispatch({ type: "SET_ENABLED", payload: false });
        dispatch({ type: "SET_HYDRATED", payload: true });
        return;
      }

      try {
        const raw = localStorage.getItem(LOCAL_FILES_CACHE_KEY);
        if (!raw) return;
        if (raw.length > MAX_LOCAL_FILES_CACHE_BYTES) {
          console.warn("[LocalFiles] Skipping oversized cached index at startup");
          localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
          return;
        }
        const parsed = JSON.parse(raw);
        dispatch({ type: "SET_FILES", payload: normalizeCachedFiles(parsed) });
      } catch (error) {
        console.warn("[LocalFiles] Failed to restore cached index:", error);
        localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
      } finally {
        dispatch({ type: "SET_HYDRATED", payload: true });
      }
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(hydrate, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }

    const timer = window.setTimeout(hydrate, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubs = [];
    listen("local-files-batch", (event) => {
      const { files, total } = event.payload;
      const mapped = (files || []).map(toLocalFile);
      const byPath = filesByPathRef.current;
      for (const file of mapped) {
        if (!byPath.has(file.path)) {
          byPath.set(file.path, byPath.size);
        }
      }
      dispatch({ type: "UPSERT_BATCH", payload: mapped, byPath: filesByPathRef.current });
      dispatch({ type: "SET_SCAN_PROGRESS", payload: `Indexing... ${total} files found` });
    }).then((u) => unsubs.push(u));

    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (!state.enabled) {
      localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
      localStorage.removeItem(LOCAL_FILES_MANIFEST_KEY);
      return;
    }

    const timer = window.setTimeout(() => {
      persistFilesCache(state.files);
      persistManifest(state.files);
    }, PERSIST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [state.files, state.hydrated, state.enabled]);

  const manifest = useMemo(() => buildManifest(state.files), [state.files]);

  const setEnabled = useCallback((enabled) => {
    dispatch({ type: "SET_ENABLED", payload: enabled });
    localStorage.setItem("localFilesEnabled", JSON.stringify(enabled));
    if (!enabled) {
      localStorage.removeItem(LOCAL_FILES_CACHE_KEY);
      localStorage.removeItem(LOCAL_FILES_MANIFEST_KEY);
    }
    updateUserPreferences({ localFilesEnabled: enabled }).catch(() => {});
  }, []);

  const runScan = useCallback(async (sources, { allowUpdates = false } = {}) => {
    if (!stateRef.current.enabled) return;
    if (!sources.length) return;
    dispatch({ type: "SET_SCANNING", payload: true });
    dispatch({ type: "SET_SCAN_PROGRESS", payload: allowUpdates ? "Refreshing local files..." : "Checking for new local files..." });

    let changedCount = 0;
    const removedPaths = new Set();

    try {
      for (let i = 0; i < sources.length; i++) {
        dispatch({
          type: "SET_SCAN_PROGRESS",
          payload: `${allowUpdates ? "Refreshing" : "Checking"} source ${i + 1} of ${sources.length}...`,
        });

        try {
          const summary = await scanLocalDirectory(sources[i], allowUpdates);
          for (const path of summary?.removedPaths || []) removedPaths.add(path);
          changedCount += Number(summary?.changedCount || 0);
        } catch {}
      }
    } finally {
      if (removedPaths.size) {
        dispatch({ type: "REMOVE_PATHS", payload: [...removedPaths] });
      }

      dispatch({ type: "SET_RESCAN_REQUIRED_COUNT", payload: allowUpdates ? 0 : changedCount });
      dispatch({ type: "SET_SCANNING", payload: false });
      dispatch({ type: "SET_SCAN_PROGRESS", payload: null });
    }
  }, []);

  const scanAllSources = useCallback(async ({ allowUpdates = true } = {}) => {
    const sources = stateRef.current.sources;
    await runScan(sources, { allowUpdates });
  }, [runScan]);

  const addSource = useCallback((path) => {
    const current = stateRef.current.sources;
    if (current.includes(path)) return;
    const next = [...current, path];
    dispatch({ type: "SET_SOURCES", payload: next });
    localStorage.setItem("localFilesSources", JSON.stringify(next));
    updateUserPreferences({ localFilesSources: next }).catch(() => {});
    setTimeout(() => runScan([path], { allowUpdates: false }), 100);
  }, [runScan]);

  const removeSource = useCallback((path) => {
    const next = stateRef.current.sources.filter((s) => s !== path);
    dispatch({ type: "SET_SOURCES", payload: next });
    localStorage.setItem("localFilesSources", JSON.stringify(next));
    updateUserPreferences({ localFilesSources: next }).catch(() => {});
    const files = stateRef.current.files.filter((f) => !f.path.startsWith(path));
    dispatch({ type: "SET_FILES", payload: files });
  }, []);

  const setFileCover = useCallback((path, cover) => {
    if (!path || !cover) return;
    dispatch({ type: "SET_FILE_COVER", payload: { path, cover } });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    if (state.enabled && state.sources.length && !autoScanStartedRef.current) {
      autoScanStartedRef.current = true;
      scanAllSources({ allowUpdates: state.files.length === 0 });
    }
  }, [state.enabled, state.sources.length, state.hydrated, state.files.length, scanAllSources]);

  return (
    <LocalFilesContext.Provider value={{ ...state, manifest, setEnabled, addSource, removeSource, scanAllSources, setFileCover }}>
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
