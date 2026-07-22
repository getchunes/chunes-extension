"use strict";

// Runs in the ISOLATED world on music.apple.com. Relays MusicKit playback
// snapshots posted by apple-inject.js (MAIN world) to the service worker.
// Page messages are untrusted input: everything is revalidated here before it
// leaves the content script.
(() => {
  // The service worker may inject this into an already-open tab that also
  // received it from the manifest; relay from a single listener per page.
  if (window.__chuneIdAppleBridge) {
    return;
  }
  window.__chuneIdAppleBridge = true;

  const CHANNEL = "chune-id-apple";
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_ARTWORK_URL_CHARACTERS = 2048;
  const MAX_DURATION_SECONDS = 24 * 60 * 60;

  function readNumber(value, maximum) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= maximum
      ? value
      : null;
  }

  function readText(value) {
    return typeof value === "string" && value.length <= MAX_TITLE_CHARACTERS
      ? value.trim()
      : "";
  }

  function readArtwork(value) {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string" || value.length === 0 || value.length > MAX_ARTWORK_URL_CHARACTERS) {
      return null;
    }
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.endsWith(".mzstatic.com") ? url.href : null;
    } catch {
      return null;
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

    const position = readNumber(data.position, MAX_DURATION_SECONDS);
    const sampledAt = readNumber(data.sampledAt, Number.MAX_SAFE_INTEGER);
    if (position === null || sampledAt === null) {
      return;
    }

    const payload = {
      position,
      duration: readNumber(data.duration, MAX_DURATION_SECONDS),
      playing: data.playing === true,
      title: readText(data.title),
      artist: readText(data.artist),
      artwork: readArtwork(data.artwork),
      sampledAt,
    };

    chrome.runtime.sendMessage(
      { type: "apple-playback", payload },
      () => void chrome.runtime.lastError,
    );
  });
})();
