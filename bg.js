"use strict";

const ENDPOINT = "http://127.0.0.1:52846/tabs";
const REPORT_ALARM = "report-audible-tabs";
const REPORT_PERIOD_MINUTES = 0.5;
const IDENTIFYING_RETRY_MS = 2000;
const REQUEST_TIMEOUT_MS = 3000;
const REQUEST_CONTENT_TYPE = "application/json";
const RESPONSE_PROTOCOL_HEADER = "X-Chunes-Protocol";
const CURRENT_PROTOCOL_VERSION = 4;
const LEGACY_PROTOCOL_VERSION = 3;
const MAX_REPORTED_TABS = 64;
const MAX_TITLE_CHARACTERS = 512;
const MAX_REQUEST_BYTES = 32 * 1024;
const APPLE_PLAYBACK_HOST = "music.apple.com";
const APPLE_PLAYBACK_KEYS = ["position", "duration", "playing", "sampledAt"];
const PAGE_METADATA_KEYS = ["title", "artist", "artwork"];
const APPLE_SEEK_THRESHOLD_SECONDS = 2.5;
const MAX_PLAYBACK_SECONDS = 24 * 60 * 60;
const MAX_ARTWORK_URL_CHARACTERS = 2048;
const PAGE_METADATA_MAX_AGE_MS = 10_000;
const textEncoder = new TextEncoder();
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  appleMusic: true,
  soundcloud: true,
  youtubeMusic: true,
});
const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));
const SUPPORTED_URL_PATTERNS = Object.freeze([
  "https://music.apple.com/*",
  "https://soundcloud.com/*",
  "https://www.soundcloud.com/*",
  "https://youtube.com/*",
  "https://www.youtube.com/*",
  "https://m.youtube.com/*",
  "https://music.youtube.com/*",
]);

const applePlaybackByTab = new Map();
const pageMetadataByTab = new Map();
let cachedSettings = { ...DEFAULT_SETTINGS };
let readyPromise;
let activeReport;
let queuedInteractiveReport;
let backgroundReportPending = false;
let identifyingRetryTimer;
let lastNegotiatedProtocolVersion = null;
let lastStatus = {
  connected: null,
  current: null,
  error: null,
  incompatible: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  omittedTabCount: 0,
  protocolVersion: null,
  settings: { ...DEFAULT_SETTINGS },
  tabCount: 0,
  truncatedTitleCount: 0,
};

function classifyHost(host) {
  if (host === "music.apple.com") {
    return "Apple Music";
  }

  if (host === "soundcloud.com" || host === "www.soundcloud.com") {
    return "SoundCloud";
  }

  if (host === "music.youtube.com") {
    return "YouTube Music";
  }

  if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com"
  ) {
    return "YouTube (blocked)";
  }

  return null;
}

async function initialize() {
  const stored = await chrome.storage.local.get(SETTING_KEYS);
  const missingOrInvalid = {};

  for (const key of SETTING_KEYS) {
    if (typeof stored[key] !== "boolean") {
      missingOrInvalid[key] = DEFAULT_SETTINGS[key];
    }
  }

  if (Object.keys(missingOrInvalid).length > 0) {
    await chrome.storage.local.set(missingOrInvalid);
  }

  cachedSettings = { ...DEFAULT_SETTINGS, ...stored, ...missingOrInvalid };
  const existingAlarm = await chrome.alarms.get(REPORT_ALARM);
  if (!existingAlarm) {
    await chrome.alarms.create(REPORT_ALARM, {
      periodInMinutes: REPORT_PERIOD_MINUTES,
    });
  }
}

function ensureReady() {
  if (!readyPromise) {
    readyPromise = initialize().catch((error) => {
      readyPromise = undefined;
      throw error;
    });
  }

  return readyPromise;
}

async function readSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const settings = {};

  for (const key of SETTING_KEYS) {
    settings[key] =
      typeof stored[key] === "boolean" ? stored[key] : DEFAULT_SETTINGS[key];
  }

  cachedSettings = settings;
  return settings;
}

async function queryClassifiedAudibleTabs() {
  const browserTabs = await chrome.tabs.query({
    audible: true,
    url: [...SUPPORTED_URL_PATTERNS],
  });

  return browserTabs.flatMap((tab) => {
    try {
      const url = new URL(tab.url);
      const host = url.hostname.toLowerCase();
      const source = classifyHost(host);

      if (!source) {
        return [];
      }

      const candidateMediaId =
        source === "YouTube Music" ? url.searchParams.get("v") : null;
      const mediaId =
        typeof candidateMediaId === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(candidateMediaId)
          ? candidateMediaId
          : null;

      return [
        {
          host,
          mediaId,
          source,
          tabId: typeof tab.id === "number" ? tab.id : null,
          title: typeof tab.title === "string" ? tab.title : "",
        },
      ];
    } catch {
      return [];
    }
  });
}

function notifyPopup(status) {
  chrome.runtime.sendMessage(
    { type: "status-updated", status },
    () => void chrome.runtime.lastError,
  );
}

function scheduleIdentifyingRetry(status) {
  if (identifyingRetryTimer) {
    clearTimeout(identifyingRetryTimer);
    identifyingRetryTimer = undefined;
  }
  // A supported tab is audible but the desktop app hasn't published a
  // matching track yet. Nothing else prompts another check until the tab
  // itself changes again or the next alarm tick (up to REPORT_PERIOD_MINUTES
  // later), so the popup would otherwise sit on "Identifying..." long after
  // the app has actually resolved it.
  if (status.connected && status.current && status.current.title === "") {
    identifyingRetryTimer = setTimeout(() => {
      identifyingRetryTimer = undefined;
      reportInBackground();
    }, IDENTIFYING_RETRY_MS);
  }
}

function truncateTitle(title) {
  let truncatedTitle = "";
  let characterCount = 0;

  for (const character of title) {
    if (characterCount === MAX_TITLE_CHARACTERS) {
      return { title: truncatedTitle, truncated: true };
    }
    truncatedTitle += character;
    characterCount += 1;
  }
  return { title: truncatedTitle, truncated: false };
}

function canPublish(source, settings) {
  if (source === "Apple Music") return settings.appleMusic;
  if (source === "SoundCloud") return settings.soundcloud;
  return source === "YouTube Music" && settings.youtubeMusic;
}

function reportPriority(tab, settings) {
  if (canPublish(tab.source, settings)) {
    return 0;
  }
  return tab.source === "YouTube (blocked)" ? 2 : 1;
}

function buildReport(settings, classifiedTabs, protocolVersion = CURRENT_PROTOCOL_VERSION) {
  const payload = {
    enabled: settings.enabled,
    services: {
      appleMusic: settings.appleMusic,
      soundcloud: settings.soundcloud,
      youtubeMusic: settings.youtubeMusic,
    },
    tabs: [],
  };
  if (protocolVersion === CURRENT_PROTOCOL_VERSION) {
    payload.protocol = CURRENT_PROTOCOL_VERSION;
  }
  const prioritizedTabs = [...classifiedTabs].sort(
    (left, right) => reportPriority(left, settings) - reportPriority(right, settings),
  );
  const reportedTabs = [];
  let body = JSON.stringify(payload);
  let truncatedTitleCount = 0;

  for (const tab of prioritizedTabs) {
    if (reportedTabs.length === MAX_REPORTED_TABS) {
      break;
    }

    const truncatedTitle = truncateTitle(tab.title);
    const reportedTab = { ...tab, title: truncatedTitle.title };
    const payloadTab = {
      host: reportedTab.host,
      mediaId: reportedTab.mediaId,
      title: reportedTab.title,
    };
    const metadata = protocolVersion === CURRENT_PROTOCOL_VERSION && freshPageMetadata(reportedTab);
    if (metadata) {
      payloadTab.metadata = metadata;
    }
    // Apple uses MusicKit while SoundCloud and YTM use their page audio
    // element. The desktop prefers a fresh page sample over GSMTC timing.
    if (reportedTab.source === "Apple Music" && reportedTab.tabId !== null) {
      const playback = applePlaybackByTab.get(reportedTab.tabId);
      if (playback) {
        for (const key of APPLE_PLAYBACK_KEYS) {
          payloadTab[key] = playback[key];
        }
      }
    }
    payload.tabs.push(payloadTab);
    const candidateBody = JSON.stringify(payload);

    if (textEncoder.encode(candidateBody).byteLength > MAX_REQUEST_BYTES) {
      payload.tabs.pop();
      continue;
    }

    body = candidateBody;
    reportedTabs.push(reportedTab);
    if (truncatedTitle.truncated) {
      truncatedTitleCount += 1;
    }
  }

  return {
    body,
    omittedTabCount: classifiedTabs.length - reportedTabs.length,
    reportedTabs,
    truncatedTitleCount,
  };
}

const GENERIC_TAB_TITLES = new Set(["youtube music", "soundcloud", "apple music", "youtube"]);

function displayTitle(tab, desktop) {
  if (desktop && desktop.track && desktop.host === tab.host) {
    return desktop.track;
  }
  // The app isn't currently publishing this tab. SoundCloud's tab title IS
  // the track and YouTube Music's contains it, but Apple Music's tab title
  // is the generic "Apple Music - Web Player" and would just be junk here.
  // YouTube Music's own tab title is just as generic ("YouTube Music") for
  // a beat right after playback starts, before the page updates it.
  if (tab.source === "Apple Music" || GENERIC_TAB_TITLES.has(tab.title.trim().toLowerCase())) {
    return "";
  }
  return tab.title;
}

async function postReport(body, protocolVersion) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": REQUEST_CONTENT_TYPE },
      body,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Chunes returned HTTP ${response.status}.`);
    }
    if (response.headers.get(RESPONSE_PROTOCOL_HEADER) !== String(protocolVersion)) {
      const error = new Error(`Chunes desktop is incompatible (protocol ${protocolVersion} response required).`);
      error.name = "ChunesProtocolError";
      throw error;
    }
    try {
      const data = await response.json();
      if (data && typeof data.track === "string" && data.track.trim()) {
        return {
          protocolVersion,
          track: data.track.trim(),
          host: typeof data.host === "string" ? data.host : null,
        };
      }
    } catch {}
    return { protocolVersion, track: null, host: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function performReport() {
  await ensureReady();

  const settings = await readSettings();
  let classifiedTabs = [];
  let tabError = null;

  if (settings.enabled) {
    try {
      classifiedTabs = await queryClassifiedAudibleTabs();
    } catch (error) {
      tabError = error instanceof Error ? error.message : "Unable to read tabs.";
    }
  }

  const report = buildReport(
    settings,
    classifiedTabs,
  );
  const { body, omittedTabCount, reportedTabs, truncatedTitleCount } = report;
  const supportedTabs = reportedTabs.filter(
    ({ source }) => source !== "YouTube (blocked)",
  );
  const currentTab =
    supportedTabs.find(({ source }) => canPublish(source, settings)) || supportedTabs[0];
  const attemptedAt = new Date().toISOString();
  let connected = false;
  let connectionError = null;
  let incompatible = false;
  let protocolVersion = null;

  let desktop = null;
  try {
    desktop = await postReport(body, CURRENT_PROTOCOL_VERSION);
    protocolVersion = desktop.protocolVersion;
    connected = true;
  } catch (error) {
    // A protocol 3 desktop rejects the explicit v4 marker. Retry only that
    // validation failure with the exact legacy body, without page metadata.
    if (error instanceof Error && error.message === "Chunes returned HTTP 400.") {
      try {
        desktop = await postReport(
          buildReport(settings, classifiedTabs, LEGACY_PROTOCOL_VERSION).body,
          LEGACY_PROTOCOL_VERSION,
        );
        protocolVersion = desktop.protocolVersion;
        connected = true;
      } catch (legacyError) {
        error = legacyError;
      }
    }
    if (!connected) {
      if (error instanceof Error && error.name === "ChunesProtocolError") {
        incompatible = true;
        connectionError = error.message;
      } else {
        connectionError =
          error instanceof Error && error.name === "AbortError"
            ? "Chunes desktop did not respond in time."
            : error instanceof Error && error.message.startsWith("Chunes returned HTTP")
              ? error.message
              : "Chunes desktop is not responding.";
      }
    }
  }

  if (connected && protocolVersion !== lastNegotiatedProtocolVersion) {
    lastNegotiatedProtocolVersion = protocolVersion;
    console.log(
      `Chune ID connected using protocol v${protocolVersion}${
        protocolVersion === LEGACY_PROTOCOL_VERSION ? " (legacy fallback)" : ""
      }.`,
    );
  }

  lastStatus = {
    connected,
    current: currentTab
      ? {
          host: currentTab.host,
          publishEnabled: canPublish(currentTab.source, settings),
          source: currentTab.source,
          title: displayTitle(currentTab, desktop),
        }
      : null,
    error: tabError || connectionError,
    incompatible,
    lastAttemptAt: attemptedAt,
    lastSuccessAt: connected ? attemptedAt : lastStatus.lastSuccessAt,
    omittedTabCount,
    settings,
    tabCount: supportedTabs.length,
    truncatedTitleCount,
  };

  notifyPopup(lastStatus);
  scheduleIdentifyingRetry(lastStatus);
  return lastStatus;
}

function startReport() {
  const report = performReport();
  activeReport = report;
  void report.then(
    () => finishReport(report),
    () => finishReport(report),
  );
  return report;
}

function finishReport(report) {
  if (activeReport !== report) {
    return;
  }

  activeReport = undefined;
  if (queuedInteractiveReport) {
    const queuedReport = queuedInteractiveReport;
    queuedInteractiveReport = undefined;
    startReport().then(queuedReport.resolve, queuedReport.reject);
    return;
  }

  if (backgroundReportPending) {
    backgroundReportPending = false;
    startBackgroundReport();
  }
}

function startBackgroundReport() {
  startReport().catch((error) => {
    console.warn("Chune ID report failed:", error);
  });
}

function requestReport() {
  if (!activeReport) {
    return startReport();
  }

  if (!queuedInteractiveReport) {
    let rejectReport;
    let resolveReport;
    const promise = new Promise((resolve, reject) => {
      resolveReport = resolve;
      rejectReport = reject;
    });
    queuedInteractiveReport = {
      promise,
      reject: rejectReport,
      resolve: resolveReport,
    };
  }

  return queuedInteractiveReport.promise;
}

function reportInBackground() {
  if (activeReport) {
    backgroundReportPending = true;
    return;
  }

  startBackgroundReport();
}

async function updateSettings(patch) {
  const validatedPatch = {};

  for (const [key, value] of Object.entries(patch || {})) {
    if (!SETTING_KEYS.includes(key) || typeof value !== "boolean") {
      throw new Error("Invalid setting update.");
    }
    validatedPatch[key] = value;
  }

  if (Object.keys(validatedPatch).length === 0) {
    throw new Error("No settings were provided.");
  }

  await ensureReady();
  const previousSettings = cachedSettings;
  cachedSettings = { ...cachedSettings, ...validatedPatch };

  try {
    await chrome.storage.local.set(validatedPatch);
  } catch (error) {
    cachedSettings = previousSettings;
    throw error;
  }

  return requestReport();
}

function readPlaybackNumber(value, maximum) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum
    ? value
    : null;
}

function readMetadataText(value, required = false) {
  if (typeof value !== "string") {
    return null;
  }
  const text = truncateTitle(value).title.trim();
  return required && !text ? null : text;
}

function allowedArtworkHost(source, hostname) {
  if (source === "Apple Music") return hostname.endsWith(".mzstatic.com");
  if (source === "SoundCloud") return hostname.endsWith(".sndcdn.com");
  return source === "YouTube Music" && new Set([
    "i.ytimg.com",
    "lh3.googleusercontent.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
  ]).has(hostname);
}

function readMetadataArtwork(value, source) {
  if (value === null) {
    return { protocolVersion, track: null, host: null };
  }
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ARTWORK_URL_CHARACTERS) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && allowedArtworkHost(source, url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function readPageMetadata(payload, source) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const title = readMetadataText(payload.title, true);
  const artist = readMetadataText(payload.artist);
  if (title === null || artist === null) {
    return null;
  }
  const metadata = {
    title,
    artist,
    artwork: readMetadataArtwork(payload.artwork, source),
    receivedAt: Date.now(),
  };
  return metadata;
}

function freshPageMetadata(tab) {
  if (tab.tabId === null) {
    return null;
  }
  const cached = tab.source === "Apple Music"
    ? applePlaybackByTab.get(tab.tabId)?.metadata
    : pageMetadataByTab.get(tab.tabId);
  if (!cached || Date.now() - cached.receivedAt > PAGE_METADATA_MAX_AGE_MS) {
    return null;
  }
  return Object.fromEntries(PAGE_METADATA_KEYS.map((key) => [key, cached[key]]));
}

function isAppleSender(sender) {
  if (!sender || typeof sender.tab?.id !== "number") {
    return false;
  }

  try {
    return new URL(sender.url).hostname.toLowerCase() === APPLE_PLAYBACK_HOST;
  } catch {
    return false;
  }
}

function applePlaybackChanged(previous, next) {
  if (!previous) {
    return true;
  }
  if (
    previous.title !== next.title ||
    previous.playing !== next.playing ||
    previous.duration !== next.duration ||
    JSON.stringify(previous.metadata) !== JSON.stringify(next.metadata)
  ) {
    return true;
  }
  const elapsedSeconds =
    previous.playing && next.playing
      ? Math.max(0, (next.sampledAt - previous.sampledAt) / 1000)
      : 0;
  const expectedPosition = previous.position + elapsedSeconds;
  return Math.abs(next.position - expectedPosition) > APPLE_SEEK_THRESHOLD_SECONDS;
}

function storeApplePlayback(sender, payload) {
  if (!isAppleSender(sender) || !payload || typeof payload !== "object") {
    return;
  }

  const position = readPlaybackNumber(payload.position, MAX_PLAYBACK_SECONDS);
  const sampledAt = readPlaybackNumber(payload.sampledAt, Number.MAX_SAFE_INTEGER);
  if (position === null || sampledAt === null) {
    return;
  }

  const playback = {
    position,
    duration: readPlaybackNumber(payload.duration, MAX_PLAYBACK_SECONDS),
    playing: payload.playing === true,
    metadata: readPageMetadata(payload, "Apple Music"),
    sampledAt,
  };
  const previous = applePlaybackByTab.get(sender.tab.id);
  applePlaybackByTab.set(sender.tab.id, playback);
  // Steady playback needs no push: the desktop extrapolates from the last
  // sample. A track change, play/pause flip, populated duration, or seek is
  // reported immediately instead of waiting out the alarm period.
  if (applePlaybackChanged(previous, playback)) {
    reportInBackground();
  }
}

function storePageMetadata(sender, payload) {
  if (!sender || typeof sender.tab?.id !== "number") {
    return;
  }
  let source;
  try {
    source = classifyHost(new URL(sender.url).hostname.toLowerCase());
  } catch {
    return;
  }
  if (source !== "SoundCloud" && source !== "YouTube Music") {
    return;
  }
  const metadata = readPageMetadata(payload, source);
  if (!metadata) {
    return;
  }
  const previous = pageMetadataByTab.get(sender.tab.id);
  pageMetadataByTab.set(sender.tab.id, metadata);
  if (
    !previous ||
    PAGE_METADATA_KEYS.some((key) => previous[key] !== metadata[key])
  ) {
    reportInBackground();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "apple-playback") {
    storeApplePlayback(sender, message.payload);
    return false;
  }

  if (message?.type === "page-metadata") {
    storePageMetadata(sender, message.payload);
    return false;
  }

  if (message?.type === "refresh") {
    requestReport()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Refresh failed.",
        }),
      );
    return true;
  }

  if (message?.type === "update-settings") {
    updateSettings(message.settings)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Update failed.",
        }),
      );
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REPORT_ALARM) {
    reportInBackground();
  }
});

// Manifest content scripts only load on navigation, so an Apple Music tab
// that was already open when the extension installed or updated has no
// MusicKit reader running until it is refreshed. Inject the timing pair into
// those existing tabs once so the correct timing works without a manual
// refresh. The bridge (isolated world) goes first so it is listening before
// the reader (main world) starts posting. Both scripts guard against running
// twice, so a tab that already has them is unaffected.
const PAGE_INJECTION_SERVICES = Object.freeze([
  {
    host: "music.apple.com",
    pattern: "https://music.apple.com/*",
    scripts: [
      { file: "apple-bridge.js", world: "ISOLATED" },
      { file: "apple-inject.js", world: "MAIN" },
    ],
  },
  {
    host: "soundcloud.com",
    pattern: "https://soundcloud.com/*",
    scripts: [
      { file: "soundcloud-bridge.js", world: "ISOLATED" },
      { file: "soundcloud-inject.js", world: "MAIN" },
    ],
  },
  {
    host: "www.soundcloud.com",
    pattern: "https://www.soundcloud.com/*",
    scripts: [
      { file: "soundcloud-bridge.js", world: "ISOLATED" },
      { file: "soundcloud-inject.js", world: "MAIN" },
    ],
  },
  {
    host: "music.youtube.com",
    pattern: "https://music.youtube.com/*",
    scripts: [
      { file: "youtube-music-bridge.js", world: "ISOLATED" },
      { file: "youtube-music-inject.js", world: "MAIN" },
    ],
  },
]);

async function injectPageMetadataScripts() {
  for (const service of PAGE_INJECTION_SERVICES) {
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: service.pattern });
  } catch {
    continue;
  }

  for (const tab of tabs) {
    if (typeof tab.id !== "number") {
      continue;
    }
    try {
      if (new URL(tab.url).hostname.toLowerCase() !== service.host) {
        continue;
      }
    } catch {
      continue;
    }
    for (const { file, world } of service.scripts) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [file],
          world,
        });
      } catch {
        // A restricted or navigating tab cannot be scripted now; the manifest
        // content script will cover it on its next load.
      }
    }
  }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectPageMetadataScripts();
  reportInBackground();
});

chrome.runtime.onStartup.addListener(() => {
  reportInBackground();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if ("url" in changeInfo) {
    applePlaybackByTab.delete(tabId);
    pageMetadataByTab.delete(tabId);
  }
  if ("audible" in changeInfo || "title" in changeInfo || "url" in changeInfo) {
    reportInBackground();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  applePlaybackByTab.delete(tabId);
  pageMetadataByTab.delete(tabId);
  reportInBackground();
});

chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => {
  applePlaybackByTab.delete(removedTabId);
  pageMetadataByTab.delete(removedTabId);
  reportInBackground();
});

ensureReady().catch((error) => {
  console.warn("Chune ID initialization failed:", error);
});
