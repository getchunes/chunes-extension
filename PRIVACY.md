# Chune ID Privacy Policy

Effective date: July 19, 2026

Chune ID is a local companion extension for the Chunes desktop application.
Its single purpose is to identify supported audible browser tabs so Chunes can
show the correct music presence and suppress regular YouTube audio.

## Data handled

When **Chune ID enabled** is on, the extension queries currently audible tabs
only on its declared SoundCloud, YouTube, and Apple Music hosts. For matching
tabs, it reads:

- the tab URL, used in memory only to determine the hostname; and
- the tab title, which can contain website content such as a track, artist, or video title.

For each matching tab, the extension sends its hostname and title alongside the
master and three service booleans. Protocol 4 also sends the current page Media
Session title, artist, and provider-hosted artwork URL when available. For a
YouTube Music watch page, it also sends the page's 11-character public video ID.
Apple Music adds bounds-checked MusicKit timing. It does not send a full URL or
general browsing history. The Chrome Web Store classifies this limited handling
under the **web history** and **website content** data categories because
hostnames, tab titles, media identifiers, and now-playing metadata are involved.

Each local report contains at most 64 tabs and has a serialized UTF-8 limit of
32 KiB. Each title is truncated to at most 512 Unicode characters, and each
YouTube Music video ID is validated before reporting. Within those limits,
enabled SoundCloud, YouTube Music, and Apple Music tabs are considered first,
then disabled supported services, then blocked regular YouTube tabs. Tabs that
do not fit are omitted, and the popup shows omitted-tab and truncated-title
counts.

Service controls do not stop local classification. If SoundCloud, YouTube
Music, or Apple Music is disabled, matching audible tabs are still reported to
Chunes with the disabled setting so the desktop app can suppress that source
rather than treat it as generic browser audio. Regular YouTube is always
classified as blocked, regardless of the YouTube Music setting.

When **Chune ID enabled** is off, the extension does not query tabs. It sends a
minimal heartbeat containing `enabled: false`, the three service settings, and
an empty tab list so Chunes can clear presence and the popup can continue to
show desktop connection status.

## Local communication

Every report is an HTTP POST with a JSON content type to
`http://127.0.0.1:52846/tabs`. `127.0.0.1` is the loopback interface: traffic
for this direct extension request stays on the user's computer and is intended
only for the locally installed Chunes desktop app. HTTP is used because that
request never leaves the loopback interface and a local TLS certificate would
not provide a practical trust benefit. Chune ID itself makes no direct request
to Discord, SoundCloud, YouTube Music, or Apple Music APIs, Chunes-operated
servers, or another external application service.

## Downstream Chunes behavior

After Chune ID sends a report locally, the separate Chunes desktop companion
controls downstream presence and artwork behavior. For enabled SoundCloud,
YouTube Music, and Apple Music sources, Chunes sends listening presence to
Discord. If the user enables optional album-art behavior in the companion,
protocol 4 uses the provider-hosted artwork URL already transferred locally.
Protocol 3 uses temporary legacy SoundCloud/YouTube Music fallbacks while the
Store update is pending; Apple Music without page artwork can use Apple's public
iTunes Search API (itunes.apple.com/search, keyless). Those network requests
are made by Chunes, not directly by this extension, and are subject to the
companion's controls and
[Privacy Policy](https://github.com/getchunes/chunes/blob/main/PRIVACY.md).

## Settings and retention

The master, SoundCloud, YouTube Music, and Apple Music switches are stored in
`chrome.storage.local`, never Chrome sync. They remain in the browser profile
until changed, cleared through browser controls, or removed with the extension.

Tab hostnames, titles, current Media Session metadata, YouTube Music video IDs,
connection results, and request payloads are not written to extension storage. They exist only transiently
while the extension service worker prepares a report or keeps the latest status
in memory. That memory is discarded when Chrome stops the worker. This policy
covers Chune ID; the Chunes desktop application's own behavior is documented
separately in its project.

## No sale, unrelated transfer, or profiling

Chune ID has no analytics, advertising, tracking pixels, developer-operated
data storage, or user accounts. The extension does not sell personal or
sensitive data, use it for credit or lending decisions, or use it for
advertising, profiling, or purposes unrelated to its stated functionality. Its
direct transfer is to local Chunes; the functional downstream Discord presence
and optional SoundCloud, YouTube Music, or Apple Music album-art behavior are
described above. No person reviews tab data through this extension.

## Chrome Web Store Limited Use

Chune ID's use of information received from Chrome APIs complies with the
Chrome Web Store User Data Policy, including its Limited Use requirements.
Chrome API data is used only to provide the extension's prominent, user-facing
single purpose, including the disclosed local companion transfer and its
presence/artwork behavior, and is not transferred or used for unrelated
purposes.

## Security

The extension uses Manifest V3, contains no remote code or inline script, and
sets `Content-Type: application/json` on loopback reports. It requests host
access only for the local endpoint and the supported SoundCloud, YouTube, and
Apple Music pages needed to read audible tab hostnames, titles, current Media
Session metadata, and a YouTube Music video ID.

## Your choices

Use the popup's master switch to stop all tab queries and track reporting. The
service switches control which supported services Chunes may publish, but
matching track data still goes to local Chunes for suppression while the master
is on. Optional album-art behavior is controlled separately in Chunes.
Removing the extension deletes its local extension storage according to
Chrome's normal uninstall behavior.

## Changes and contact

Material policy changes will be published in this repository with an updated
effective date. For privacy questions or support, open a
[GitHub Issue](https://github.com/getchunes/chunes-extension/issues). GitHub
Issues are public, so do not include sensitive information.
