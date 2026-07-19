# Chrome Web Store Permission Justifications

These are paste-ready answers for the dashboard's permission-justification
fields.

## `alarms`

Chune ID refreshes local browser classification every 30 seconds while its
toolbar popup is closed. The alarm wakes the Manifest V3 service worker to send
that update to the Chunes desktop app on the same computer.

## `storage`

Chune ID stores only four booleans in `chrome.storage.local`: master enabled,
SoundCloud enabled, YouTube Music enabled, and Apple Music enabled. All default
to on. The extension does not use sync storage.

The SoundCloud and YouTube Music values control what the companion may publish,
not whether local classification occurs. While the master is on, matching
track data is still sent to local Chunes for suppression when either service is
disabled. Turning off the Apple Music value also stops Apple Music tabs from
being reported. Only the master setting stops all tab queries and track
reporting.

## `http://127.0.0.1/*`

Chune ID POSTs classification reports to the Chunes desktop app at the fixed
runtime URL `http://127.0.0.1:52846/tabs`. Chrome match patterns cannot limit a
host permission to one port, so the manifest declares the loopback host while
the code fixes both the port and path. Reports use `Content-Type:
application/json`; this direct extension request does not leave the user's
computer. Chunes controls the separately disclosed downstream Discord presence
and optional SoundCloud, YouTube Music, or Apple Music album-art requests.

## `https://soundcloud.com/*` and `https://www.soundcloud.com/*`

This access lets `chrome.tabs.query` read the URL and title only when a
currently audible tab is on SoundCloud. Chune ID reduces the URL to its
hostname before the local report so Chunes can identify or suppress that
service according to the user's local SoundCloud setting.

## `https://youtube.com/*`, `https://www.youtube.com/*`, and `https://m.youtube.com/*`

This access lets audible regular YouTube tabs be classified as blocked so
Chunes does not mistake video audio for generic music. Regular YouTube remains
blocked regardless of the YouTube Music setting.

## `https://music.youtube.com/*`

This access lets `chrome.tabs.query` read the URL and title only when a
currently audible tab is on YouTube Music, enabling correct local music
classification or suppression according to the user's local YouTube Music
setting. Chune ID also derives and validates the watch page's public video ID so
local Chunes can request exact YouTube Music album art. It does not report the
full URL.

## `https://music.apple.com/*`

This access lets `chrome.tabs.query` read the URL and title only when a
currently audible tab is on the Apple Music web player. Chune ID reduces the
URL to its hostname before the local report so Chunes can attribute otherwise
unidentifiable browser audio to Apple Music. Tabs on this host are reported
only while the user's local Apple Music setting is on.

## Permissions Not Requested

Chune ID does not request `tabs`, `activeTab`, content-script access, cookies,
identity, browsing history, downloads, or any other Chrome permission. Matching
host permissions expose URL/title only on the listed sites and replace broad
`tabs` access.
