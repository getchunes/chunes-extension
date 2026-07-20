"use strict";

// Runs in the ISOLATED world on music.apple.com. Relays MusicKit playback
// snapshots posted by apple-inject.js (MAIN world) to the service worker.
// Page messages are untrusted input: everything is revalidated here before it
// leaves the content script.
(() => {
  const CHANNEL = "chune-id-apple";
  const MAX_TITLE_CHARACTERS = 512;
  const MAX_DURATION_SECONDS = 24 * 60 * 60;

  function readNumber(value, maximum) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= maximum
      ? value
      : null;
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
      title:
        typeof data.title === "string"
          ? data.title.slice(0, MAX_TITLE_CHARACTERS)
          : "",
      sampledAt,
    };

    chrome.runtime.sendMessage(
      { type: "apple-playback", payload },
      () => void chrome.runtime.lastError,
    );
  });
})();
