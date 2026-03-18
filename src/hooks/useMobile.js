import { useState, useEffect } from "react";

const checkMobile = () => {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua) || /iPad|iPhone|iPod/.test(ua)) return true;
  }
  return window.innerWidth < 768;
};

export function useIsMobile() {
  const [mobile, setMobile] = useState(checkMobile);

  useEffect(() => {
    const handler = () => setMobile(checkMobile());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return mobile;
}
