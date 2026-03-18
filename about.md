# JuiceVault Desktop — Full Technical Documentation

**Version:** 1.1.0  
**Identifier:** `com.juicevault.app`  
**Category:** Music  
**Stack:** Tauri 2 (Rust) + React + Vite + Tailwind CSS

JuiceVault Desktop is a native desktop music application built with Tauri. It connects to the JuiceVault API (`https://api.juicevault.xyz`) to stream, browse, manage, and discover music. It supports server-hosted songs, local audio files, live radio, media browsing, playlists, Discord Rich Presence, a built-in equalizer with crossfade, and a dynamic theming system.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Build System & Configuration](#build-system--configuration)
3. [Frontend — React Application](#frontend--react-application)
   - [Entry Point & Providers](#entry-point--providers)
   - [Authentication Flow](#authentication-flow)
   - [Routing & Layout](#routing--layout)
   - [Pages](#pages)
   - [Components](#components)
   - [Stores (Global State)](#stores-global-state)
   - [Hooks](#hooks)
   - [Utilities](#utilities)
   - [Styling & Theming](#styling--theming)
4. [Backend — Rust / Tauri](#backend--rust--tauri)
   - [Application Entry](#application-entry)
   - [Command Modules](#command-modules)
   - [Services](#services)
   - [Models](#models)
   - [Utilities](#backend-utilities)
5. [API Communication](#api-communication)
6. [Audio Engine](#audio-engine)
7. [Discord Rich Presence](#discord-rich-presence)
8. [Local Files System](#local-files-system)
9. [Update System](#update-system)
10. [File Reference](#file-reference)

---

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│              Tauri Window (Chromium)          │
│  ┌─────────────────────────────────────────┐ │
│  │         React Frontend (Vite)           │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐ │ │
│  │  │  Pages   │ │Components│ │ Stores  │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬────┘ │ │
│  │       │             │            │       │ │
│  │       └──────┬──────┘────────────┘       │ │
│  │              │ invoke()                  │ │
│  └──────────────┼───────────────────────────┘ │
│                 │                              │
│  ┌──────────────▼───────────────────────────┐ │
│  │        Rust Backend (Tauri Commands)     │ │
│  │  ┌──────┐ ┌────────┐ ┌───────────────┐  │ │
│  │  │ API  │ │Discord │ │  Local Files  │  │ │
│  │  │Client│ │  RPC   │ │  Scanner      │  │ │
│  │  └──────┘ └────────┘ └───────────────┘  │ │
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

The frontend communicates with the Rust backend exclusively through Tauri's `invoke()` IPC mechanism. The Rust backend handles all network requests to the JuiceVault API, Discord IPC, local file scanning with metadata extraction, and file downloads. Audio playback itself happens in the browser via the Web Audio API.

---

## Build System & Configuration

### `package.json`

Defines the frontend project. Key dependencies:

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing (login/signup) |
| `framer-motion` | Animations (page transitions, modals) |
| `lucide-react` | Icon library |
| `clsx` / `tailwind-merge` | Conditional CSS class utilities |
| `@tauri-apps/api` | Tauri IPC bridge |
| `@tauri-apps/plugin-shell` | Open external URLs |

Scripts:
- `npm run dev` — Starts Vite dev server on port 1420
- `npm run build` — Production build to `dist/`
- `npm run tauri dev` — Launches Tauri in development mode
- `npm run tauri build` — Creates distributable installer

### `vite.config.js`

- Uses `@vitejs/plugin-react` for JSX/Fast Refresh
- Path alias: `@` → `./src`
- Dev server on port 1420 with strict port
- Ignores `src-tauri` directory in watcher

### `tailwind.config.js`

Extends the default Tailwind theme with:
- **Fonts:** `Plus Jakarta Sans` as primary sans-serif
- **Colors:**
  - `brand-red` (#E53E3E) — Primary brand color
  - `brand-purple` (#9333EA) — Secondary brand / gradient end
  - `brand-purple-light` (#A855F7) — Links and highlights
  - `surface-800` (#141414) — Modal/card backgrounds
  - `surface-900` (#0a0a0a) — Deep backgrounds

### `postcss.config.js`

Enables Tailwind CSS and Autoprefixer PostCSS plugins.

### `index.html`

Entry HTML file. Loads the `Plus Jakarta Sans` font from Google Fonts, sets viewport meta tags, and mounts `src/main.jsx` as the JS entry point.

### `src-tauri/Cargo.toml`

Rust dependencies:

| Crate | Purpose |
|-------|---------|
| `tauri` 2 | Desktop framework with `protocol-asset` |
| `tauri-plugin-shell` | Open URLs in browser |
| `tauri-plugin-dialog` | Native save-file dialog |
| `reqwest` 0.12 | HTTP client (JSON + multipart) |
| `tokio` | Async runtime |
| `discord-rich-presence` 0.2 | Discord IPC |
| `sha2` 0.10 | File hashing (SHA-256) |
| `lofty` 0.21 | Audio metadata reading (ID3, etc.) |
| `walkdir` 2 | Recursive directory traversal |
| `image` 0.25 | Cover art thumbnail generation (JPEG/PNG → WebP) |
| `rayon` 1 | Parallel file processing |

### `src-tauri/tauri.conf.json`

- **Window:** 1280×800, min 900×600, custom decorations disabled (custom title bar)
- **Security:** CSP null, asset protocol enabled with global scope
- **Bundle:** NSIS installer for Windows, DMG for macOS, DEB for Linux
- **Build:** Frontend dist at `../dist`, dev URL `http://localhost:1420`

---

## Frontend — React Application

### Entry Point & Providers

**`src/main.jsx`** — Mounts the app into `#root`:

```
React.StrictMode
  └─ BrowserRouter
       └─ ThemeProvider      (global theme context)
            └─ PlayerProvider (global audio state)
                 └─ App
```

**`src/index.css`** — Global styles:
- Imports Tailwind `@tailwind base/components/utilities`
- Sets `Plus Jakarta Sans` as default font
- Dark background (`#0a0a0a`)
- Custom scrollbar styles (thin, dark)
- Theme-aware text selection color

### Authentication Flow

**`src/App.jsx`** manages the entire auth lifecycle:

1. On mount, checks `localStorage` for stored credentials (`loginId`, `loginPw`)
2. If found, auto-logs in via `apiLogin()`
3. On success, stores `accessToken` and `refreshToken` in state
4. Fetches user preferences (theme, Discord RPC, local files config, sort preference) from the API
5. Applies preferences: sets theme, enables Discord RPC, configures local files store
6. Checks for app updates via `checkForUpdate()`
7. Renders `Login`/`Signup` pages via `react-router-dom` when unauthenticated
8. Renders `TitleBar` + `Dashboard` (wrapped in `LocalFilesProvider`) when authenticated

Token refresh is handled transparently by `authedInvoke()` in `src/lib/api.js` — if a request fails with an auth error, it automatically refreshes the access token using the stored refresh token.

### Routing & Layout

The app uses two routing layers:

1. **React Router** (`BrowserRouter`) — Handles `/login` and `/signup` routes
2. **Internal navigation** — `Dashboard` manages page state via `activePage` string, not URL-based routing

**`src/pages/Dashboard.jsx`** is the main shell after login:
- **Left:** `Sidebar` (240px fixed width)
- **Center:** Active page content with `AnimatePresence` fade transitions
- **Bottom:** `PlayBar` (76px fixed)
- **Overlay layers:** Modals (`CreatePlaylist`, `SongInfo`, `AddToPlaylist`, `Settings`, `PlayerPreferences`, `FullscreenPlayer`)

The `Overview` page is always mounted (kept alive), while other pages mount/unmount with animated transitions.

### Pages

#### `Overview.jsx`
The home/dashboard page. Displays:
- Greeting with user's display name
- **Stat cards:** Total plays, time listened, listening streak (current/best)
- **Archive completion:** Progress bar showing unique songs heard vs. total archive
- **Quick stats:** Average daily plays, unique songs, peak listening hour, longest streak
- **Most played:** Top 10 songs in a 2-column grid with play counts and cover art

Data is fetched from three endpoints in parallel: `/user/history/stats`, `/user/history/activity`, and `/stats`. Includes a retry mechanism (up to 5 retries at 2-second intervals) if data isn't available immediately.

#### `Browse.jsx`
The main song browsing page:
- Loads all songs from `/music/list` on mount
- Debounced search (300ms) against API + client-side alt_name matching
- **FilterBar** with era filter and sort (A-Z, Z-A, Most Played)
- **Session Edits** subfolder — songs flagged as `is_session_edit` are separated into their own navigable section (unless `mergeSessionEdits` is enabled in localStorage)
- **SongList** component with virtualized list/card views
- Era data fetched concurrently via `fetchSongEras()` for all loaded songs

#### `Songs.jsx` (Liked Songs)
- Fetches liked songs from `/user/likes` with pagination
- Cross-references local files by `file_hash` to show local file data for liked local songs
- Same FilterBar and search functionality as Browse
- Uses `SongList` with `likedIds` set for visual indicators

#### `Radio.jsx`
Live radio page — everyone hears the same stream:
- Polls `/radio/now-playing` and `/radio/schedule` every 10 seconds
- Shows current track, next up, upcoming schedule (up to 20 songs)
- Join/Leave radio toggle (integrates with PlayerStore's `playRadio`/`stopRadio`)
- Vote-to-skip functionality with vote count display
- Listener count display
- Stream info: song count in rotation, 128 kbps bitrate

#### `RecentlyAdded.jsx`
- Fetches all songs, sorts by MongoDB ObjectID timestamp (newest first)
- Shows the 100 most recently added songs
- Falls back to reverse array order if IDs aren't ObjectIDs

#### `Media.jsx`
Media library for videos and images:
- Fetches all media from `/media/list`
- Type filter tabs: All / Videos / Images
- Search by title/filename
- **List view:** Virtualized rows (52px height, 20-row overscan)
- **Card view:** Responsive grid with infinite scroll (40-item batches)
- Opens `MediaViewer` overlay for playback/viewing

#### `LocalFiles.jsx`
- Shows indexed local audio files from configured source folders
- Search by title, artist, album, or filename
- Rescan button triggers `scanAllSources()`
- Displays disabled/no-sources states when unconfigured

#### `PlaylistView.jsx`
Individual playlist page:
- Displays playlist cover (uploaded or auto-generated 2x2 grid from last 4 songs)
- Inline editing of playlist name/description
- Cover upload/remove
- Play All / Shuffle buttons
- FilterBar + search within playlist
- Per-song remove button
- Delete playlist with confirmation modal

### Components

#### `TitleBar.jsx`
Custom window title bar (replaces native decorations):
- Draggable region with `data-tauri-drag-region`
- JuiceVault logo and branding
- Minimize / Maximize-Restore / Close buttons
- Theme-accent gradient line along the bottom edge
- Semi-transparent background with backdrop blur
- Only renders in Tauri environment (`window.__TAURI_INTERNALS__`)

#### `Sidebar.jsx`
Left navigation panel (240px):
- **JuiceVault section:** Overview, Browse, Radio
- **Library section:** Liked Songs, Media, Local Files
- **Playlists section:** Create New button + dynamic playlist list from API
- **User section:** Avatar (or gradient initial), display name, Settings and Logout buttons
- Active state highlighting with subtle background
- Framer Motion hover/tap micro-animations

#### `Background.jsx`
Full-screen background layer:
- Renders the current theme's background color and gradient layers
- Fixed positioning, non-interactive (`pointer-events-none`)
- Smooth 500ms color transitions when theme changes

#### `PlayBar.jsx`
Bottom playbar (76px):
- **Left (220px):** Cover art thumbnail (clickable to fullscreen), track title, artist, radio live badge
- **Center:** Playback controls — Shuffle, Previous, Play/Pause, Next, Repeat (off/all/one)
  - Radio mode: simplified controls (play/pause + vote skip)
- **Seek bar:** Draggable progress slider with theme gradient fill
  - Radio mode: non-interactive, linear 1s transition
- **Right (240px):** Song info, download/open-in-explorer, add to playlist, player preferences, fullscreen, volume slider
- Theme-accented background with backdrop blur and gradient border

Custom `useDragSlider` hook handles mouse drag for both seek and volume sliders.

#### `FullscreenPlayer.jsx`
Immersive fullscreen player overlay:
- **Canvas-based visualizer:** Renders audio frequency data as bars using Web Audio API's `AnalyserNode`
- Background: blurred, low-opacity cover art drawn to canvas
- Waveform toggle (on/off)
- Large cover art (400px max, responsive)
- Full playback controls at bottom with seek bar
- Song info, download, player preferences buttons
- Keyboard shortcut: Escape to close
- Radio mode supported with live badge and listener count

#### `SongList.jsx`
Virtualized song display with two view modes:
- **List view:** Absolute-positioned rows (52px each) with scroll-based virtualization. Only visible rows + 20 overscan rows are rendered.
- **Card view:** Responsive grid (2-6 columns) with progressive loading (60-item batches on scroll)
- Each song shows: rank number (hover → play icon), cover art, title, artist, duration, file size
- Context menu via `SongContextMenu`

#### `SongContextMenu.jsx`
Three-dot context menu for songs:
- **Song Info** — Opens `SongInfoModal` (server songs only)
- **Like / Unlike** — Toggles like status with local song metadata support
- **Add to Playlist** — Opens `AddToPlaylistModal`
- **Download / Open in Explorer** — Downloads server songs or reveals local files

#### `FilterBar.jsx`
Reusable filter/sort toolbar:
- **Era filter dropdown:** Themed gradient panel with predefined era ordering (JUTE, Affliction, HIH 999, JW 999, BDM, ND </3, GB&GR, WOD, DRFL, Outsiders, Posthumous), plus dynamic unknown eras and "Other" category. Gradient checkboxes, active indicator bars.
- **Sort dropdown:** A-Z, Z-A, Most Played with themed active states
- **Active era chips:** Horizontal scrollable list of active filters
- Sort preference persisted to `localStorage` and synced with API

#### `SettingsModal.jsx`
Application settings overlay:
- **Theme picker:** Grid of available themes with color previews. Active theme shown with accent-colored checkmark.
- **Discord RPC toggle**
- **Session Edits merge toggle** — Merge session edits into main browse or separate them
- **Local Files section:** Enable/disable, add/remove source folders (native folder picker via Tauri dialog), file count display
- Theme-tinted gradient background

#### `PlayerPreferencesModal.jsx`
Audio preferences overlay:
- **Equalizer:** Vertical sliders for Bass, Mid, Treble, Gain (range -12 to +12 dB)
- **Reverb toggle** with on/off state
- **Crossfade duration** input (0-12 seconds)
- All values persist to API via user preferences
- Theme-tinted gradient background

#### `CreatePlaylistModal.jsx`
- Name and description inputs
- Public/private toggle
- Submit creates playlist via API and refreshes sidebar

#### `AddToPlaylistModal.jsx`
- Search bar to filter user's playlists
- Like/Unlike toggle for the song
- Checkbox list of playlists with add/remove functionality
- Theme-tinted gradient background

#### `SongInfoModal.jsx`
Detailed song information display:
- Cover art, title, artist, file info
- **Tracker info:** Displays raw key-value pairs from `/music/tracker/info/{id}` (era, producer, date, etc.)
- Download button
- Loading spinner while fetching
- Theme-tinted gradient background

#### `UpdateModal.jsx`
App update notification:
- Current version → latest version comparison
- Release notes display
- File size info
- "Update Now" button opens download URL in browser via `@tauri-apps/plugin-shell`
- Skip button to dismiss

#### `MediaViewer.jsx`
Full-featured media viewer:
- **Images:** Modal overlay with full-resolution display, download button
- **Videos:** Full-screen video player with:
  - Custom controls (play/pause, seek, volume, fullscreen, playback speed)
  - Buffering indicator
  - Keyboard shortcuts (Space, Arrow keys, J/L, M, F)
  - Seek bar with hover timestamp preview
  - Auto-hiding controls after 3 seconds of inactivity
  - Double-click to fullscreen, single-click to toggle play
- **Unknown types:** Download prompt
- Logs media view to API on open

### Stores (Global State)

#### `playerStore.jsx` — PlayerProvider

Central audio engine and playback state manager using `useReducer`:

**State shape:**
```
{
  currentTrack    // { id, title, artist, cover, local?, path?, file_hash? }
  isPlaying       // boolean
  volume          // 0-1
  progress        // seconds
  duration        // seconds
  queue           // array of tracks
  queueIndex      // current position in queue
  shuffle         // boolean
  repeat          // "off" | "all" | "one"
  isRadio         // boolean
  radioData       // { listeners, ... }
  isSeeking       // boolean
}
```

**Audio graph (Web Audio API):**
```
HTMLAudioElement → MediaElementSource → BiquadFilter (bass)
  → BiquadFilter (mid) → BiquadFilter (treble) → GainNode
  → ConvolverNode (reverb, optional) → GainNode (wet/dry)
  → AnalyserNode → AudioContext.destination
```

**Key features:**
- EQ: Three-band biquad filters (lowshelf 200Hz, peaking 1kHz, highshelf 4kHz) + gain node
- Reverb: ConvolverNode with generated impulse response
- Crossfade: Two audio elements with volume ramps for gapless transitions
- Listen logging: Sends play data to API after 30 seconds or song completion
- Radio mode: Connects to HLS stream at `/radio/stream`, polls for now-playing data
- Shuffle: Fisher-Yates shuffle of queue, preserves original order for unshuffle
- Repeat: off → all (loop queue) → one (loop single track)
- Preferences persistence: EQ, crossfade, shuffle, repeat saved to API

#### `themeStore.jsx` — ThemeProvider

Manages visual themes via React Context:

**Available themes:**
| ID | Name | Background | Accents |
|----|------|-----------|---------|
| midnight | Midnight | #0a0a0f | #6366F1, #818CF8 |
| ember | Ember | #0f0a0a | #EF4444, #F97316 |
| aurora | Aurora | #0a0f0a | #10B981, #34D399 |
| violet | Violet | #0d0a12 | #8B5CF6, #A78BFA |
| ocean | Ocean | #0a0d10 | #0EA5E9, #38BDF8 |
| rose | Rose | #100a0c | #F43F5E, #FB7185 |
| sunset | Sunset | #100c0a | #F59E0B, #FBBF24 |
| frost | Frost | #0a0d10 | #06B6D4, #67E8F9 |

Each theme defines: `bg` (background), `gradients` (CSS gradient layers), `preview` (3 colors for theme picker), `accent` (2 hex colors for UI accents).

**`hexToRgb(hex)`** utility converts hex colors to `"r,g,b"` strings for use in `rgba()`.

Theme is stored in `localStorage` as `themeId` and synced to user preferences API. A custom `theme-sync` event allows cross-component updates.

#### `localFilesStore.jsx` — LocalFilesProvider

Manages local music file indexing via `useReducer`:

**State shape:**
```
{
  enabled     // boolean — is local files feature on
  sources     // string[] — directory paths to scan
  files       // LocalFileInfo[] — indexed audio files
  scanning    // boolean
  scanProgress // string — progress text
}
```

**Flow:**
1. User adds source folders via Settings (Tauri folder dialog)
2. `scanAllSources()` invokes Rust `scan_local_directory` for each source
3. Rust walks directories, finds audio files (.mp3, .wav, .ogg, .flac, .m4a, .aac, .wma, .opus, .aiff)
4. Processes files in parallel via Rayon — hashing, metadata extraction, cover art thumbnailing
5. Sends batches of 50 files back to frontend via Tauri events (`local-files-batch`)
6. Frontend accumulates results, deduplicates by hash
7. Scan completion signaled via `local-scan-complete` event

State persisted to `localStorage` (`localFiles_enabled`, `localFiles_sources`, `localFiles_indexed`) and synced to API preferences.

### Hooks

#### `useDiscordRPC.jsx`

Manages Discord Rich Presence integration:

- **Connection lifecycle:** Initializes/disconnects Discord IPC based on `enabled` prop
- **Presence updates:** Reacts to player state changes (playing, paused, radio, idle)
- **Page presence:** Shows contextual status for Browse, Liked Songs, Radio, Media, Playlists
- **Local cover art:** For local files, uploads cover art to Litterbox (temporary file host) and caches URLs for Discord display
- **Deduplication:** Tracks last update key to avoid redundant IPC calls

#### `useLocalStorage.js`

Generic hook for `localStorage`-backed state. Reads on init (with JSON parse), writes on change.

### Utilities

#### `src/lib/api.js`

Frontend API client — the bridge between React components and Tauri commands:

- **`invoke()`** wrapper around `@tauri-apps/api/core` for calling Rust commands
- **`authedInvoke()`** — Automatically injects `access_token`, handles token refresh on 401/auth errors by calling `refresh_auth` and retrying once
- **Token management:** `setTokens()`, `getAccessToken()`, `getRefreshToken()` with in-memory + localStorage storage

Exported functions by category:

| Category | Functions |
|----------|-----------|
| Auth | `login`, `register`, `refreshAuth` |
| Songs | `getAllSongs`, `searchSongs`, `getSongMetadata`, `getTrackerInfo`, `likeSong`, `unlikeSong`, `getLikedSongs`, `logListen` |
| Playlists | `getMyPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`, `addSongsToPlaylist`, `removeSongFromPlaylist`, `uploadPlaylistCover`, `removePlaylistCover` |
| Media | `getAllMedia`, `getMediaMetadata`, `logMediaView` |
| Radio | `getRadioNowPlaying`, `getRadioSchedule`, `getRadioListeners`, `voteSkipRadio` |
| Stats | `getListeningStats`, `getListeningActivity`, `getArchiveStats` |
| Profile | `getCurrentUser`, `updateUserPreferences` |
| Local | `scanLocalDirectory`, `hashSingleFile`, `showInExplorer` |
| Discord | `initDiscordRpc`, `updateDiscordPresence`, `clearDiscordPresence`, `disconnectDiscordRpc`, `uploadCoverTemp` |
| Download | `downloadFile` |
| Eras | `fetchSongEras` |
| Update | `getAppVersion`, `checkForUpdate` |

#### `src/lib/utils.js`

- **`cn(...classes)`** — Merges Tailwind classes using `clsx` + `tailwind-merge`
- **`formatTime(seconds)`** — Converts seconds to `m:ss` format
- **`truncate(str, len)`** — Truncates string with `…` ellipsis

### Styling & Theming

The UI uses a combination of:

1. **Tailwind CSS** — Utility classes for layout, spacing, typography, opacity
2. **Inline styles** — Dynamic theme colors injected via `style={{}}` using `hexToRgb()` for RGBA values
3. **Framer Motion** — Animations for page transitions, modal enter/exit, hover/tap micro-interactions

**Theme integration pattern** used across all modals and dropdowns:
```jsx
style={{
  background: `linear-gradient(180deg, rgba(${accentRgb}, 0.15) 0%, rgba(${accentRgb}, 0.05) 100%), #111113`,
  border: `1px solid rgba(${accentRgb}, 0.18)`,
  boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(${accentRgb}, 0.08)`
}}
```

This gives every modal/dropdown a subtle color wash from the active theme while maintaining readability.

---

## Backend — Rust / Tauri

### Application Entry

**`src-tauri/src/main.rs`** — Entry point. Sets `windows_subsystem = "windows"` (hides console on Windows), calls `lib::run()`.

**`src-tauri/src/lib.rs`** — Configures Tauri:
- Registers plugins: `tauri-plugin-shell`, `tauri-plugin-dialog`
- Initializes managed state: `DiscordRpcState`, `EraCache`, `CoverUploadCache`
- Registers all 35+ command handlers

### Command Modules

All commands live under `src-tauri/src/commands/`:

#### `auth.rs`
- **`login`** — Delegates to `ApiClient::login()` (fetches login token first, then authenticates)
- **`register`** — Delegates to `ApiClient::register()` with optional display name
- **`refresh_auth`** — Refreshes access/refresh token pair

#### `songs.rs`
- **`get_all_songs`** — Public GET `/music/list`
- **`search_songs`** — URL-encodes query, public GET `/music/search`
- **`get_song_metadata`** — Public GET `/music/{id}/metadata`
- **`like_song`** / **`unlike_song`** — Authed POST/DELETE `/user/likes/{id}`, with optional local file metadata
- **`get_liked_songs`** — Paginated authed GET, fetches all pages (200 per page) and merges
- **`get_tracker_info`** — Public GET `/music/tracker/info/{id}`
- **`log_listen`** — Authed POST `/user/history` with songId, duration, completed, source

#### `playlists.rs`
- Full CRUD: `get_playlist`, `create_playlist`, `update_playlist`, `delete_playlist`
- Song management: `add_songs_to_playlist`, `remove_song_from_playlist`
- Cover management: `upload_playlist_cover` (multipart form upload), `remove_playlist_cover`

#### `playlist.rs`
- **`get_my_playlists`** — Authed GET `/user/playlists` (returns owned + collaborated)

#### `media.rs`
- **`get_all_media`** — Public GET `/media/list`
- **`get_media_metadata`** — Public GET `/media/{id}/metadata`
- **`log_media_view`** — Public POST `/media/{id}/view`

#### `radio.rs`
- **`get_radio_now_playing`** — Public GET `/radio/now-playing`
- **`get_radio_schedule`** — Public GET `/radio/schedule?count={n}` (max 50)
- **`get_radio_listeners`** — Public GET `/radio/listeners`
- **`vote_skip_radio`** — Authed POST `/radio/skip`

#### `stats.rs`
- **`get_listening_stats`** — Authed GET `/user/history/stats`
- **`get_listening_activity`** — Authed GET `/user/history/activity?days=90`
- **`get_archive_stats`** — Public GET `/stats`

#### `profile.rs`
- **`get_current_user`** — Authed GET `/user/auth/me`
- **`update_user_preferences`** — Authed PUT `/user/profile` with preferences JSON

#### `player.rs`
- **`get_track_info`** — Authed GET `/songs/{id}`

#### `discord.rs`
Discord Rich Presence via IPC (Application ID: `1482928492344508507`):
- **`DiscordRpcState`** — Mutex-guarded `Option<DiscordIpcClient>` managed by Tauri
- **`init_discord_rpc`** — Creates client and connects. No-op if already connected.
- **`update_discord_presence`** — Sets activity with details, state, assets (large/small image + text), timestamps, activity type (Playing/Listening/Watching), and buttons (Website + Download links)
- **`clear_discord_presence`** — Clears current activity
- **`disconnect_discord_rpc`** — Closes IPC connection

#### `local_files.rs`
Local audio file scanner:
- **Supported formats:** mp3, wav, ogg, flac, m4a, aac, wma, opus, aiff
- **`scan_local_directory`:**
  1. Walks directory recursively via `walkdir` (follows symlinks)
  2. Filters by audio file extensions
  3. Skips files with known hashes (incremental scan)
  4. Processes files in parallel via `rayon::par_iter()`
  5. For each file: computes SHA-256 hash (first 16KB + file size), reads metadata via `lofty`, extracts cover art
  6. Cover art thumbnailed to 200×200 WebP, cached in `temp/juicevault_covers/`
  7. Emits `local-files-batch` events (batches of 50) and final `local-scan-complete`
- **`hash_single_file`** — Hashes and reads metadata for a single file
- **`show_in_explorer`** — Opens native file explorer highlighting the file (Windows: `explorer /select,`, macOS: `open -R`, Linux: `xdg-open` on parent dir)

#### `eras.rs`
Song era classification with caching:
- **`EraCache`** — In-memory `HashMap<String, String>` cached era data
- **`fetch_song_eras`:**
  1. Checks cache for each song ID
  2. Fetches missing eras from `/music/tracker/info/{id}` concurrently (30 max concurrent)
  3. Parses "era" field (case-insensitive, ignores dashes/underscores/spaces)
  4. Caches results for future calls

#### `cover_upload.rs`
Temporary cover art hosting for Discord RPC local file covers:
- **`CoverUploadCache`** — In-memory URL cache keyed by file hash
- **`upload_cover_temp`:**
  1. Checks URL cache first
  2. Reads WebP cover from local cache directory
  3. Uploads to Litterbox (`litterbox.catbox.moe`) as 72-hour temporary file
  4. Caches returned URL

#### `download.rs`
File download with native save dialog:
- Opens Tauri's file dialog for save location
- Downloads from API URL
- Writes bytes to selected path
- Returns "cancelled" if user dismisses dialog

#### `updater.rs`
Version checking:
- **`get_app_version`** — Returns `CARGO_PKG_VERSION` (compile-time)
- **`check_for_update`:**
  1. Fetches `/misc/desktop/versions?channel=stable`
  2. Extracts platform-specific (windows/mac/linux) latest version
  3. Compares semantic versions
  4. Returns update info including download URL and release notes

### Services

#### `src-tauri/src/services/api.rs` — ApiClient

Central HTTP client for all API communication:

- Base URL: `https://api.juicevault.xyz`
- **Authentication flow:**
  1. `get_login_token()` — POST `/user/auth/token` to get a short-lived login token
  2. Extracts `ca` (client attestation) from JWT payload via manual base64 decode
  3. Sends `X-CA` header on authenticated requests
- **Methods:** `public_get`, `public_post`, `authed_get`, `authed_post`, `authed_put`, `authed_delete`
- **Error handling:** Parses API error responses, extracts `error` or `message` fields
- **Token refresh:** `refresh_tokens()` via POST `/user/auth/refresh`
- Custom `base64_decode` implementation (no external dependency)

### Models

#### `src-tauri/src/models/user.rs`

```rust
ApiResponse<T>  { success: bool, data: Option<T>, error: Option<String> }
AuthData        { access_token, refresh_token, user: Value }
TokenData       { token, expires_in }
RefreshData     { access_token, refresh_token }
```

### Backend Utilities

#### `src-tauri/src/utils/config.rs`

- **`app_data_dir()`** — Returns platform-specific app data path (`%APPDATA%/juicevault` on Windows, `~/.juicevault` elsewhere)
- **`ensure_app_dirs()`** — Creates the directory if it doesn't exist

---

## API Communication

All API calls flow through this chain:

```
React Component
  → src/lib/api.js (authedInvoke / invoke)
    → Tauri IPC bridge
      → Rust command handler
        → ApiClient (reqwest HTTP)
          → https://api.juicevault.xyz
```

**Key API endpoints:**

| Endpoint | Auth | Method | Purpose |
|----------|------|--------|---------|
| `/user/auth/token` | No | POST | Get login token |
| `/user/auth/login` | No | POST | Authenticate |
| `/user/auth/register` | No | POST | Create account |
| `/user/auth/refresh` | No | POST | Refresh tokens |
| `/user/auth/me` | Yes | GET | Current user info |
| `/user/profile` | Yes | PUT | Update preferences |
| `/music/list` | No | GET | All songs |
| `/music/search` | No | GET | Search songs |
| `/music/{id}/metadata` | No | GET | Song metadata |
| `/music/tracker/info/{id}` | No | GET | Tracker/era info |
| `/music/download/{id}` | No | GET | Download song file |
| `/user/likes` | Yes | GET | Liked songs (paginated) |
| `/user/likes/{id}` | Yes | POST/DELETE | Like/unlike |
| `/user/history` | Yes | POST | Log listen |
| `/user/history/stats` | Yes | GET | Listening statistics |
| `/user/history/activity` | Yes | GET | Activity/streaks |
| `/user/playlists` | Yes | GET/POST | List/create playlists |
| `/user/playlists/{id}` | Yes | GET/PUT/DELETE | Playlist CRUD |
| `/user/playlists/{id}/songs` | Yes | POST | Add songs |
| `/user/playlists/{id}/songs/{sid}` | Yes | DELETE | Remove song |
| `/user/playlists/{id}/cover` | Yes | POST/DELETE | Playlist cover |
| `/media/list` | No | GET | All media |
| `/media/stream/{id}` | No | GET | Stream media |
| `/media/download/{id}` | No | GET | Download media |
| `/radio/now-playing` | No | GET | Current radio track |
| `/radio/schedule` | No | GET | Upcoming tracks |
| `/radio/stream` | No | GET | HLS audio stream |
| `/radio/skip` | Yes | POST | Vote to skip |
| `/stats` | No | GET | Archive statistics |
| `/misc/desktop/versions` | No | GET | Update info |

---

## Audio Engine

The audio engine lives in `playerStore.jsx` and uses the Web Audio API:

### Playback Chain

Two `HTMLAudioElement` instances enable crossfading. The active element connects through:

1. **MediaElementSourceNode** — Bridges HTML audio to Web Audio
2. **BiquadFilterNode (bass)** — Lowshelf at 200Hz
3. **BiquadFilterNode (mid)** — Peaking at 1kHz
4. **BiquadFilterNode (treble)** — Highshelf at 4kHz
5. **GainNode (EQ gain)** — Master EQ gain control
6. **ConvolverNode (reverb)** — Optional reverb with generated impulse response
7. **GainNode (wet/dry)** — Reverb mix control
8. **AnalyserNode** — FFT data for fullscreen visualizer
9. **AudioContext.destination** — System audio output

### Crossfade

When a track ends or user skips:
1. Current audio starts volume ramp down over `crossfadeDuration` seconds
2. New audio starts on the alternate element with volume ramp up
3. After crossfade completes, old element is paused and reset

### EQ Parameters

| Band | Type | Frequency | Range |
|------|------|-----------|-------|
| Bass | Lowshelf | 200 Hz | -12 to +12 dB |
| Mid | Peaking | 1000 Hz | -12 to +12 dB |
| Treble | Highshelf | 4000 Hz | -12 to +12 dB |
| Gain | Gain | — | -12 to +12 dB |

### Listen Logging

Listens are logged to the API when:
- A song has played for at least 30 seconds, OR
- The song completes naturally
- Sends: `songId`, `duration` (seconds played), `completed` (boolean), `source: "app"`

### Radio

Radio connects to an HLS stream at `/radio/stream`. The player polls `/radio/now-playing` every 10 seconds to sync metadata. Radio mode disables shuffle, repeat, and manual seeking.

---

## Discord Rich Presence

### Architecture

```
React (useDiscordRPC hook)
  → Tauri invoke (init/update/clear/disconnect)
    → Rust discord.rs (discord-rich-presence crate)
      → Discord IPC (local socket)
```

### Presence States

| State | Details | Status | Activity Type |
|-------|---------|--------|---------------|
| Playing song | Song title | `by Artist` | Listening |
| Paused song | Song title | `by Artist — Paused` | Listening |
| Radio | Song title | `Artist — Radio` | Listening |
| Browsing | "Exploring the vault" | "Browsing songs" | Playing |
| Liked Songs | "Browsing liked songs" | "Liked Songs" | Playing |
| Radio page | "Tuning into radio" | "Radio" | Playing |
| Media | "Browsing media" | "Media Library" | Playing |
| Viewing media | Media title | "Watching/Viewing" | Watching |
| Playlist | "Managing {name}" | "Playlists" | Playing |
| Idle | "Idling" | "Home" | Playing |

### Local Cover Art

For local files, cover art is uploaded to Litterbox (catbox.moe) as a 72-hour temporary file so Discord can display it. URLs are cached in-memory per session to avoid re-uploads.

---

## Local Files System

### Scanning Pipeline

```
User adds folder in Settings
  → LocalFilesProvider.addSource(path)
    → scanAllSources()
      → Rust scan_local_directory(dir, knownHashes)
        → walkdir recursive traversal
        → Filter by audio extensions
        → Skip already-indexed files (by hash)
        → rayon parallel processing:
            ├─ SHA-256 hash (first 16KB + file size)
            ├─ lofty metadata (title, artist, album, duration)
            └─ Cover art extraction → 200px WebP thumbnail
        → Emit batches of 50 via Tauri events
      → Frontend accumulates, deduplicates, updates state
```

### File Identification

Files are identified by a fast hash: SHA-256 of the file size (8 bytes, little-endian) + first 16,384 bytes. This avoids reading entire large files while still providing collision resistance.

### Cover Art Cache

Extracted cover art is cached as WebP thumbnails in the system temp directory (`temp/juicevault_covers/{hash}.webp`). This survives app restarts but is cleaned up by the OS as temp files.

---

## Update System

1. `App.jsx` calls `checkForUpdate()` on startup
2. Rust `updater.rs` fetches `/misc/desktop/versions?channel=stable`
3. Compares current `CARGO_PKG_VERSION` against latest for the current platform
4. If newer version available, returns update info (version, download URL, release notes, file size)
5. Frontend shows `UpdateModal` with version comparison and "Update Now" button
6. "Update Now" opens the download URL in the system browser via `@tauri-apps/plugin-shell`

---

## File Reference

### Root

| File | Purpose |
|------|---------|
| `package.json` | Frontend dependencies and scripts |
| `package-lock.json` | Dependency lock file |
| `vite.config.js` | Vite bundler configuration |
| `tailwind.config.js` | Tailwind CSS theme extensions |
| `postcss.config.js` | PostCSS plugin configuration |
| `index.html` | HTML entry point |

### `src/` — Frontend Source

| File | Purpose |
|------|---------|
| `main.jsx` | React entry point, provider setup |
| `index.css` | Global styles, Tailwind imports |
| `App.jsx` | Auth flow, route handling, preference loading |

### `src/pages/`

| File | Purpose |
|------|---------|
| `Dashboard.jsx` | Main app shell (sidebar + content + playbar + modals) |
| `Login.jsx` | Login form with animated UI |
| `Signup.jsx` | Registration form with animated UI |
| `Overview.jsx` | Home dashboard with stats, streaks, top songs |
| `Browse.jsx` | Song browsing with search, filter, session edits |
| `Songs.jsx` | Liked songs with filter and search |
| `Radio.jsx` | Live radio with schedule and vote-skip |
| `RecentlyAdded.jsx` | Newest 100 songs in archive |
| `Media.jsx` | Video/image browser with list/card views |
| `LocalFiles.jsx` | Local audio file browser |
| `PlaylistView.jsx` | Individual playlist with edit, cover, song management |

### `src/components/`

| File | Purpose |
|------|---------|
| `Background.jsx` | Theme-driven full-screen background |
| `TitleBar.jsx` | Custom window title bar with controls |
| `Sidebar.jsx` | Navigation panel with playlists |
| `PlayBar.jsx` | Bottom playback controls |
| `FullscreenPlayer.jsx` | Immersive player with canvas visualizer |
| `SongList.jsx` | Virtualized song list/card views |
| `SongContextMenu.jsx` | Right-click/three-dot song menu |
| `FilterBar.jsx` | Era filter + sort dropdowns |
| `MediaViewer.jsx` | Image/video viewer overlay |
| `SettingsModal.jsx` | App settings (theme, RPC, local files) |
| `PlayerPreferencesModal.jsx` | EQ, reverb, crossfade controls |
| `CreatePlaylistModal.jsx` | New playlist form |
| `AddToPlaylistModal.jsx` | Add song to playlist picker |
| `SongInfoModal.jsx` | Song metadata display |
| `UpdateModal.jsx` | App update notification |

### `src/stores/`

| File | Purpose |
|------|---------|
| `playerStore.jsx` | Audio engine, playback state, EQ, crossfade |
| `themeStore.jsx` | Theme definitions, selection, persistence |
| `localFilesStore.jsx` | Local file indexing state and scanning |

### `src/hooks/`

| File | Purpose |
|------|---------|
| `useDiscordRPC.jsx` | Discord presence management |
| `useLocalStorage.js` | Generic localStorage-backed state hook |

### `src/lib/`

| File | Purpose |
|------|---------|
| `api.js` | Frontend API client, Tauri invoke wrappers |
| `utils.js` | Class merge, time format, truncate utilities |

### `src-tauri/src/` — Rust Backend

| File | Purpose |
|------|---------|
| `main.rs` | Application entry point |
| `lib.rs` | Tauri builder, plugin/command registration |
| `commands/mod.rs` | Command module declarations |
| `commands/auth.rs` | Login, register, token refresh |
| `commands/songs.rs` | Song CRUD, search, likes, listen logging |
| `commands/playlists.rs` | Playlist CRUD, song/cover management |
| `commands/playlist.rs` | Get user's playlists |
| `commands/media.rs` | Media listing, metadata, view logging |
| `commands/radio.rs` | Radio now-playing, schedule, skip vote |
| `commands/stats.rs` | Listening stats and activity |
| `commands/profile.rs` | User profile and preferences |
| `commands/player.rs` | Track info lookup |
| `commands/discord.rs` | Discord RPC init, update, clear, disconnect |
| `commands/local_files.rs` | File scanning, hashing, metadata, explorer |
| `commands/eras.rs` | Song era fetching with cache |
| `commands/cover_upload.rs` | Temporary cover art upload for Discord |
| `commands/download.rs` | File download with native save dialog |
| `commands/updater.rs` | Version check and update info |
| `services/api.rs` | HTTP client, auth flow, JWT parsing |
| `models/user.rs` | Auth data structures |
| `utils/config.rs` | App data directory helpers |
