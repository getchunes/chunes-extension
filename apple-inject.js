"use strict";

// Runs in the MAIN world on music.apple.com. MusicKit is the only accurate
// timing source for the Apple Music web player: the <audio> element reports
// the queue buffer as its duration and the OS media session runs a continuous
// queue counter, so both are wrong. This script reads the MusicKit player and
// hands snapshots to the isolated-world bridge via window.postMessage.
(() => {
  const CHANNEL = "chune-id-apple";
  const CONFIGURE_POLL_MS = 1000;
  const CONFIGURE_POLL_LIMIT = 300;
  const HEARTBEAT_MS = 3000;
  const MAX_TITLE_CHARACTERS = 512;

  let player = null;
  let heartbeatTimer = null;

  function readNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  }

  function postSnapshot() {
    if (!player) {
      return;
    }

    let snapshot;
    try {
      const item = player.nowPlayingItem;
      const title = item && typeof item.title === "string" ? item.title : "";
      snapshot = {
        channel: CHANNEL,
        position: readNumber(player.currentPlaybackTime),
        duration: readNumber(player.currentPlaybackDuration),
        playing: player.isPlaying === true,
        title: title.slice(0, MAX_TITLE_CHARACTERS),
        sampledAt: Date.now(),
      };
    } catch {
      return;
    }

    if (snapshot.position === null) {
      return;
    }

    window.postMessage(snapshot, window.location.origin);
  }

  function attach(instance) {
    player = instance;
    for (const eventName of [
      "playbackStateDidChange",
      "nowPlayingItemDidChange",
      "playbackDurationDidChange",
    ]) {
      try {
        instance.addEventListener(eventName, postSnapshot);
      } catch {}
    }
    heartbeatTimer = setInterval(postSnapshot, HEARTBEAT_MS);
    window.addEventListener("pagehide", () => {
      clearInterval(heartbeatTimer);
    });
    postSnapshot();
  }

  function resolveInstance() {
    // MusicKit configures itself well after document load, and getInstance
    // throws until configuration has happened.
    try {
      const musicKit = window.MusicKit;
      if (!musicKit || typeof musicKit.getInstance !== "function") {
        return null;
      }
      return musicKit.getInstance() || null;
    } catch {
      return null;
    }
  }

  let pollCount = 0;
  const pollTimer = setInterval(() => {
    pollCount += 1;
    const instance = resolveInstance();
    if (instance) {
      clearInterval(pollTimer);
      attach(instance);
      return;
    }
    if (pollCount >= CONFIGURE_POLL_LIMIT) {
      clearInterval(pollTimer);
    }
  }, CONFIGURE_POLL_MS);
})();
