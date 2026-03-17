import { useEffect, useRef } from "react";
import { usePlayer } from "@/stores/playerStore";
import { initDiscordRpc, updateDiscordPresence, clearDiscordPresence, disconnectDiscordRpc } from "@/lib/api";

const CDN = "https://api.juicevault.xyz";

function getPagePresence(ctx) {
  const { activePage, playlistName, mediaViewing } = ctx || {};

  if (mediaViewing) {
    const isVideo = mediaViewing.type?.startsWith("video/");
    return {
      details: mediaViewing.title || (isVideo ? "Unknown Video" : "Unknown Image"),
      status: isVideo ? "Watching a video" : "Viewing an image",
      largeImage: "logo",
      largeText: "JuiceVault",
      smallImage: null,
      smallText: null,
      activityType: 3,
    };
  }

  if (activePage === "Browse") return { details: "Exploring the vault", status: "Browsing songs", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };
  if (activePage === "Liked Songs") return { details: "Browsing liked songs", status: "Liked Songs", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };
  if (activePage === "Radio") return { details: "Tuning into radio", status: "Radio", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };
  if (activePage === "Media") return { details: "Browsing media", status: "Media Library", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };
  if (activePage?.startsWith("playlist:")) return { details: `Managing ${playlistName || "a playlist"}`, status: "Playlists", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };

  return { details: "Idling", status: "Home", largeImage: "logo", largeText: "JuiceVault", smallImage: null, smallText: null, activityType: 0 };
}

export function useDiscordRPC(enabled, ctx) {
  const { state } = usePlayer();
  const connectedRef = useRef(false);
  const lastUpdateRef = useRef("");
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (connectedRef.current) {
        clearDiscordPresence().catch(() => {});
        disconnectDiscordRpc().catch(() => {});
        connectedRef.current = false;
      }
      return;
    }

    initDiscordRpc()
      .then(() => {
        connectedRef.current = true;
        if (pendingRef.current) { pendingRef.current(); pendingRef.current = null; }
      })
      .catch((e) => console.warn("Discord RPC init failed:", e));

    return () => {
      if (connectedRef.current) {
        clearDiscordPresence().catch(() => {});
        disconnectDiscordRpc().catch(() => {});
        connectedRef.current = false;
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const doUpdate = () => {
      const track = state.currentTrack;
      const isPlaying = state.isPlaying;
      const isRadio = state.isRadio;

      if (isRadio && isPlaying) {
        const key = `radio:${track?.title}`;
        if (key === lastUpdateRef.current) return;
        lastUpdateRef.current = key;
        const coverUrl = track?.cover ? `${CDN}${track.cover}` : null;
        updateDiscordPresence(
          track?.title || "Live Radio",
          `${track?.artist || "JuiceVault"} — Radio`,
          coverUrl || "logo_circle",
          track?.title || "JuiceVault Radio",
          "logo_circle",
          "JuiceVault",
          Math.floor(Date.now() / 1000),
          2,
        ).catch(() => {});
        return;
      }

      if (track && isPlaying) {
        const key = `song:${track.id}:playing`;
        if (key === lastUpdateRef.current) return;
        lastUpdateRef.current = key;
        const coverUrl = track.local ? null : (track.cover ? `${CDN}${track.cover}` : null);
        updateDiscordPresence(
          track.title || "Unknown Track",
          `by ${track.artist || "Unknown Artist"}`,
          coverUrl || "logo_circle",
          `${track.title} — ${track.artist}`,
          "logo_circle",
          "JuiceVault",
          Math.floor(Date.now() / 1000),
          2,
        ).catch(() => {});
        return;
      }

      if (track && !isPlaying) {
        const key = `song:${track.id}:paused`;
        if (key === lastUpdateRef.current) return;
        lastUpdateRef.current = key;
        const coverUrl = track.local ? null : (track.cover ? `${CDN}${track.cover}` : null);
        updateDiscordPresence(
          track.title || "Unknown Track",
          `by ${track.artist || "Unknown Artist"} — Paused`,
          coverUrl || "logo_circle",
          `${track.title} — ${track.artist}`,
          "logo_circle",
          "JuiceVault",
          null,
          2,
        ).catch(() => {});
        return;
      }

      const p = getPagePresence(ctx);
      const key = `page:${ctx?.activePage}:${ctx?.mediaViewing?.title || ""}`;
      if (key === lastUpdateRef.current) return;
      lastUpdateRef.current = key;
      updateDiscordPresence(
        p.details,
        p.status,
        p.largeImage,
        p.largeText,
        p.smallImage,
        p.smallText,
        null,
        p.activityType,
      ).catch(() => {});
    };

    if (connectedRef.current) {
      doUpdate();
    } else {
      pendingRef.current = doUpdate;
    }
  }, [enabled, state.currentTrack, state.isPlaying, state.isRadio, ctx?.activePage, ctx?.playlistName, ctx?.mediaViewing]);
}
