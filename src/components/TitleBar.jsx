import { useState, useEffect, useRef } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { useTheme } from "@/stores/themeStore";
import { useIsMobile } from "@/hooks/useMobile";

const isTauri = !!window.__TAURI_INTERNALS__;

function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const appWindowRef = useRef(null);
  const { theme } = useTheme();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isTauri) return;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      appWindowRef.current = getCurrentWindow();
      appWindowRef.current.isMaximized().then(setMaximized);
    });
  }, []);

  const minimize = () => appWindowRef.current?.minimize();
  const toggleMaximize = async () => {
    await appWindowRef.current?.toggleMaximize();
    setMaximized(await appWindowRef.current?.isMaximized());
  };
  const close = () => appWindowRef.current?.close();

  if (!isTauri || isMobile) return null;

  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 z-[9999] flex h-9 select-none items-center justify-between"
      style={{ background: `${theme.bg}ee`, backdropFilter: "blur(12px)" }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-[1px]"
        style={{ background: `linear-gradient(to right, ${theme.accent[0]}, ${theme.accent[1]})`, opacity: 0.6 }}
      />

      <div data-tauri-drag-region className="flex items-center gap-3 pl-4">
        <img src="/jv-logo.png" alt="" className="h-[18px] w-[18px] rounded-[4px]" />
        <span
          data-tauri-drag-region
          className="text-[13px] font-bold uppercase tracking-widest text-white/90"
        >
          JuiceVault
        </span>
      </div>

      <div className="flex h-full">
        <button
          onClick={minimize}
          className="flex h-full w-12 items-center justify-center text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleMaximize}
          className="flex h-full w-12 items-center justify-center text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/80"
        >
          {maximized ? <Copy size={11} strokeWidth={1.5} /> : <Square size={11} strokeWidth={1.5} />}
        </button>
        <button
          onClick={close}
          className="flex h-full w-12 items-center justify-center text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
