import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "bg.js"), "utf8");
const protocolContract = JSON.parse(
  readFileSync(join(root, "scripts/protocol-contract.json"), "utf8"),
);
assert.deepEqual(protocolContract, {
  endpoint: "http://127.0.0.1:52846/tabs",
  request: {
    contentType: "application/json",
    limits: {
      bodyBytes: 32768,
      tabs: 64,
      titleUnicodeCharacters: 512,
    },
    payloadKeys: ["enabled", "services", "tabs"],
    serviceKeys: ["appleMusic", "soundcloud", "youtubeMusic"],
    tabKeys: ["host", "mediaId", "title"],
    appleTabPlaybackKeys: ["position", "duration", "playing", "sampledAt"],
  },
  response: {
    markerHeader: "X-Chunes-Protocol",
    markerValue: "3",
  },
});
const stored = {};
const alarmGets = [];
const alarmsCreated = [];
const consoleLogs = [];
const notifications = [];
const posts = [];
const queries = [];
let existingAlarm;
let queryResults = [
  {
    title: "Artist - SoundCloud track",
    url: "https://soundcloud.com/artist/track",
  },
  {
    title: "Artist - YouTube Music track",
    url: "https://music.youtube.com/watch?v=YtMusic1234",
  },
  {
    title: "Regular YouTube video",
    url: "https://www.youtube.com/watch?v=blocked",
  },
];

function createEvent() {
  let listener;
  return {
    addListener(nextListener) {
      listener = nextListener;
    },
    get listener() {
      assert.equal(typeof listener, "function", "expected event listener to be registered");
      return listener;
    },
  };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function delay(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createResponse({
  protocol = protocolContract.response.markerValue,
  status = 204,
  body,
} = {}) {
  const response = {
    headers: {
      get(name) {
        return name === protocolContract.response.markerHeader ? protocol : null;
      },
    },
    ok: status >= 200 && status < 300,
    status,
  };
  if (body !== undefined) {
    response.json = async () => body;
  }
  return response;
}

let fetchHandler = async () => createResponse();

async function waitFor(predicate, message, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await delay(5);
  }
  assert.fail(message);
}

const events = {
  alarm: createEvent(),
  installed: createEvent(),
  message: createEvent(),
  removed: createEvent(),
  replaced: createEvent(),
  startup: createEvent(),
  updated: createEvent(),
};

const chrome = {
  alarms: {
    async get(name) {
      alarmGets.push(name);
      return existingAlarm;
    },
    async create(name, options) {
      alarmsCreated.push({ name, options: normalize(options) });
      existingAlarm = { name, ...normalize(options) };
    },
    onAlarm: events.alarm,
  },
  runtime: {
    lastError: null,
    onInstalled: events.installed,
    onMessage: events.message,
    onStartup: events.startup,
    sendMessage(message, callback) {
      notifications.push(normalize(message));
      callback?.();
    },
  },
  storage: {
    local: {
      async get(keysOrDefaults) {
        if (Array.isArray(keysOrDefaults)) {
          return Object.fromEntries(
            keysOrDefaults
              .filter((key) => Object.hasOwn(stored, key))
              .map((key) => [key, stored[key]]),
          );
        }

        return Object.fromEntries(
          Object.entries(keysOrDefaults).map(([key, defaultValue]) => [
            key,
            Object.hasOwn(stored, key) ? stored[key] : defaultValue,
          ]),
        );
      },
      async set(patch) {
        Object.assign(stored, normalize(patch));
      },
    },
  },
  tabs: {
    async query(criteria) {
      queries.push(normalize(criteria));
      return queryResults.map((tab) => ({ ...tab }));
    },
    onRemoved: events.removed,
    onReplaced: events.replaced,
    onUpdated: events.updated,
  },
};

const context = vm.createContext({
  AbortController,
  TextEncoder,
  URL,
  chrome,
  clearTimeout,
  console: {
    log(...values) {
      consoleLogs.push(values.map(String).join(" "));
    },
    warn() {},
  },
  fetch: async (url, options) => {
    posts.push({ options: { ...options }, url });
    return fetchHandler(url, options);
  },
  setTimeout,
});

vm.runInContext(source, context, { filename: "bg.js" });
const runtimeProtocolContract = normalize(
  vm.runInContext(
    `({
      endpoint: ENDPOINT,
      request: {
        contentType: REQUEST_CONTENT_TYPE,
        limits: {
          bodyBytes: MAX_REQUEST_BYTES,
          tabs: MAX_REPORTED_TABS,
          titleUnicodeCharacters: MAX_TITLE_CHARACTERS,
        },
        payloadKeys: ["enabled", "services", "tabs"],
        serviceKeys: ["appleMusic", "soundcloud", "youtubeMusic"],
        tabKeys: ["host", "mediaId", "title"],
        appleTabPlaybackKeys: APPLE_PLAYBACK_KEYS,
      },
      response: {
        markerHeader: RESPONSE_PROTOCOL_HEADER,
        markerValue: RESPONSE_PROTOCOL_VERSION,
      },
    })`,
    context,
  ),
);
assert.deepEqual(
  runtimeProtocolContract,
  protocolContract,
  "runtime protocol constants must exactly match the checked-in contract",
);

async function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("runtime response timed out")), 1000);
    const keepChannelOpen = events.message.listener(message, {}, (response) => {
      clearTimeout(timeout);
      resolve(normalize(response));
    });
    assert.equal(keepChannelOpen, true, "runtime request must keep its response channel open");
  });
}

function lastPostBody() {
  return JSON.parse(posts.at(-1).options.body);
}

await waitFor(() => alarmsCreated.length === 1, "background initialization did not create its alarm");
assert.deepEqual(alarmGets, ["report-audible-tabs"], "initialization must check for an existing alarm");
assert.deepEqual(alarmsCreated[0], {
  name: "report-audible-tabs",
  options: { periodInMinutes: 0.5 },
});
assert.deepEqual(stored, {
  enabled: true,
  appleMusic: true,
  soundcloud: true,
  youtubeMusic: true,
});

const firstRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(firstRefresh.ok, true);
assert.equal(firstRefresh.status.connected, true);
assert.equal(firstRefresh.status.incompatible, false);
assert.equal(firstRefresh.status.current.source, "SoundCloud");
assert.equal(firstRefresh.status.current.publishEnabled, true);
assert.equal(firstRefresh.status.current.title, "Artist - SoundCloud track");
assert.equal(firstRefresh.status.tabCount, 2, "blocked YouTube must not be a current supported source");
assert.equal(firstRefresh.status.omittedTabCount, 0);
assert.equal(firstRefresh.status.truncatedTitleCount, 0);
assert.equal(posts[0].url, protocolContract.endpoint);
assert.equal(posts[0].options.method, "POST");
assert.deepEqual(normalize(posts[0].options.headers), {
  "Content-Type": protocolContract.request.contentType,
});
assert.equal(posts[0].options.redirect, "error", "loopback fetch must reject redirects");
assert.equal(
  posts[0].options.body,
  '{"enabled":true,"services":{"appleMusic":true,"soundcloud":true,"youtubeMusic":true},"tabs":[{"host":"soundcloud.com","mediaId":null,"title":"Artist - SoundCloud track"},{"host":"music.youtube.com","mediaId":"YtMusic1234","title":"Artist - YouTube Music track"},{"host":"www.youtube.com","mediaId":null,"title":"Regular YouTube video"}]}',
  "POST body must use the exact reviewed payload shape and protocol keys",
);
assert.deepEqual(Object.keys(lastPostBody()), protocolContract.request.payloadKeys);
assert.deepEqual(Object.keys(lastPostBody().services), protocolContract.request.serviceKeys);
assert.ok(
  lastPostBody().tabs.every(
    (tab) => JSON.stringify(Object.keys(tab)) === JSON.stringify(protocolContract.request.tabKeys),
  ),
  "every tab must use the exact reviewed protocol keys",
);
assert.deepEqual(queries[0], {
  audible: true,
  url: [
    "https://music.apple.com/*",
    "https://soundcloud.com/*",
    "https://www.soundcloud.com/*",
    "https://youtube.com/*",
    "https://www.youtube.com/*",
    "https://m.youtube.com/*",
    "https://music.youtube.com/*",
  ],
});

fetchHandler = async () => createResponse({ protocol: null });
const legacyDesktopRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(legacyDesktopRefresh.status.connected, false);
assert.equal(legacyDesktopRefresh.status.incompatible, true);
assert.match(legacyDesktopRefresh.status.error, /protocol 3 response required/);

fetchHandler = async () => createResponse({ protocol: "1" });
const wrongProtocolRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(wrongProtocolRefresh.status.connected, false);
assert.equal(wrongProtocolRefresh.status.incompatible, true);

fetchHandler = async () => createResponse();
const compatibleDesktopRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(compatibleDesktopRefresh.status.connected, true);
assert.equal(compatibleDesktopRefresh.status.incompatible, false);

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: false, soundcloud: false },
});
assert.equal(lastPostBody().services.soundcloud, false);
assert.ok(
  lastPostBody().tabs.some(({ host }) => host === "soundcloud.com"),
  "disabled services must stay classified",
);
assert.equal(
  lastPostBody().tabs[0].host,
  "music.youtube.com",
  "enabled supported services must precede disabled services",
);
assert.equal(
  notifications.at(-1).status.current.source,
  "YouTube Music",
  "popup current source should prefer a service that may publish",
);
assert.equal(notifications.at(-1).status.current.publishEnabled, true);

const queryCountBeforePause = queries.length;
await sendRuntimeMessage({
  type: "update-settings",
  settings: { enabled: false },
});
assert.equal(queries.length, queryCountBeforePause, "master off must not query tabs");
assert.deepEqual(lastPostBody(), {
  enabled: false,
  services: { appleMusic: false, soundcloud: false, youtubeMusic: true },
  tabs: [],
});

await sendRuntimeMessage({ type: "refresh" });
assert.equal(queries.length, queryCountBeforePause, "popup refresh must not query tabs while paused");
assert.equal(lastPostBody().enabled, false);

events.alarm.listener({ name: "unrelated-alarm" });
await delay(20);
const postCountBeforeAlarm = posts.length;
events.alarm.listener({ name: "report-audible-tabs" });
await waitFor(() => posts.length === postCountBeforeAlarm + 1, "alarm did not report");
assert.equal(queries.length, queryCountBeforePause, "paused alarm must not query tabs");

events.updated.listener(1, { favIconUrl: "https://example.test/favicon.ico" });
await delay(20);
const postCountBeforeTabEvents = posts.length;
events.updated.listener(1, { audible: true });
await waitFor(() => posts.length === postCountBeforeTabEvents + 1, "tab update did not report");
events.removed.listener(1, {});
await waitFor(() => posts.length === postCountBeforeTabEvents + 2, "tab removal did not report");
events.replaced.listener(2, 1);
await waitFor(() => posts.length === postCountBeforeTabEvents + 3, "tab replacement did not report");
assert.equal(queries.length, queryCountBeforePause, "paused tab reports must not query tabs");
assert.equal(lastPostBody().enabled, false, "paused tab event must send a heartbeat");

await sendRuntimeMessage({
  type: "update-settings",
  settings: { youtubeMusic: false },
});
assert.equal(queries.length, queryCountBeforePause, "paused settings report must not query tabs");

await sendRuntimeMessage({
  type: "update-settings",
  settings: { enabled: true },
});
assert.deepEqual(lastPostBody().services, {
  appleMusic: false,
  soundcloud: false,
  youtubeMusic: false,
});
assert.deepEqual(
  lastPostBody().tabs.map(({ host }) => host),
  ["soundcloud.com", "music.youtube.com", "www.youtube.com"],
  "both disabled services and regular YouTube must stay classified",
);
assert.equal(notifications.at(-1).status.current.source, "SoundCloud");
assert.equal(
  notifications.at(-1).status.current.publishEnabled,
  false,
  "a disabled current source must be explicitly marked as not publishable",
);

queryResults = [
  {
    title: "Regular YouTube only",
    url: "https://youtube.com/watch?v=blocked",
  },
];
const regularYouTubeRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(regularYouTubeRefresh.status.current, null);
assert.equal(regularYouTubeRefresh.status.tabCount, 0);
assert.equal(lastPostBody().tabs[0].host, "youtube.com", "regular YouTube must be reported as blocked");

queryResults = [
  {
    title: "YouTube Music title",
    url: "https://music.youtube.com/watch?v=music",
  },
];
const youtubeMusicRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(youtubeMusicRefresh.status.current.source, "YouTube Music");
assert.equal(youtubeMusicRefresh.status.current.title, "YouTube Music title");
assert.equal(
  lastPostBody().tabs[0].mediaId,
  null,
  "malformed YouTube Music video IDs must not be reported",
);

queryResults = [
  {
    title: "SoundCloud title",
    url: "https://www.soundcloud.com/artist/track",
  },
];
const soundCloudRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(soundCloudRefresh.status.current.source, "SoundCloud");
assert.equal(soundCloudRefresh.status.current.title, "SoundCloud title");

queryResults = [{ url: "https://soundcloud.com/artist/untitled" }];
await sendRuntimeMessage({ type: "refresh" });
assert.equal(lastPostBody().tabs[0].title, "", "missing titles must preserve the empty protocol value");

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: true, soundcloud: true, youtubeMusic: true },
});

queryResults = [
  {
    title: "Album - Album by Artist - Apple Music",
    url: "https://music.apple.com/us/album/album/12345",
  },
];
const appleMusicRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(appleMusicRefresh.status.current.source, "Apple Music");
assert.equal(appleMusicRefresh.status.current.publishEnabled, true);
assert.equal(appleMusicRefresh.status.tabCount, 1);
assert.deepEqual(lastPostBody().tabs, [
  {
    host: "music.apple.com",
    mediaId: null,
    title: "Album - Album by Artist - Apple Music",
  },
]);
assert.equal(lastPostBody().services.appleMusic, true);
assert.deepEqual(
  Object.keys(lastPostBody().services),
  protocolContract.request.serviceKeys,
  "Apple Music must use its reviewed services flag in the payload",
);

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: false },
});
assert.equal(
  lastPostBody().services.appleMusic,
  false,
  "the services flag must gate Apple Music publishing while tabs stay reported",
);
assert.deepEqual(lastPostBody().tabs, [
  {
    host: "music.apple.com",
    mediaId: null,
    title: "Album - Album by Artist - Apple Music",
  },
]);
const disabledAppleMusicStatus = notifications.at(-1).status;
assert.equal(disabledAppleMusicStatus.current.source, "Apple Music");
assert.equal(
  disabledAppleMusicStatus.current.publishEnabled,
  false,
  "the popup must still show a disabled Apple Music tab locally",
);
assert.equal(disabledAppleMusicStatus.tabCount, 1);
assert.equal(disabledAppleMusicStatus.omittedTabCount, 0);

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: true },
});

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: false, soundcloud: false },
});
queryResults = [
  ...Array.from({ length: 64 }, (_, index) => ({
    title: `Blocked video ${index}`,
    url: `https://youtube.com/watch?v=priority-${index}`,
  })),
  {
    title: "Disabled SoundCloud track",
    url: "https://soundcloud.com/artist/disabled-priority",
  },
  {
    title: "Enabled YouTube Music track",
    url: "https://music.youtube.com/watch?v=enabled-priority",
  },
];
const priorityRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(lastPostBody().tabs.length, protocolContract.request.limits.tabs);
assert.deepEqual(
  lastPostBody().tabs.slice(0, 2).map(({ host }) => host),
  ["music.youtube.com", "soundcloud.com"],
  "enabled, disabled, and blocked tabs must be prioritized before applying the tab cap",
);
assert.ok(
  lastPostBody()
    .tabs.slice(2)
    .every(({ host }) => host === "youtube.com"),
  "blocked regular YouTube tabs must be considered last",
);
assert.equal(priorityRefresh.status.tabCount, 2);
assert.equal(priorityRefresh.status.omittedTabCount, 2);
assert.equal(priorityRefresh.status.truncatedTitleCount, 0);

await sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: true, soundcloud: true },
});
queryResults = Array.from({ length: 65 }, (_, index) => ({
  title: `Track ${index}`,
  url: `https://soundcloud.com/artist/track-${index}`,
}));
const maximumTabRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  lastPostBody().tabs.length,
  protocolContract.request.limits.tabs,
  "reports must include at most the contracted number of tabs",
);
assert.equal(maximumTabRefresh.status.tabCount, protocolContract.request.limits.tabs);
assert.equal(maximumTabRefresh.status.omittedTabCount, 1);
assert.equal(maximumTabRefresh.status.truncatedTitleCount, 0);

queryResults = [
  {
    title: "\u{1f3b5}".repeat(513),
    url: "https://music.youtube.com/watch?v=long-title",
  },
];
const truncatedTitleRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  Array.from(lastPostBody().tabs[0].title).length,
  protocolContract.request.limits.titleUnicodeCharacters,
  "titles must be limited to the contracted number of Unicode characters",
);
assert.equal(
  lastPostBody().tabs[0].title,
  "\u{1f3b5}".repeat(protocolContract.request.limits.titleUnicodeCharacters),
);
assert.equal(truncatedTitleRefresh.status.omittedTabCount, 0);
assert.equal(truncatedTitleRefresh.status.truncatedTitleCount, 1);

const maximumTitle = "\u{1f3b5}".repeat(protocolContract.request.limits.titleUnicodeCharacters);
const overlongTitle = `${maximumTitle}\u{1f3b5}`;
queryResults = Array.from({ length: 64 }, (_, index) => ({
  title: overlongTitle,
  url: `https://soundcloud.com/artist/large-${index}`,
}));
const boundedBodyRefresh = await sendRuntimeMessage({ type: "refresh" });
const boundedBody = posts.at(-1).options.body;
const boundedPayload = JSON.parse(boundedBody);
assert.ok(
  Buffer.byteLength(boundedBody, "utf8") <= protocolContract.request.limits.bodyBytes,
  "request body must not exceed the contracted byte limit",
);
assert.ok(
  boundedPayload.tabs.length < protocolContract.request.limits.tabs,
  "body limit must take precedence over the tab limit",
);
assert.ok(
  boundedPayload.tabs.every(
    ({ title }) =>
      Array.from(title).length <= protocolContract.request.limits.titleUnicodeCharacters,
  ),
);
assert.equal(boundedBodyRefresh.status.omittedTabCount, 64 - boundedPayload.tabs.length);
assert.equal(boundedBodyRefresh.status.truncatedTitleCount, boundedPayload.tabs.length);
const firstOmittedTab = { host: "soundcloud.com", mediaId: null, title: maximumTitle };
assert.ok(
  Buffer.byteLength(
    JSON.stringify({ ...boundedPayload, tabs: [...boundedPayload.tabs, firstOmittedTab] }),
    "utf8",
  ) >
    protocolContract.request.limits.bodyBytes,
  "the first deterministically omitted tab must cross the body limit",
);
await sendRuntimeMessage({ type: "refresh" });
assert.equal(posts.at(-1).options.body, boundedBody, "bounded serialization must be deterministic");

queryResults = [
  ...Array.from({ length: 15 }, (_, index) => ({
    title: overlongTitle,
    url: `https://soundcloud.com/artist/fill-${index}`,
  })),
  {
    title: overlongTitle,
    url: "https://soundcloud.com/artist/does-not-fit",
  },
  {
    title: "Fits",
    url: "https://soundcloud.com/artist/fits",
  },
];
const fitAfterOmissionRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(lastPostBody().tabs.length, 16);
assert.equal(
  lastPostBody().tabs.at(-1).title,
  "Fits",
  "a smaller later tab must be added after a body candidate does not fit",
);
assert.ok(
  Buffer.byteLength(posts.at(-1).options.body, "utf8") <=
    protocolContract.request.limits.bodyBytes,
);
assert.equal(fitAfterOmissionRefresh.status.omittedTabCount, 1);
assert.equal(fitAfterOmissionRefresh.status.truncatedTitleCount, 15);

queryResults = [
  {
    title: "Coalesced SoundCloud track",
    url: "https://soundcloud.com/artist/coalesced",
  },
];
const backgroundFirstGate = createDeferred();
const backgroundFollowUpGate = createDeferred();
let backgroundFetchCount = 0;
fetchHandler = async () => {
  backgroundFetchCount += 1;
  return backgroundFetchCount === 1
    ? backgroundFirstGate.promise
    : backgroundFollowUpGate.promise;
};

const postCountBeforeBackgroundBurst = posts.length;
events.updated.listener(1, { title: "background burst started" });
await waitFor(
  () => posts.length === postCountBeforeBackgroundBurst + 1,
  "first background report did not start",
);
for (let index = 0; index < 50; index += 1) {
  events.updated.listener(1, { title: `background burst ${index}` });
  events.removed.listener(index, {});
}
await delay(20);
assert.equal(
  posts.length,
  postCountBeforeBackgroundBurst + 1,
  "background events must not start parallel reports",
);
backgroundFirstGate.resolve(createResponse());
await waitFor(
  () => posts.length === postCountBeforeBackgroundBurst + 2,
  "coalesced detached background follow-up did not start",
);
backgroundFollowUpGate.resolve(createResponse());
await delay(20);
assert.equal(
  posts.length,
  postCountBeforeBackgroundBurst + 2,
  "finite background events must coalesce to one detached follow-up",
);

const currentGate = createDeferred();
const interactiveGate = createDeferred();
const detachedGate = createDeferred();
const interactiveGates = [currentGate, interactiveGate, detachedGate];
let interactiveFetchCount = 0;
fetchHandler = async () => {
  const gate = interactiveGates[interactiveFetchCount];
  interactiveFetchCount += 1;
  return gate ? gate.promise : createResponse();
};

const postCountBeforeInteractiveBurst = posts.length;
events.updated.listener(1, { title: "interactive current report" });
await waitFor(
  () => posts.length === postCountBeforeInteractiveBurst + 1,
  "current background report did not start",
);
const refreshDuringBurst = sendRuntimeMessage({ type: "refresh" });
const settingDuringBurst = sendRuntimeMessage({
  type: "update-settings",
  settings: { appleMusic: false, soundcloud: false },
});
events.updated.listener(1, { title: "changed" });
events.updated.listener(1, { audible: true });
events.removed.listener(1, {});
events.replaced.listener(2, 1);
await waitFor(() => stored.soundcloud === false, "coalesced setting was not stored");
await delay(20);
assert.equal(
  posts.length,
  postCountBeforeInteractiveBurst + 1,
  "interactive and background requests must not start parallel reports",
);

currentGate.resolve(createResponse());
await waitFor(
  () => posts.length === postCountBeforeInteractiveBurst + 2,
  "bounded interactive report did not start",
);
assert.equal(
  JSON.parse(posts.at(-1).options.body).services.soundcloud,
  false,
  "interactive report must reflect the requested setting",
);
events.updated.listener(1, { audible: true });
events.removed.listener(1, {});
interactiveGate.resolve(createResponse());
await waitFor(
  () => posts.length === postCountBeforeInteractiveBurst + 3,
  "detached background follow-up did not start",
);

const [refreshBurstResponse, settingBurstResponse] = await Promise.all([
  refreshDuringBurst,
  settingDuringBurst,
]);
assert.equal(refreshBurstResponse.status.settings.soundcloud, false);
assert.equal(settingBurstResponse.status.settings.soundcloud, false);
assert.equal(refreshBurstResponse.status.current.publishEnabled, false);
assert.equal(
  posts.length,
  postCountBeforeInteractiveBurst + 3,
  "interactive promises must not wait for the detached background follow-up",
);
detachedGate.resolve(createResponse());
await delay(20);
assert.equal(
  posts.length,
  postCountBeforeInteractiveBurst + 3,
  "finite interactive burst created a report backlog",
);

fetchHandler = async () => createResponse();
await sendRuntimeMessage({
  type: "update-settings",
  settings: { soundcloud: true, youtubeMusic: true },
});

let activeSustainedFetches = 0;
let maximumSustainedFetches = 0;
fetchHandler = async () => {
  activeSustainedFetches += 1;
  maximumSustainedFetches = Math.max(maximumSustainedFetches, activeSustainedFetches);
  try {
    await delay(15);
    return createResponse();
  } finally {
    activeSustainedFetches -= 1;
  }
};

const postCountBeforeSustainedEvents = posts.length;
events.updated.listener(1, { title: "sustained current report" });
await waitFor(
  () => posts.length === postCountBeforeSustainedEvents + 1,
  "sustained-event current report did not start",
);
const sustainedEvents = setInterval(() => {
  events.updated.listener(1, { title: "sustained event" });
  events.removed.listener(1, {});
}, 1);
const sustainedRefresh = sendRuntimeMessage({ type: "refresh" });
const sustainedSetting = sendRuntimeMessage({
  type: "update-settings",
  settings: { youtubeMusic: false },
});
let sustainedResponses;
try {
  sustainedResponses = await Promise.all([sustainedRefresh, sustainedSetting]);
} finally {
  clearInterval(sustainedEvents);
}

assert.equal(sustainedResponses[0].status.settings.youtubeMusic, false);
assert.equal(sustainedResponses[1].status.settings.youtubeMusic, false);
assert.equal(
  maximumSustainedFetches,
  1,
  "sustained background events must never create concurrent reports",
);
assert.ok(
  posts.length <= postCountBeforeSustainedEvents + 3,
  "sustained events created more than one current and one detached successor",
);

let sustainedReportsSettled = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const reportCount = posts.length;
  await delay(25);
  if (activeSustainedFetches === 0 && posts.length === reportCount) {
    sustainedReportsSettled = true;
    break;
  }
}
assert.equal(sustainedReportsSettled, true, "detached sustained-event reports did not settle");
assert.ok(
  posts.length <= postCountBeforeSustainedEvents + 4,
  "sustained events accumulated a background report backlog",
);

fetchHandler = async () => createResponse();
await sendRuntimeMessage({
  type: "update-settings",
  settings: { youtubeMusic: true },
});

queryResults = [
  {
    title: "Album - Album by Artist - Apple Music",
    url: "https://music.apple.com/us/album/album/12345",
  },
];
fetchHandler = async () =>
  createResponse({
    body: { status: "ok", track: "Real Song - Real Artist", host: "music.apple.com" },
  });
const appleHostMatchRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  appleHostMatchRefresh.status.current.title,
  "Real Song - Real Artist",
  "a host-matched desktop track must be shown for the currently audible Apple Music tab",
);

fetchHandler = async () =>
  createResponse({
    body: { status: "ok", track: "Cloud Song - Cloud Artist", host: "soundcloud.com" },
  });
const appleHostMismatchRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  appleHostMismatchRefresh.status.current.title,
  "",
  "a desktop track published for a different host must never label the Apple Music tab",
);

fetchHandler = async () =>
  createResponse({ body: { status: "ok", track: null, host: null } });
const appleNoDesktopTrackRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  appleNoDesktopTrackRefresh.status.current.title,
  "",
  "Apple Music must show an empty title (popup placeholder) until the app publishes a real track",
);

fetchHandler = async () => createResponse();

queryResults = [
  {
    title: "Album - Album by Artist - Apple Music",
    url: "https://music.apple.com/us/album/album/55555",
  },
];
const identifyingRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  identifyingRefresh.status.current.title,
  "",
  "sanity: an unmatched Apple Music tab starts in the identifying state",
);

const postCountBeforeIdentifyingRetry = posts.length;
fetchHandler = async () =>
  createResponse({
    body: {
      status: "ok",
      track: "Resolved Song - Resolved Artist",
      host: "music.apple.com",
    },
  });
await waitFor(
  () => posts.length === postCountBeforeIdentifyingRetry + 1,
  "an unresolved tab must automatically retry once the app may have resolved it",
  500,
);
assert.equal(
  notifications.at(-1).status.current.title,
  "Resolved Song - Resolved Artist",
  "the automatic retry must pick up the desktop track once it resolves",
);

fetchHandler = async () => createResponse();

queryResults = [
  {
    title: "YouTube Music",
    url: "https://music.youtube.com/watch?v=stillLoading",
  },
];
const ytmGenericTitleRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  ytmGenericTitleRefresh.status.current.title,
  "",
  "YouTube Music's own generic placeholder title must not be shown as if it were a real track",
);

queryResults = [
  {
    title: "Real Song | YouTube Music",
    url: "https://music.youtube.com/watch?v=realTrack",
  },
];
const ytmRealTitleRefresh = await sendRuntimeMessage({ type: "refresh" });
assert.equal(
  ytmRealTitleRefresh.status.current.title,
  "Real Song | YouTube Music",
  "a real YouTube Music tab title must still be shown once the page has updated it",
);

function applePlaybackEntry(tabId) {
  return normalize(
    vm.runInContext(`applePlaybackByTab.get(${tabId}) ?? null`, context),
  );
}

const appleSender = {
  tab: { id: 7 },
  url: "https://music.apple.com/us/album/sample/123",
};
const applePayload = {
  position: 12.5,
  duration: 207,
  playing: true,
  title: "Sample Track",
  sampledAt: 1750000000000,
};
const postsBeforeAppleStore = posts.length;
assert.equal(
  events.message.listener(
    { type: "apple-playback", payload: applePayload },
    appleSender,
    () => {},
  ),
  false,
  "apple-playback must not hold the response channel open",
);
assert.deepEqual(
  applePlaybackEntry(7),
  {
    position: 12.5,
    duration: 207,
    playing: true,
    title: "Sample Track",
    sampledAt: 1750000000000,
  },
  "a valid Apple playback snapshot must be stored for its tab",
);
await waitFor(
  () => posts.length === postsBeforeAppleStore + 1,
  "a first playback sample must push a report",
);

events.message.listener(
  {
    type: "apple-playback",
    payload: { ...applePayload, position: 15.5, sampledAt: 1750000003000 },
  },
  appleSender,
  () => {},
);
await delay(30);
assert.equal(
  posts.length,
  postsBeforeAppleStore + 1,
  "steady playback heartbeats must not push reports",
);

events.message.listener(
  {
    type: "apple-playback",
    payload: { ...applePayload, position: 100, sampledAt: 1750000006000 },
  },
  appleSender,
  () => {},
);
await waitFor(
  () => posts.length === postsBeforeAppleStore + 2,
  "a seek must push a report",
);

events.message.listener(
  { type: "apple-playback", payload: applePayload },
  { tab: { id: 8 }, url: "https://soundcloud.com/artist/track" },
  () => {},
);
assert.equal(applePlaybackEntry(8), null, "non-Apple senders must be ignored");

events.message.listener(
  { type: "apple-playback", payload: { ...applePayload, position: -1 } },
  { ...appleSender, tab: { id: 9 } },
  () => {},
);
events.message.listener(
  { type: "apple-playback", payload: { ...applePayload, sampledAt: "now" } },
  { ...appleSender, tab: { id: 9 } },
  () => {},
);
assert.equal(applePlaybackEntry(9), null, "invalid playback payloads must be ignored");

events.message.listener(
  {
    type: "apple-playback",
    payload: {
      position: 3,
      duration: -5,
      playing: "yes",
      title: 42,
      sampledAt: 1750000000001,
    },
  },
  { ...appleSender, tab: { id: 10 } },
  () => {},
);
assert.deepEqual(
  applePlaybackEntry(10),
  { position: 3, duration: null, playing: false, title: "", sampledAt: 1750000000001 },
  "malformed optional playback fields must be normalized, not trusted",
);

events.removed.listener(10, {});
assert.equal(
  applePlaybackEntry(10),
  null,
  "closed tabs must drop their stored playback state",
);
await delay(20);

queryResults = [
  {
    id: 7,
    title: "Album - Album by Artist - Apple Music",
    url: "https://music.apple.com/us/album/album/12345",
  },
];
await sendRuntimeMessage({ type: "refresh" });
assert.deepEqual(
  lastPostBody().tabs,
  [
    {
      host: "music.apple.com",
      mediaId: null,
      title: "Album - Album by Artist - Apple Music",
      position: 100,
      duration: 207,
      playing: true,
      sampledAt: 1750000006000,
    },
  ],
  "an audible Apple tab must carry its stored playback sample in the report",
);

queryResults = [
  {
    id: 55,
    title: "Album - Album by Artist - Apple Music",
    url: "https://music.apple.com/us/album/album/12345",
  },
];
await sendRuntimeMessage({ type: "refresh" });
assert.deepEqual(
  lastPostBody().tabs,
  [
    {
      host: "music.apple.com",
      mediaId: null,
      title: "Album - Album by Artist - Apple Music",
    },
  ],
  "an Apple tab without a stored sample must report plain tab keys only",
);

// Leave the suite on a resolved title: an unidentified Apple tab keeps the
// 2-second identifying retry armed, which would hold the process open.
queryResults = [
  {
    title: "Real Song | YouTube Music",
    url: "https://music.youtube.com/watch?v=RealSong123",
  },
];
await sendRuntimeMessage({ type: "refresh" });
await delay(20);

const alarmCreateCount = alarmsCreated.length;
const alarmGetCount = alarmGets.length;
const secondContext = vm.createContext({
  AbortController,
  TextEncoder,
  URL,
  chrome,
  clearTimeout,
  console: { warn() {} },
  fetch: async (url, options) => {
    posts.push({ options: { ...options }, url });
    return createResponse();
  },
  setTimeout,
});
vm.runInContext(source, secondContext, { filename: "bg-second-worker.js" });
await waitFor(() => alarmGets.length === alarmGetCount + 1, "restarted worker did not inspect its alarm");
assert.equal(
  alarmsCreated.length,
  alarmCreateCount,
  "restarted worker must not reset an existing report alarm",
);
assert.ok(notifications.some(({ type }) => type === "status-updated"));

console.log("Background behavior tests passed.");
