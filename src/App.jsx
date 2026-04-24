import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import TitleBar from "@/components/TitleBar";
import UpdateModal from "@/components/UpdateModal";
import { refreshAuth, login as apiLogin, getCurrentUser, checkForUpdate } from "@/lib/api";
import { getDefaultTitlebarStyle } from "@/lib/platform";
import { LocalFilesProvider } from "@/stores/localFilesStore";
import { AnimatePresence, motion } from "framer-motion";

const SKIPPED_UPDATE_VERSION_KEY = "skipped_update_version";
const LAST_UPDATE_INFO_KEY = "last_update_info";
const UPDATE_STATE_EVENT = "juicevault-update-state";
const DEV_UPDATE_MODAL_DEFAULTS = {
  currentVersion: "0.0.0",
  latestVersion: "1.1.0",
  release: {
    size: 48234496,
    downloadUrl: "/downloads/JuiceVault_1.1.0_x64-setup.exe",
  },
};

function emitUpdateStateChange() {
  window.dispatchEvent(new Event(UPDATE_STATE_EVENT));
}

function normalizeUpdateInfo(overrides = {}) {
  if (!overrides || typeof overrides !== "object") {
    return {
      updateAvailable: true,
      currentVersion: DEV_UPDATE_MODAL_DEFAULTS.currentVersion,
      latestVersion: DEV_UPDATE_MODAL_DEFAULTS.latestVersion,
      release: { ...DEV_UPDATE_MODAL_DEFAULTS.release },
    };
  }

  const currentVersion = typeof overrides.currentVersion === "string"
    ? overrides.currentVersion
    : typeof overrides.current === "string"
      ? overrides.current
      : DEV_UPDATE_MODAL_DEFAULTS.currentVersion;
  const latestVersion = typeof overrides.latestVersion === "string"
    ? overrides.latestVersion
    : typeof overrides.latest === "string"
      ? overrides.latest
      : DEV_UPDATE_MODAL_DEFAULTS.latestVersion;
  const existingRelease = overrides.release && typeof overrides.release === "object" ? overrides.release : {};
  const size = Number.isFinite(Number(existingRelease.size ?? overrides.size))
    ? Number(existingRelease.size ?? overrides.size)
    : DEV_UPDATE_MODAL_DEFAULTS.release.size;
  const downloadUrl = typeof (existingRelease.downloadUrl ?? overrides.downloadUrl) === "string"
    ? (existingRelease.downloadUrl ?? overrides.downloadUrl)
    : DEV_UPDATE_MODAL_DEFAULTS.release.downloadUrl;

  return {
    ...overrides,
    updateAvailable: true,
    currentVersion,
    latestVersion,
    release: {
      ...existingRelease,
      size,
      downloadUrl,
    },
  };
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showVerificationGate, setShowVerificationGate] = useState(false);
  const [verificationChecking, setVerificationChecking] = useState(false);
  const [verificationError, setVerificationError] = useState("");

  const applyCurrentUserState = async () => {
    const res = await getCurrentUser();
    const currentUser = res?.data || res;
    const prefs = currentUser?.preferences;

    if (prefs) {
      if (prefs.theme) { localStorage.setItem("theme", prefs.theme); window.dispatchEvent(new Event("theme-sync")); }
      if (prefs.discordRpc != null) localStorage.setItem("discordRpc", String(prefs.discordRpc));
      if (prefs.mergeSessionEdits != null) localStorage.setItem("mergeSessionEdits", String(prefs.mergeSessionEdits));
      if (prefs.sortBy) localStorage.setItem("sortBy", prefs.sortBy);
      if (prefs.localFilesEnabled != null) localStorage.setItem("localFilesEnabled", JSON.stringify(prefs.localFilesEnabled));
      if (prefs.localFilesSources != null) localStorage.setItem("localFilesSources", JSON.stringify(prefs.localFilesSources));
      if (prefs.titlebarStyle) {
        localStorage.setItem("titlebarStyle", prefs.titlebarStyle);
        window.dispatchEvent(new Event("titlebar-style-sync"));
      }
    }

    if (!localStorage.getItem("titlebarStyle")) {
      localStorage.setItem("titlebarStyle", getDefaultTitlebarStyle());
      window.dispatchEvent(new Event("titlebar-style-sync"));
    }

    if (currentUser) {
      localStorage.setItem("user", JSON.stringify(currentUser));
      setUser(currentUser);
      setShowVerificationGate(currentUser?.isVerified === false);
    }

    return currentUser;
  };

  useEffect(() => {
    const applyAppHeight = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
    };

    applyAppHeight();
    window.addEventListener("resize", applyAppHeight);
    window.addEventListener("orientationchange", applyAppHeight);
    window.visualViewport?.addEventListener("resize", applyAppHeight);

    return () => {
      window.removeEventListener("resize", applyAppHeight);
      window.removeEventListener("orientationchange", applyAppHeight);
      window.visualViewport?.removeEventListener("resize", applyAppHeight);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      const storedRefresh = localStorage.getItem("refreshToken");
      const storedUser = localStorage.getItem("user");
      const storedAccess = localStorage.getItem("accessToken");

      if (!storedAccess || !storedUser || !storedRefresh) {
        localStorage.clear();
        setLoading(false);
        return;
      }

      let parsed;
      try { parsed = JSON.parse(storedUser); } catch { localStorage.clear(); setLoading(false); return; }

      let refreshOk = false;
      try {
        const res = await refreshAuth(storedRefresh);
        const newAccess = res?.data?.accessToken || res?.accessToken;
        const newRefresh = res?.data?.refreshToken || res?.refreshToken;
        if (newAccess) { localStorage.setItem("accessToken", newAccess); refreshOk = true; }
        if (newRefresh) localStorage.setItem("refreshToken", newRefresh);
      } catch {
        const loginId = localStorage.getItem("loginId");
        const loginPw = localStorage.getItem("loginPw");
        if (loginId && loginPw) {
          try {
            const data = await apiLogin(loginId, atob(loginPw));
            if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
            if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
            if (data.user) {
              parsed = data.user;
              localStorage.setItem("user", JSON.stringify(data.user));
            }
            refreshOk = true;
          } catch {
            localStorage.clear();
            setLoading(false);
            return;
          }
        }
      }

      try {
        const currentUser = await applyCurrentUserState();
        if (currentUser) parsed = currentUser;
      } catch {
        if (!localStorage.getItem("titlebarStyle")) {
          localStorage.setItem("titlebarStyle", getDefaultTitlebarStyle());
          window.dispatchEvent(new Event("titlebar-style-sync"));
        }
      }

      setUser(parsed);
      setShowVerificationGate(parsed?.isVerified === false);
      setLoading(false);

      checkForUpdate().then((res) => {
        if (res?.updateAvailable) {
          localStorage.setItem(LAST_UPDATE_INFO_KEY, JSON.stringify(res));
          emitUpdateStateChange();
          const skipped = localStorage.getItem(SKIPPED_UPDATE_VERSION_KEY);
          if (skipped !== res.latestVersion) setUpdateInfo(res);
        } else {
          localStorage.removeItem(LAST_UPDATE_INFO_KEY);
          localStorage.removeItem(SKIPPED_UPDATE_VERSION_KEY);
          emitUpdateStateChange();
        }
      }).catch(() => {});
    };

    init();
  }, []);

  useEffect(() => {
    const showUpdateModal = (overrides = {}) => {
      const normalized = normalizeUpdateInfo(overrides);
      localStorage.setItem(LAST_UPDATE_INFO_KEY, JSON.stringify(normalized));
      emitUpdateStateChange();
      setUpdateInfo(normalized);
    };

    const hideUpdateModal = () => setUpdateInfo(null);
    const clearSkippedUpdate = () => {
      localStorage.removeItem(SKIPPED_UPDATE_VERSION_KEY);
      emitUpdateStateChange();
    };

    window.showUpdateModal = showUpdateModal;
    window.hideUpdateModal = hideUpdateModal;
    window.clearSkippedUpdate = clearSkippedUpdate;

    return () => {
      delete window.showUpdateModal;
      delete window.hideUpdateModal;
      delete window.clearSkippedUpdate;
    };
  }, []);

  const handleAuth = (userData, tokens) => {
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setVerificationError("");
    setShowVerificationGate(userData?.isVerified === false);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.clear();
    setShowVerificationGate(false);
    setVerificationError("");
    setUser(null);
  };

  const handleVerificationContinue = async () => {
    setVerificationChecking(true);
    setVerificationError("");
    try {
      const currentUser = await applyCurrentUserState();
      if (currentUser?.isVerified) {
        setShowVerificationGate(false);
      } else {
        setVerificationError("Your email is still not verified. Verify your JuiceVault account email, then continue.");
      }
    } catch (error) {
      setVerificationError(typeof error === "string" ? error : error?.message || "Failed to check verification status");
    } finally {
      setVerificationChecking(false);
    }
  };

  if (loading) return null;

  return (
    <>
      <TitleBar />
      {updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onUpdate={() => {
            localStorage.removeItem(SKIPPED_UPDATE_VERSION_KEY);
            emitUpdateStateChange();
            setUpdateInfo(null);
          }}
          onSkip={() => {
            if (updateInfo?.latestVersion) {
              localStorage.setItem(SKIPPED_UPDATE_VERSION_KEY, updateInfo.latestVersion);
            }
            emitUpdateStateChange();
            setUpdateInfo(null);
          }}
        />
      )}
      <AnimatePresence>
        {user && showVerificationGate && (
          <EmailVerificationModal
            checking={verificationChecking}
            error={verificationError}
            onBack={handleLogout}
            onContinue={handleVerificationContinue}
            onSkip={() => {
              setVerificationError("");
              setShowVerificationGate(false);
            }}
          />
        )}
      </AnimatePresence>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" /> : <Login onAuth={handleAuth} />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/" /> : <Signup onAuth={handleAuth} />}
        />
        <Route
          path="/*"
          element={
            user ? (
              <LocalFilesProvider>
                <Dashboard user={user} onLogout={handleLogout} />
              </LocalFilesProvider>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </>
  );
}

function EmailVerificationModal({ checking, error, onBack, onContinue, onSkip }) {
  return (
    <motion.div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0d1016] shadow-[0_30px_90px_rgba(0,0,0,0.56)]"
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 18 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/28">Email Verification</p>
          <h2 className="mt-2 text-[22px] font-bold text-white">Verify your JuiceVault account</h2>
          <p className="mt-3 text-[13px] leading-6 text-white/45">
            In order for the app to work correctly, you need to verify the email on your JuiceVault account before continuing.
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-[22px] border border-white/[0.06] bg-white/[0.035] p-4">
            <p className="text-[13px] font-semibold text-white/82">Open your verification email, confirm your account, then press Continue.</p>
            <p className="mt-2 text-[12px] leading-5 text-white/38">
              If you just verified it, Continue will re-check your account status right away.
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={onBack}
              className="rounded-xl px-4 py-2 text-[13px] text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/65"
            >
              Go Back
            </button>
            <button
              onClick={onContinue}
              disabled={checking}
              className="rounded-xl border border-white/[0.1] bg-white/[0.08] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50"
            >
              {checking ? "Checking..." : "Continue"}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={onSkip}
              className="text-[11px] text-white/22 transition-colors hover:text-white/40"
            >
              Skip for now (not recommended)
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default App;
