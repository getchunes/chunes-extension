"use strict";

// The isolated-world bridge validates untrusted page messages before relaying
// current SoundCloud Media Session metadata to the service worker.
(() => {
  if (window.__chuneIdSoundCloudBridge) {
    return;
  }
  window.__chuneIdSoundCloudBridge = true;

  const CHANNEL = "chune-id-soundcloud";
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_ARTWORK_URL_CHARACTERS = 2048;

  function readText(value, required = false) {
    if (typeof value !== "string" || value.length > MAX_TITLE_CHARACTERS) {
      return null;
    }
    const text = value.trim();
    return required && !text ? null : text;
  }

  function readArtwork(value) {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_ARTWORK_URL_CHARACTERS) {
      return undefined;
    }
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.endsWith(".sndcdn.com")
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== "object" || data.channel !== CHANNEL) {
      return;
    }
    const title = readText(data.title, true);
    const artist = readText(data.artist);
    const artwork = readArtwork(data.artwork);
    if (title === null || artist === null || artwork === undefined) {
      return;
    }
    chrome.runtime.sendMessage(
      { type: "page-metadata", payload: { title, artist, artwork } },
      () => void chrome.runtime.lastError,
    );
  });
})();
