import { invoke } from "@tauri-apps/api/core";

let refreshing = null;

async function renewToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  if (refreshToken) {
    try {
      const res = await invoke("refresh_auth", { refreshToken });
      const newAccess = res?.data?.accessToken || res?.accessToken;
      const newRefresh = res?.data?.refreshToken || res?.refreshToken;
      if (newAccess) { localStorage.setItem("accessToken", newAccess); return newAccess; }
    } catch {}
  }
  const loginId = localStorage.getItem("loginId");
  const loginPw = localStorage.getItem("loginPw");
  if (!loginId || !loginPw) throw new Error("No credentials");
  const data = await invoke("login", { login: loginId, password: atob(loginPw) });
  if (data.accessToken) localStorage.setItem("accessToken", data.accessToken);
  if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
  if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
  return data.accessToken;
}

async function authedInvoke(cmd, argsFn) {
  try {
    return await invoke(cmd, argsFn(localStorage.getItem("accessToken")));
  } catch (err) {
    const msg = typeof err === "string" ? err : err?.message || "";
    if (!msg.includes("Invalid token") && !msg.includes("expired") && !msg.includes("Unauthorized")) throw err;
    if (!refreshing) refreshing = renewToken().finally(() => { refreshing = null; });
    const newToken = await refreshing;
    return invoke(cmd, argsFn(newToken));
  }
}

export async function login(loginStr, password) {
  return invoke("login", { login: loginStr, password });
}

export async function register(username, displayName, email, password) {
  return invoke("register", {
    username,
    displayName,
    email,
    password,
  });
}

export async function refreshAuth(refreshToken) {
  return invoke("refresh_auth", { refreshToken });
}

export async function getTrackInfo(trackId) {
  return authedInvoke("get_track_info", (accessToken) => ({ trackId, accessToken }));
}

export async function getMyPlaylists() {
  return authedInvoke("get_my_playlists", (accessToken) => ({ accessToken }));
}

export async function getListeningStats() {
  return authedInvoke("get_listening_stats", (accessToken) => ({ accessToken }));
}

export async function getListeningActivity() {
  return authedInvoke("get_listening_activity", (accessToken) => ({ accessToken }));
}

export async function getArchiveStats() {
  return invoke("get_archive_stats");
}

export async function getAllSongs() {
  return invoke("get_all_songs");
}

export async function searchSongs(query) {
  return invoke("search_songs", { query });
}

export async function getSongMetadata(songId) {
  return invoke("get_song_metadata", { songId });
}

export async function likeSong(songId, localMeta = null) {
  return authedInvoke("like_song", (accessToken) => ({ accessToken, songId, localMeta }));
}

export async function unlikeSong(songId) {
  return authedInvoke("unlike_song", (accessToken) => ({ accessToken, songId }));
}

export async function getLikedSongs() {
  return authedInvoke("get_liked_songs", (accessToken) => ({ accessToken }));
}

export async function logListen(songId, duration, completed) {
  return authedInvoke("log_listen", (accessToken) => ({ accessToken, songId, duration, completed }));
}

export async function getAllMedia() {
  return invoke("get_all_media");
}

export async function getMediaMetadata(mediaId) {
  return invoke("get_media_metadata", { mediaId });
}

export async function logMediaView(mediaId) {
  return invoke("log_media_view", { mediaId });
}

export async function getPlaylist(playlistId) {
  return authedInvoke("get_playlist", (accessToken) => ({ accessToken, playlistId }));
}

export async function createPlaylist(name, description = "", isPublic = true) {
  return authedInvoke("create_playlist", (accessToken) => ({ accessToken, name, description, isPublic }));
}

export async function updatePlaylist(playlistId, name, description, isPublic) {
  return authedInvoke("update_playlist", (accessToken) => ({ accessToken, playlistId, name, description, isPublic }));
}

export async function deletePlaylist(playlistId) {
  return authedInvoke("delete_playlist", (accessToken) => ({ accessToken, playlistId }));
}

export async function addSongsToPlaylist(playlistId, songIds) {
  return authedInvoke("add_songs_to_playlist", (accessToken) => ({ accessToken, playlistId, songIds }));
}

export async function removeSongFromPlaylist(playlistId, songId) {
  return authedInvoke("remove_song_from_playlist", (accessToken) => ({ accessToken, playlistId, songId }));
}

export async function uploadPlaylistCover(playlistId, fileData, fileName) {
  return authedInvoke("upload_playlist_cover", (accessToken) => ({ accessToken, playlistId, fileData: Array.from(fileData), fileName }));
}

export async function removePlaylistCover(playlistId) {
  return authedInvoke("remove_playlist_cover", (accessToken) => ({ accessToken, playlistId }));
}

export async function downloadFile(urlPath, defaultName) {
  return invoke("download_file", { urlPath, defaultName });
}

export async function getTrackerInfo(songId) {
  return invoke("get_tracker_info", { songId });
}

export async function getRadioNowPlaying() {
  return invoke("get_radio_now_playing");
}

export async function getRadioSchedule(count = 10) {
  return invoke("get_radio_schedule", { count });
}

export async function getRadioListeners() {
  return invoke("get_radio_listeners");
}

export async function voteSkipRadio() {
  return authedInvoke("vote_skip_radio", (accessToken) => ({ accessToken }));
}

export async function getCurrentUser() {
  return authedInvoke("get_current_user", (accessToken) => ({ accessToken }));
}

export async function updateUserPreferences(preferences) {
  return authedInvoke("update_user_preferences", (accessToken) => ({ accessToken, preferences }));
}

export async function scanLocalDirectory(directory, knownHashes = null) {
  return invoke("scan_local_directory", { directory, knownHashes });
}

export async function hashSingleFile(filePath) {
  return invoke("hash_single_file", { filePath });
}

export async function showInExplorer(filePath) {
  return invoke("show_in_explorer", { filePath });
}

export async function getAppVersion() {
  return invoke("get_app_version");
}

export async function checkForUpdate() {
  return invoke("check_for_update");
}

export async function initDiscordRpc() {
  return invoke("init_discord_rpc");
}

export async function updateDiscordPresence(details, status, largeImage, largeText, smallImage, smallText, startTimestamp, activityType) {
  return invoke("update_discord_presence", { details, status, largeImage, largeText, smallImage, smallText, startTimestamp, activityType });
}

export async function clearDiscordPresence() {
  return invoke("clear_discord_presence");
}

export async function disconnectDiscordRpc() {
  return invoke("disconnect_discord_rpc");
}
