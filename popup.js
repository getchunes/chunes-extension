"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  appleMusic: true,
  soundcloud: true,
  youtubeMusic: true,
});

const elements = {
  connection: document.querySelector("#connection"),
  connectionText: document.querySelector("#connection-text"),
  enabled: document.querySelector("#enabled"),
  appleMusic: document.querySelector("#apple-music"),
  refresh: document.querySelector("#refresh"),
  soundcloud: document.querySelector("#soundcloud"),
  sourceMark: document.querySelector("#source-mark"),
  sourceName: document.querySelector("#source-name"),
  trackTitle: document.querySelector("#track-title"),
  updateNote: document.querySelector("#update-note"),
  youtubeMusic: document.querySelector("#youtube-music"),
};
const settingInputs = [
  elements.enabled,
  elements.appleMusic,
  elements.soundcloud,
  elements.youtubeMusic,
];

let confirmedSettings = { ...DEFAULT_SETTINGS };

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Chune ID did not respond."));
        return;
      }
      resolve(response.status);
    });
  });
}

function setBusy(busy) {
  elements.refresh.disabled = busy;
  for (const input of settingInputs) {
    input.disabled = busy;
  }
}

function formatAttemptTime(timestamp) {
  if (!timestamp) {
    return "Local check has not run yet.";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Local check complete.";
  }

  return `Checked ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function renderCurrent(status) {
  elements.sourceMark.className = "source-mark";
  elements.trackTitle.removeAttribute("title");

  if (!status.settings.enabled) {
    elements.sourceMark.classList.add("paused");
    elements.sourceMark.textContent = "OFF";
    elements.sourceName.textContent = "Identification paused";
    elements.trackTitle.textContent = "Turn Chune ID on to detect supported audio.";
    return;
  }

  if (!status.current) {
    elements.sourceMark.textContent = "--";
    elements.sourceName.textContent = "No supported audio";
    elements.trackTitle.textContent = "Play audio on SoundCloud, YouTube Music, or Apple Music.";
    return;
  }

  if (status.current.source === "SoundCloud") {
    elements.sourceMark.classList.add("soundcloud");
    elements.sourceMark.textContent = "SC";
  } else if (status.current.source === "YouTube Music") {
    elements.sourceMark.classList.add("youtube");
    elements.sourceMark.textContent = "YTM";
  } else if (status.current.source === "Apple Music") {
    elements.sourceMark.classList.add("applemusic");
    elements.sourceMark.textContent = "AM";
  }

  if (status.current.publishEnabled === false) {
    elements.sourceMark.classList.add("disabled");
  }

  elements.sourceName.textContent =
    status.current.publishEnabled === false
      ? `${status.current.source} (publishing off)`
      : status.current.source;
  const displayTitle =
    status.current.title || `Identifying ${status.current.source} track…`;
  elements.trackTitle.textContent = displayTitle;
  elements.trackTitle.title = displayTitle;
}

function renderStatus(status) {
  const settings = { ...DEFAULT_SETTINGS, ...(status.settings || {}) };
  confirmedSettings = settings;
  elements.enabled.checked = settings.enabled;
  elements.appleMusic.checked = settings.appleMusic;
  elements.soundcloud.checked = settings.soundcloud;
  elements.youtubeMusic.checked = settings.youtubeMusic;

  elements.connection.classList.remove("connected", "disconnected");
  if (status.incompatible === true) {
    elements.connection.classList.add("disconnected");
    elements.connectionText.textContent = "Chunes desktop update required";
  } else if (status.connected === true) {
    elements.connection.classList.add("connected");
    elements.connectionText.textContent = "Chunes desktop connected";
  } else if (status.connected === false) {
    elements.connection.classList.add("disconnected");
    elements.connectionText.textContent = "Chunes desktop not detected";
  } else {
    elements.connectionText.textContent = "Checking for Chunes...";
  }

  renderCurrent({ ...status, settings });

  const countNotes = [];
  const extraTabs = Math.max(0, Number(status.tabCount || 0) - 1);
  const omittedTabs = Math.max(0, Number(status.omittedTabCount || 0));
  const truncatedTitles = Math.max(0, Number(status.truncatedTitleCount || 0));
  if (extraTabs > 0) {
    countNotes.push(`${extraTabs} more supported tab${extraTabs === 1 ? "" : "s"}`);
  }
  if (omittedTabs > 0) {
    countNotes.push(`${omittedTabs} tab${omittedTabs === 1 ? "" : "s"} omitted by report limits`);
  }
  if (truncatedTitles > 0) {
    countNotes.push(`${truncatedTitles} title${truncatedTitles === 1 ? "" : "s"} truncated`);
  }
  const countNote = countNotes.length > 0 ? `; ${countNotes.join("; ")}` : "";
  elements.updateNote.textContent = `${formatAttemptTime(status.lastAttemptAt)}${countNote}`;
  elements.updateNote.classList.toggle("error", Boolean(status.error));
  if (status.error) {
    elements.updateNote.textContent += `; ${status.error}`;
  }
}

function renderPopupError(error) {
  elements.updateNote.classList.add("error");
  elements.updateNote.textContent =
    error instanceof Error ? error.message : "Unable to contact Chune ID.";
}

async function refresh() {
  setBusy(true);
  elements.updateNote.classList.remove("error");
  elements.updateNote.textContent = "Refreshing local status...";

  try {
    renderStatus(await sendMessage({ type: "refresh" }));
  } catch (error) {
    renderPopupError(error);
  } finally {
    setBusy(false);
  }
}

async function updateSetting(event) {
  const input = event.currentTarget;
  const key = input.dataset.setting;
  const previousValue = confirmedSettings[key];
  setBusy(true);
  elements.updateNote.classList.remove("error");
  elements.updateNote.textContent = "Saving locally...";

  try {
    const status = await sendMessage({
      type: "update-settings",
      settings: { [key]: input.checked },
    });
    renderStatus(status);
  } catch (error) {
    input.checked = previousValue;
    renderPopupError(error);
  } finally {
    setBusy(false);
  }
}

elements.refresh.addEventListener("click", refresh);
for (const input of settingInputs) {
  input.addEventListener("change", updateSetting);
}

if (globalThis.chrome?.runtime?.sendMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "status-updated" && message.status) {
      renderStatus(message.status);
    }
  });
  void refresh();
} else {
  // Direct-file rendering mirrors a successful protocol-2 status for store capture.
  renderStatus({
    connected: true,
    current: {
      host: "music.youtube.com",
      publishEnabled: true,
      source: "YouTube Music",
      title: "Example Track - Example Artist - YouTube Music",
    },
    error: null,
    incompatible: false,
    lastAttemptAt: "2026-07-18T12:00:00.000Z",
    omittedTabCount: 0,
    settings: DEFAULT_SETTINGS,
    tabCount: 1,
    truncatedTitleCount: 0,
  });
}
