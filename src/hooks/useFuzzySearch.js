import { useEffect, useState } from "react";
import { FUZZY_SEARCH_SYNC_EVENT, getFuzzySearchEnabled } from "@/lib/search";

export function useFuzzySearchEnabled() {
  const [enabled, setEnabled] = useState(getFuzzySearchEnabled);

  useEffect(() => {
    const sync = () => setEnabled(getFuzzySearchEnabled());
    window.addEventListener(FUZZY_SEARCH_SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FUZZY_SEARCH_SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}
