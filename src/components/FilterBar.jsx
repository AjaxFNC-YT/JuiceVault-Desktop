import { useState, useRef, useEffect } from "react";
import { ChevronDown, ArrowUpAZ, ArrowDownAZ, TrendingUp, Filter, Check, X, Loader2 } from "lucide-react";
import { useTheme, hexToRgb } from "@/stores/themeStore";

const SORT_OPTIONS = [
  { key: "a-z", label: "A–Z", icon: ArrowUpAZ },
  { key: "z-a", label: "Z–A", icon: ArrowDownAZ },
  { key: "most-played", label: "Most Played", icon: TrendingUp },
];

const ERA_ORDER = [
  { key: "JUTE", label: "JUICED UP THE EP" },
  { key: "AFF", label: "Affliction" },
  { key: "HIH 9 9 9", label: "Heartbroken In Hollywood 9 9 9" },
  { key: "JW 9 9 9", label: "JuiceWRLD 9 9 9" },
  { key: "BDM", label: "BINGEDRINKINGMUSIC" },
  { key: "ND </3", label: "NOTHING'S DIFFERENT" },
  { key: "GB&GR", label: "Goodbye & Good Riddance" },
  { key: "WOD", label: "World On Drugs" },
  { key: "DRFL", label: "Death Race For Love" },
  { key: "OUT", label: "Outsiders" },
  { key: "POST", label: "Posthumous" },
];

const ERA_LABEL_MAP = Object.fromEntries(ERA_ORDER.map((e) => [e.key, e.label]));

export const PREF_SORT_MAP = { popular: "most-played", az: "a-z", za: "z-a" };
export const SORT_PREF_MAP = { "most-played": "popular", "a-z": "az", "z-a": "za" };

export function getDefaultSort() {
  const stored = localStorage.getItem("sortBy");
  return PREF_SORT_MAP[stored] || "most-played";
}

function FilterBar({ eras, eraLoading, activeEras, onEraToggle, onClearEras, sortBy, onSortChange, hasOther }) {
  const { theme } = useTheme();
  const a1 = hexToRgb(theme.accent[1]);
  const [sortOpen, setSortOpen] = useState(false);
  const [eraOpen, setEraOpen] = useState(false);
  const sortRef = useRef(null);
  const eraRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (eraRef.current && !eraRef.current.contains(e.target)) setEraOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortBy)?.label || "Sort";
  const SortIcon = SORT_OPTIONS.find((o) => o.key === sortBy)?.icon || ArrowUpAZ;
  const hasActiveEras = activeEras && activeEras.size > 0;
  const activeCount = activeEras?.size || 0;

  const orderedEras = ERA_ORDER.filter((e) => eras?.has(e.key));
  const unknownEras = [...(eras || [])].filter((k) => !ERA_LABEL_MAP[k]).sort();

  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="relative flex-shrink-0" ref={eraRef}>
        <button
          onClick={() => setEraOpen(!eraOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          style={hasActiveEras ? { borderColor: `rgba(${a1}, 0.3)`, color: theme.accent[1] } : {}}
        >
          <Filter size={12} />
          {hasActiveEras ? `${activeCount} Era${activeCount > 1 ? "s" : ""}` : "Filter by Era"}
          {eraLoading && <Loader2 size={10} className="animate-spin ml-0.5" />}
          <ChevronDown size={10} className={`transition-transform ${eraOpen ? "rotate-180" : ""}`} />
        </button>

        {eraOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 w-72 max-h-[400px] rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ background: `linear-gradient(180deg, rgba(${a1}, 0.18) 0%, rgba(${a1}, 0.06) 100%), #111113`, border: `1px solid rgba(${a1}, 0.22)`, boxShadow: `0 25px 70px rgba(0,0,0,0.6), 0 0 50px rgba(${a1}, 0.1)` }}>
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid rgba(${a1}, 0.12)`, background: `rgba(${a1}, 0.06)` }}>
              <div className="flex items-center gap-2">
                <Filter size={13} style={{ color: theme.accent[1] }} />
                <span className="text-[12px] font-semibold text-white/70">Filter by Era</span>
              </div>
              {hasActiveEras && (
                <button
                  onClick={onClearEras}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-white/30 hover:text-white/50 transition-colors"
                  style={{ background: `rgba(${a1}, 0.08)` }}
                >
                  <X size={9} /> Clear
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {orderedEras.map((era) => {
                const active = activeEras?.has(era.key);
                return (
                  <button
                    key={era.key}
                    onClick={() => onEraToggle(era.key)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-[12px] transition-all ${
                      active ? "text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                    style={active ? { background: `rgba(${a1}, 0.12)`, color: theme.accent[1] } : {}}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                      active ? "" : "border border-white/[0.15]"
                    }`} style={active ? { background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`, boxShadow: `0 0 8px rgba(${a1}, 0.3)` } : {}}>
                      {active && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="truncate font-medium">{era.label}</span>
                      <span className={`text-[10px] ${active ? "opacity-50" : "text-white/20"}`}>{era.key}</span>
                    </div>
                    {active && <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: `linear-gradient(180deg, ${theme.accent[1]}, ${theme.accent[0]})` }} />}
                  </button>
                );
              })}
              {unknownEras.map((key) => {
                const active = activeEras?.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => onEraToggle(key)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-[12px] transition-all ${
                      active ? "text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                    style={active ? { background: `rgba(${a1}, 0.12)`, color: theme.accent[1] } : {}}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                      active ? "" : "border border-white/[0.15]"
                    }`} style={active ? { background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`, boxShadow: `0 0 8px rgba(${a1}, 0.3)` } : {}}>
                      {active && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className="truncate font-medium">{key}</span>
                    {active && <div className="w-1 h-5 rounded-full flex-shrink-0 ml-auto" style={{ background: `linear-gradient(180deg, ${theme.accent[1]}, ${theme.accent[0]})` }} />}
                  </button>
                );
              })}
              {hasOther && (
                <>
                  {(orderedEras.length > 0 || unknownEras.length > 0) && (
                    <div className="mx-3 my-1" style={{ borderTop: `1px solid rgba(${a1}, 0.1)` }} />
                  )}
                  <button
                    onClick={() => onEraToggle("__other__")}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-[12px] transition-all ${
                      activeEras?.has("__other__") ? "text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                    style={activeEras?.has("__other__") ? { background: `rgba(${a1}, 0.12)`, color: theme.accent[1] } : {}}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                      activeEras?.has("__other__") ? "" : "border border-white/[0.15]"
                    }`} style={activeEras?.has("__other__") ? { background: `linear-gradient(135deg, ${theme.accent[1]}, ${theme.accent[0]})`, boxShadow: `0 0 8px rgba(${a1}, 0.3)` } : {}}>
                      {activeEras?.has("__other__") && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="truncate font-medium">Other</span>
                      <span className={`text-[10px] ${activeEras?.has("__other__") ? "opacity-50" : "text-white/20"}`}>No era / untracked</span>
                    </div>
                    {activeEras?.has("__other__") && <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: `linear-gradient(180deg, ${theme.accent[1]}, ${theme.accent[0]})` }} />}
                  </button>
                </>
              )}
              {!eraLoading && orderedEras.length === 0 && unknownEras.length === 0 && !hasOther && (
                <p className="text-[11px] text-white/20 px-4 py-4 text-center">No era data available</p>
              )}
            </div>
          </div>
        )}
      </div>

      {hasActiveEras && (
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {[...activeEras].map((key) => (
            <span
              key={key}
              className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium"
              style={{ background: `rgba(${a1}, 0.12)`, color: theme.accent[1] }}
            >
              {key === "__other__" ? "Other" : (ERA_LABEL_MAP[key] || key)}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      <div className="relative flex-shrink-0" ref={sortRef}>
        <button
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          <SortIcon size={12} />
          {sortLabel}
          <ChevronDown size={10} className={`transition-transform ${sortOpen ? "rotate-180" : ""}`} />
        </button>

        {sortOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl shadow-2xl overflow-hidden" style={{ background: `linear-gradient(180deg, rgba(${a1}, 0.12) 0%, rgba(${a1}, 0.04) 100%), #131315`, border: `1px solid rgba(${a1}, 0.18)`, boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(${a1}, 0.06)` }}>
            {SORT_OPTIONS.map((opt) => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { onSortChange(opt.key); setSortOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-[12px] transition-colors ${
                    active ? "text-white font-medium" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                  style={active ? { background: `rgba(${a1}, 0.1)`, color: theme.accent[1] } : {}}
                >
                  <opt.icon size={13} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FilterBar;
