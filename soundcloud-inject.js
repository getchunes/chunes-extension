"use strict";

// Runs in the MAIN world because SoundCloud owns the current Media Session.
// It reads only the now-playing metadata Chrome exposes and never contacts the
// network or extension APIs.
(() => {
  if (window.__chuneIdSoundCloudInject) {
    return;
  }
  window.__chuneIdSoundCloudInject = true;

  const CHANNEL = "chune-id-soundcloud";
  const HEARTBEAT_MS = 3000;
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_ARTWORK_URL_CHARACTERS = 2048;

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
        if (url.protocol === "https:" && url.hostname.endsWith(".sndcdn.com")) {
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
