"use strict";

const ENDPOINT = "http://127.0.0.1:52846/tabs";
const REPORT_ALARM = "report-audible-tabs";
const REPORT_PERIOD_MINUTES = 0.5;
const REQUEST_TIMEOUT_MS = 3000;
const REQUEST_CONTENT_TYPE = "application/json";
const RESPONSE_PROTOCOL_HEADER = "X-Chunes-Protocol";
const RESPONSE_PROTOCOL_VERSION = "2";
const MAX_REPORTED_TABS = 64;
const MAX_TITLE_CHARACTERS = 512;
const MAX_REQUEST_BYTES = 32 * 1024;
const textEncoder = new TextEncoder();
const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  soundcloud: true,
  youtubeMusic: true,
});
const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));
const SUPPORTED_URL_PATTERNS = Object.freeze([
  "https://soundcloud.com/*",
  "https://www.soundcloud.com/*",
  "https://youtube.com/*",
  "https://www.youtube.com/*",
  "https://m.youtube.com/*",
  "https://music.youtube.com/*",
]);

let cachedSettings = { ...DEFAULT_SETTINGS };
let readyPromise;
let activeReport;
let queuedInteractiveReport;
let backgroundReportPending = false;
let lastStatus = {
  connected: null,
  current: null,
  error: null,
  incompatible: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  omittedTabCount: 0,
  settings: { ...DEFAULT_SETTINGS },
  tabCount: 0,
  truncatedTitleCount: 0,
};

function classifyHost(host) {
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
  return source === "SoundCloud"
    ? settings.soundcloud
    : source === "YouTube Music" && settings.youtubeMusic;
}

function reportPriority(tab, settings) {
  if (canPublish(tab.source, settings)) {
    return 0;
  }
  return tab.source === "YouTube (blocked)" ? 2 : 1;
}

function buildReport(settings, classifiedTabs) {
  const payload = {
    enabled: settings.enabled,
    services: {
      soundcloud: settings.soundcloud,
      youtubeMusic: settings.youtubeMusic,
    },
    tabs: [],
  };
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
    payload.tabs.push({
      host: reportedTab.host,
      mediaId: reportedTab.mediaId,
      title: reportedTab.title,
    });
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

async function postReport(body) {
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
    if (response.headers.get(RESPONSE_PROTOCOL_HEADER) !== RESPONSE_PROTOCOL_VERSION) {
      const error = new Error("Chunes desktop is incompatible (protocol 2 response required).");
      error.name = "ChunesProtocolError";
      throw error;
    }
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

  const { body, omittedTabCount, reportedTabs, truncatedTitleCount } = buildReport(
    settings,
    classifiedTabs,
  );
  const supportedTabs = reportedTabs.filter(
    ({ source }) => source !== "YouTube (blocked)",
  );
  const currentTab =
    supportedTabs.find(({ source }) => canPublish(source, settings)) || supportedTabs[0];
  const attemptedAt = new Date().toISOString();
  let connected = false;
  let connectionError = null;
  let incompatible = false;

  try {
    await postReport(body);
    connected = true;
  } catch (error) {
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

  lastStatus = {
    connected,
    current: currentTab
      ? {
          host: currentTab.host,
          publishEnabled: canPublish(currentTab.source, settings),
          source: currentTab.source,
          title: currentTab.title,
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

chrome.runtime.onInstalled.addListener(() => {
  reportInBackground();
});

chrome.runtime.onStartup.addListener(() => {
  reportInBackground();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if ("audible" in changeInfo || "title" in changeInfo || "url" in changeInfo) {
    reportInBackground();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  reportInBackground();
});

chrome.tabs.onReplaced.addListener(() => {
  reportInBackground();
});

ensureReady().catch((error) => {
  console.warn("Chune ID initialization failed:", error);
});
