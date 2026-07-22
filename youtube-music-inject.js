"use strict";

// Reads YouTube Music's current Media Session instead of making the desktop
// scrape an undocumented remote endpoint for metadata artwork.
(() => {
  if (window.__chuneIdYouTubeMusicInject) {
    return;
  }
  window.__chuneIdYouTubeMusicInject = true;

  const CHANNEL = "chune-id-youtube-music";
  const HEARTBEAT_MS = 3000;
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_ARTWORK_URL_CHARACTERS = 2048;
  const ARTWORK_HOSTS = new Set([
    "i.ytimg.com",
    "lh3.googleusercontent.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
  ]);

  function readText(value) {
    return typeof value === "string" ? value.trim().slice(0, MAX_TITLE_CHARACTERS) : "";
  }

  function readArtwork(metadata) {
    if (!Array.isArray(metadata?.artwork)) {
      return null;
    }
    for (const candidate of metadata.artwork) {
      const src = typeof candidate?.src === "string" ? candidate.src : "";
      if (src.length === 0 || src.length > MAX_ARTWORK_URL_CHARACTERS) {
        continue;
      }
      try {
        const url = new URL(src);
        if (url.protocol === "https:" && ARTWORK_HOSTS.has(url.hostname)) {
          return url.href;
        }
      } catch {}
    }
    return null;
  }

  function postSnapshot() {
    const metadata = navigator.mediaSession?.metadata;
    const title = readText(metadata?.title);
    if (!title) {
      return;
    }
    const snapshot = {
        channel: CHANNEL,
        title,
        artist: readText(metadata.artist),
        artwork: readArtwork(metadata),
    };
    window.postMessage(snapshot, window.location.origin);
  }

  const heartbeat = setInterval(postSnapshot, HEARTBEAT_MS);
  window.addEventListener("pagehide", () => clearInterval(heartbeat));
  postSnapshot();
})();
