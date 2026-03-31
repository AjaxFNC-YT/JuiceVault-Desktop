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

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updateInfo, setUpdateInfo] = useState(null);

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
        const res = await getCurrentUser();
        const prefs = res?.data?.preferences || res?.preferences;
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
      } catch {}

      if (!localStorage.getItem("titlebarStyle")) {
        localStorage.setItem("titlebarStyle", getDefaultTitlebarStyle());
        window.dispatchEvent(new Event("titlebar-style-sync"));
      }

      setUser(parsed);
      setLoading(false);

      checkForUpdate().then((res) => {
        if (res?.updateAvailable) setUpdateInfo(res);
      }).catch(() => {});
    };

    init();
  }, []);

  const handleAuth = (userData, tokens) => {
    localStorage.setItem("accessToken", tokens.accessToken);
    localStorage.setItem("refreshToken", tokens.refreshToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
  };

  if (loading) return null;

  return (
    <>
      <TitleBar />
      {updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onUpdate={() => setUpdateInfo(null)}
          onSkip={() => setUpdateInfo(null)}
        />
      )}
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

export default App;
