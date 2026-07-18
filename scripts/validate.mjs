import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function checkFile(relativePath) {
  check(existsSync(join(root, relativePath)), `Referenced file is missing: ${relativePath}`);
}

function checkSha256(relativePath, expectedHash) {
  checkFile(relativePath);
  if (!existsSync(join(root, relativePath))) {
    return;
  }

  const actualHash = createHash("sha256")
    .update(readFileSync(join(root, relativePath)))
    .digest("hex");
  check(actualHash === expectedHash, `${relativePath} is not the canonical generated asset`);
}

function readPngDimensions(relativePath) {
  try {
    const png = readFileSync(join(root, relativePath));
    const signature = "89504e470d0a1a0a";
    check(png.subarray(0, 8).toString("hex") === signature, `${relativePath} is not a PNG`);
    check(png.subarray(12, 16).toString("ascii") === "IHDR", `${relativePath} has no PNG IHDR`);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  } catch (error) {
    errors.push(`Could not inspect ${relativePath}: ${error.message}`);
    return [0, 0];
  }
}

function checkPng(relativePath, width, height) {
  checkFile(relativePath);
  if (!existsSync(join(root, relativePath))) {
    return;
  }
  const actual = readPngDimensions(relativePath);
  check(
    actual[0] === width && actual[1] === height,
    `${relativePath} must be ${width}x${height}, found ${actual[0]}x${actual[1]}`,
  );
}

const manifest = readJson("manifest.json");
const allowlist = readJson("scripts/package-files.json");
const protocolContract = readJson("scripts/protocol-contract.json");

if (protocolContract) {
  check(
    JSON.stringify(protocolContract) ===
      JSON.stringify({
        endpoint: "http://127.0.0.1:52846/tabs",
        request: {
          contentType: "application/json",
          limits: {
            bodyBytes: 32768,
            tabs: 64,
            titleUnicodeCharacters: 512,
          },
          payloadKeys: ["enabled", "services", "tabs"],
          serviceKeys: ["soundcloud", "youtubeMusic"],
          tabKeys: ["host", "title"],
        },
        response: {
          markerHeader: "X-Chunes-Protocol",
          markerValue: "1",
        },
      }),
    "scripts/protocol-contract.json must exactly match the reviewed protocol",
  );
}

if (manifest) {
  const expectedPermissions = ["alarms", "storage"];
  const expectedHosts = [
    "http://127.0.0.1/*",
    "https://soundcloud.com/*",
    "https://www.soundcloud.com/*",
    "https://youtube.com/*",
    "https://www.youtube.com/*",
    "https://m.youtube.com/*",
    "https://music.youtube.com/*",
  ];

  check(manifest.manifest_version === 3, "manifest_version must be 3");
  check(manifest.name === "Chune ID", "manifest name must remain Chune ID");
  check(manifest.version === "1.0.0", "manifest version must remain 1.0.0");
  check(
    manifest.minimum_chrome_version === "120",
    "minimum_chrome_version must be 120 for 30-second alarms",
  );
  check(
    JSON.stringify([...(manifest.permissions || [])].sort()) ===
      JSON.stringify(expectedPermissions.sort()),
    "permissions must contain only alarms and storage",
  );
  check(!(manifest.permissions || []).includes("tabs"), "broad tabs permission is forbidden");
  check(
    !manifest.optional_permissions || manifest.optional_permissions.length === 0,
    "optional_permissions must be absent or empty",
  );
  check(
    !manifest.optional_host_permissions || manifest.optional_host_permissions.length === 0,
    "optional_host_permissions must be absent or empty",
  );
  check(
    JSON.stringify([...(manifest.host_permissions || [])].sort()) ===
      JSON.stringify(expectedHosts.sort()),
    "host_permissions do not match the reviewed narrow host list",
  );
  check(!manifest.content_scripts, "content scripts are not part of the reviewed runtime");
  check(
    manifest.background?.service_worker === "bg.js",
    "background service worker must be bg.js",
  );
  check(manifest.action?.default_title === "Open Chune ID", "action title must remain Open Chune ID");
  check(manifest.action?.default_popup === "popup.html", "action popup must be popup.html");
  check(
    JSON.stringify(manifest.action?.default_icon) ===
      JSON.stringify({ 16: "icons/action-16.png", 32: "icons/action-32.png" }),
    "action icons must use the canonical action assets",
  );
  check(
    JSON.stringify(manifest.icons) ===
      JSON.stringify({
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png",
      }),
    "extension identity icons must use the canonical identity assets",
  );

  const manifestReferences = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.action?.default_icon || {}),
    ...Object.values(manifest.icons || {}),
  ].filter(Boolean);
  for (const relativePath of manifestReferences) {
    checkFile(relativePath);
  }
}

for (const relativePath of ["bg.js", "popup.js"]) {
  const result = spawnSync(process.execPath, ["--check", join(root, relativePath)], {
    encoding: "utf8",
  });
  check(result.status === 0, `${relativePath} syntax check failed: ${result.stderr.trim()}`);
}

const behaviorTest = spawnSync(process.execPath, [join(root, "scripts/test-bg.mjs")], {
  encoding: "utf8",
});
check(
  behaviorTest.status === 0,
  `background behavior tests failed: ${(behaviorTest.stderr || behaviorTest.stdout).trim()}`,
);

const popupHtml = readFileSync(join(root, "popup.html"), "utf8");
const scriptTags = [...popupHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
check(scriptTags.length === 1, "popup.html must have exactly one script tag");
for (const [, attributes, contents] of scriptTags) {
  check(/\bsrc=["']popup\.js["']/i.test(attributes), "popup script must reference popup.js");
  check(contents.trim() === "", "inline script is forbidden");
}
check(!/\son[a-z]+\s*=/i.test(popupHtml), "inline HTML event handlers are forbidden");
check(!/<script[^>]+src=["']https?:/i.test(popupHtml), "remote scripts are forbidden");
for (const id of [
  "connection-text",
  "enabled",
  "refresh",
  "soundcloud",
  "source-name",
  "track-title",
  "youtube-music",
]) {
  check(new RegExp(`\\bid=["']${id}["']`).test(popupHtml), `popup is missing #${id}`);
}
check(popupHtml.includes(">SoundCloud</label>"), "SoundCloud label must remain exact");
check(popupHtml.includes(">YouTube Music</label>"), "YouTube Music label must remain exact");
check(
  popupHtml.includes("Choose what Chunes may publish"),
  "popup settings must describe service switches as publish controls",
);
check(
  popupHtml.includes("Service switches only control publishing."),
  "popup must disclose continued local classification for disabled services",
);
check(
  /data-setting=["']enabled["'][^>]*\bchecked\b/.test(popupHtml),
  "master switch must default to on",
);
check(
  /data-setting=["']soundcloud["'][^>]*\bchecked\b/.test(popupHtml),
  "SoundCloud switch must default to on",
);
check(
  /data-setting=["']youtubeMusic["'][^>]*\bchecked\b/.test(popupHtml),
  "YouTube Music switch must default to on",
);
check(popupHtml.includes("127.0.0.1"), "popup must contain the direct local endpoint disclosure");
check(/>Privacy<\/a>/.test(popupHtml), "popup must link to privacy information");
check(
  popupHtml.includes("https://github.com/getchunes/chunes/blob/main/PRIVACY.md"),
  "popup must link to the Chunes companion privacy policy",
);
check(/>Support<\/a>/.test(popupHtml), "popup must link to support");

for (const match of popupHtml.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
  const reference = match[1];
  if (!/^(?:https?:|#)/.test(reference)) {
    checkFile(reference);
  }
}

const backgroundSource = readFileSync(join(root, "bg.js"), "utf8");
check(
  backgroundSource.includes('const ENDPOINT = "http://127.0.0.1:52846/tabs";'),
  "background endpoint must remain the reviewed loopback /tabs URL",
);
check(
  backgroundSource.includes('const REQUEST_CONTENT_TYPE = "application/json";') &&
    backgroundSource.includes('headers: { "Content-Type": REQUEST_CONTENT_TYPE }'),
  "loopback POST must set Content-Type: application/json",
);
check(
  backgroundSource.includes('const RESPONSE_PROTOCOL_HEADER = "X-Chunes-Protocol";') &&
    backgroundSource.includes('const RESPONSE_PROTOCOL_VERSION = "1";'),
  "background must require the reviewed desktop response marker",
);
check(
  backgroundSource.includes('redirect: "error"'),
  "loopback POST must reject redirects",
);
check(
  backgroundSource.includes("chrome.alarms.get(REPORT_ALARM)"),
  "background must inspect the report alarm before creating it",
);
check(
  backgroundSource.includes("const MAX_REPORTED_TABS = 64;") &&
    backgroundSource.includes("const MAX_TITLE_CHARACTERS = 512;") &&
    backgroundSource.includes("const MAX_REQUEST_BYTES = 32 * 1024;"),
  "background protocol limits must remain explicit",
);
check(
  !backgroundSource.includes("runReportCycle") && !backgroundSource.includes("reportPending"),
  "background reporting must not use the unbounded report-cycle loop",
);
check(!/\beval\s*\(|\bnew Function\s*\(/.test(backgroundSource), "remote-code primitives are forbidden");

const popupSource = readFileSync(join(root, "popup.js"), "utf8");
check(popupSource.includes('soundcloud: true'), "SoundCloud protocol default must remain true");
check(popupSource.includes('youtubeMusic: true'), "YouTube Music protocol default must remain true");
check(popupSource.includes('"SoundCloud"'), "SoundCloud source label must remain exact");
check(popupSource.includes('"YouTube Music"'), "YouTube Music source label must remain exact");
check(
  popupSource.includes("(publishing off)"),
  "popup must label a disabled current service as publishing off",
);
check(
  popupSource.includes("omittedTabCount") &&
    popupSource.includes("truncatedTitleCount") &&
    popupSource.includes("omitted by report limits"),
  "popup must surface omitted-tab and truncated-title counts",
);
check(
  popupSource.includes("connected: true") &&
    popupSource.includes('lastAttemptAt: "2026-07-18T12:00:00.000Z"'),
  "direct-file screenshot fixture must use a runtime-producible attempted status",
);

const popupCss = readFileSync(join(root, "popup.css"), "utf8");
check(!/@import\b|url\(\s*["']?https?:/i.test(popupCss), "remote CSS resources are forbidden");

const expectedPackageFiles = [
  "LICENSE",
  "PRIVACY.md",
  "THIRD_PARTY_NOTICES.md",
  "bg.js",
  "icons/action-16.png",
  "icons/action-32.png",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
];

if (Array.isArray(allowlist)) {
  check(new Set(allowlist).size === allowlist.length, "package allowlist contains duplicates");
  check(
    JSON.stringify([...allowlist].sort()) === JSON.stringify([...expectedPackageFiles].sort()),
    "package allowlist differs from the reviewed runtime file set",
  );
  for (const relativePath of allowlist) {
    checkFile(relativePath);
    check(!relativePath.startsWith("store/"), `store asset is allowlisted: ${relativePath}`);
    check(!relativePath.endsWith(".zip"), `source ZIP is allowlisted: ${relativePath}`);
  }
} else {
  errors.push("scripts/package-files.json must contain an array");
}

for (const [relativePath, width, height] of [
  ["icons/action-16.png", 16, 16],
  ["icons/action-32.png", 32, 32],
  ["icons/icon-16.png", 16, 16],
  ["icons/icon-32.png", 32, 32],
  ["icons/icon-48.png", 48, 48],
  ["icons/icon-128.png", 128, 128],
  ["store/assets/store-promo-440x280.png", 440, 280],
  ["store/screenshots/popup-1280x800.png", 1280, 800],
]) {
  checkPng(relativePath, width, height);
}

const canonicalAssetHashes = {
  "icons/action-16.png": "4fbf69c8d2a34980e131d2d6034004c7b55e366426a764dfbc2862ebb7a7cddd",
  "icons/action-32.png": "b2a60257d8f655d35e704db05d5fa843e90c20523828c87c8c18cabc04fd1f50",
  "icons/icon-16.png": "c1ca672af6ccc63ece4b75347cda7e638ba6b889bbd65c36a01153dfd4c458b2",
  "icons/icon-32.png": "0dc29517a8dbb084263cc25c9c30c4ee380d8a35023906c1bd5d003ade5f653f",
  "icons/icon-48.png": "4f0b8ac84affce8e66cb73df5435b468a334d91b8990edfddaeb44c9930dcfc9",
  "icons/icon-128.png": "aff4bc51a3b193f6fd6fe2a96283ce54d1de17a4c9139f69155370ef0cb744fd",
  "store/assets/store-promo-440x280.png":
    "a3adac4b42992412a6cb62459a40258659341eec123478f597f4c9e3a6756f29",
};
for (const [relativePath, expectedHash] of Object.entries(canonicalAssetHashes)) {
  checkSha256(relativePath, expectedHash);
}

for (const relativePath of [
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "scripts/package.ps1",
  "scripts/validate-package.ps1",
  "scripts/validate.ps1",
  "store/DASHBOARD_CHECKLIST.md",
  "store/LISTING.md",
  "store/PERMISSION_JUSTIFICATIONS.md",
  "store/PRIVACY_DISCLOSURES.md",
  "store/REVIEWER_NOTES.md",
  "store/SUBMISSION.md",
]) {
  checkFile(relativePath);
}

const license = readFileSync(join(root, "LICENSE"), "utf8");
for (const marker of [
  "Apache License",
  "1. Definitions.",
  "9. Accepting Warranty or Additional Liability.",
  "END OF TERMS AND CONDITIONS",
  "Copyright 2026 Chunes contributors",
]) {
  check(license.includes(marker), `LICENSE is missing: ${marker}`);
}

const privacyPolicy = readFileSync(join(root, "PRIVACY.md"), "utf8");
check(
  privacyPolicy.includes("sends listening presence to Discord") &&
    privacyPolicy.includes("title and artist search") &&
    privacyPolicy.includes("getchunes/chunes/blob/main/PRIVACY.md"),
  "privacy policy must disclose downstream companion behavior and link its policy",
);
check(
  privacyPolicy.includes("at most 64 tabs") &&
    privacyPolicy.includes("512 Unicode characters") &&
    privacyPolicy.includes("32 KiB"),
  "privacy policy must disclose all local report limits",
);

const listing = readFileSync(join(root, "store/LISTING.md"), "utf8");
check(
  /Identical or very similar[\s\S]*remain ambiguous/.test(listing),
  "store listing must qualify similar-title overlap handling",
);

const readme = readFileSync(join(root, "README.md"), "utf8");
check(
  /Identical or very similar[\s\S]*remain ambiguous/.test(readme),
  "README must qualify similar-title overlap handling",
);

const dashboardChecklist = readFileSync(join(root, "store/DASHBOARD_CHECKLIST.md"), "utf8");
check(
  dashboardChecklist.includes("never been uploaded to the Chrome Web Store") &&
    dashboardChecklist.includes("Delete the existing zero-download GitHub `v1.0.0` release") &&
    dashboardChecklist.includes("recreate the `v1.0.0` tag and GitHub release"),
  "dashboard checklist must preserve the approved version 1.0.0 release coordination",
);

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Source validation passed.");
}
