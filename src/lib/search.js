export const FUZZY_SEARCH_STORAGE_KEY = "fuzzySearch";
export const FUZZY_SEARCH_SYNC_EVENT = "fuzzy-search-sync";
const FIELD_PRIORITY_WEIGHT = 100;

function normalizeValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularizeToken(token) {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

function buildSearchForms(value) {
  const normalized = normalizeValue(value);
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  const singularTokens = tokens.map(singularizeToken);
  const compact = normalized.replace(/\s+/g, "");
  const compactForms = Array.from(new Set([
    compact,
    tokens.join(""),
    singularTokens.join(""),
    singularizeToken(compact),
  ].filter(Boolean)));

  return {
    normalized,
    tokens: Array.from(new Set([...tokens, ...singularTokens])),
    compactForms,
  };
}

function getMaxDistance(term) {
  if (term.length >= 9) return 2;
  if (term.length >= 5) return 1;
  return 0;
}

function isWithinDistance(a, b, maxDistance) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxDistance) return false;

  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let current = [i];
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        prev[j] + 1,
        current[j - 1] + 1,
        prev[j - 1] + cost,
      );

      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) return false;
    for (let j = 0; j <= b.length; j += 1) prev[j] = current[j];
  }

  return prev[b.length] <= maxDistance;
}

function compactsMatch(fieldForms, queryForms) {
  return queryForms.compactForms.some((queryCompact) =>
    fieldForms.compactForms.some((fieldCompact) =>
      fieldCompact === queryCompact || fieldCompact.includes(queryCompact),
    ),
  );
}

function tokensMatch(fieldForms, queryForms) {
  return queryForms.tokens.every((queryToken) =>
    fieldForms.tokens.some((fieldToken) =>
      fieldToken === queryToken || fieldToken.includes(queryToken),
    ),
  );
}

function fuzzyTokensMatch(fieldForms, queryForms) {
  let penalty = 0;

  for (const queryToken of queryForms.tokens) {
    const directMatch = fieldForms.tokens.some((fieldToken) =>
      fieldToken === queryToken || fieldToken.includes(queryToken),
    );

    if (directMatch) continue;

    if (queryToken.length < 4) return null;

    const maxDistance = getMaxDistance(queryToken);
    if (!maxDistance) return null;

    const fuzzyMatch = fieldForms.tokens.some((fieldToken) =>
      fieldToken[0] === queryToken[0]
      && Math.abs(fieldToken.length - queryToken.length) <= maxDistance
      && isWithinDistance(fieldToken, queryToken, maxDistance),
    );
    if (!fuzzyMatch) return null;
    penalty += 1;
  }

  return penalty;
}

export function getFuzzySearchEnabled() {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(FUZZY_SEARCH_STORAGE_KEY);
  if (stored == null) {
    localStorage.setItem(FUZZY_SEARCH_STORAGE_KEY, "true");
    return true;
  }
  return stored !== "false";
}

export function setFuzzySearchEnabled(enabled) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FUZZY_SEARCH_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new Event(FUZZY_SEARCH_SYNC_EVENT));
}

function normalizeFieldEntry(entry) {
  if (entry == null) return null;

  if (typeof entry === "string" || typeof entry === "number") {
    return { value: entry, mode: "fuzzy", priority: 10 };
  }

  if (typeof entry === "object" && "value" in entry) {
    return {
      value: entry.value,
      mode: entry.mode || "exact",
      priority: entry.priority ?? 10,
    };
  }

  return null;
}

function getMatchRank(fieldForms, queryForms, fuzzyAllowed) {
  if (
    fieldForms.normalized === queryForms.normalized
    || (compactsMatch(fieldForms, queryForms) && queryForms.compactForms.some((compact) => fieldForms.compactForms.includes(compact)))
  ) {
    return 0;
  }

  const startsWithNormalized = fieldForms.normalized.startsWith(queryForms.normalized);
  const startsWithCompact = queryForms.compactForms.some((queryCompact) =>
    fieldForms.compactForms.some((fieldCompact) => fieldCompact.startsWith(queryCompact)),
  );
  if (startsWithNormalized || startsWithCompact) {
    return 1;
  }

  if (fieldForms.normalized.includes(queryForms.normalized) || compactsMatch(fieldForms, queryForms)) {
    return 2;
  }

  if (tokensMatch(fieldForms, queryForms)) {
    return 3;
  }

  if (fuzzyAllowed) {
    const fuzzyPenalty = fuzzyTokensMatch(fieldForms, queryForms);
    if (fuzzyPenalty != null) return 10 + fuzzyPenalty;
  }

  return null;
}

export function getSearchScore(values, query, { fuzzy = getFuzzySearchEnabled() } = {}) {
  const queryForms = buildSearchForms(query);
  if (!queryForms.normalized) return 0;

  let best = null;
  for (const rawEntry of values) {
    const entry = normalizeFieldEntry(rawEntry);
    if (!entry) continue;

    const fieldForms = buildSearchForms(entry.value);
    if (!fieldForms.normalized) continue;

    const fuzzyAllowed = fuzzy && entry.mode === "fuzzy";
    const rank = getMatchRank(fieldForms, queryForms, fuzzyAllowed);
    if (rank == null) continue;

    const score = (entry.priority * FIELD_PRIORITY_WEIGHT) + rank;
    if (score != null && (best == null || score < best)) best = score;
  }

  return best;
}

export function matchesSearch(values, query, options) {
  return getSearchScore(values, query, options) != null;
}

export function searchCollection(items, query, getValues, options) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return items;

  return items
    .map((item, index) => ({
      item,
      index,
      score: getSearchScore(getValues(item), trimmed, options),
    }))
    .filter((entry) => entry.score != null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}
