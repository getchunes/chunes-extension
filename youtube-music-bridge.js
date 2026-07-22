"use strict";

// Validates YouTube Music page metadata before it crosses into the worker.
(() => {
  if (window.__chuneIdYouTubeMusicBridge) {
    return;
  }
  window.__chuneIdYouTubeMusicBridge = true;

  const CHANNEL = "chune-id-youtube-music";
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_ARTWORK_URL_CHARACTERS = 2048;
  const ARTWORK_HOSTS = new Set([
    "i.ytimg.com",
    "lh3.googleusercontent.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
  ]);

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
      return url.protocol === "https:" && ARTWORK_HOSTS.has(url.hostname) ? url.href : undefined;
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
