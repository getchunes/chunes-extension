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

The SoundCloud, YouTube Music, and Apple Music values control what the companion
may publish, not whether local classification occurs. While the master is on,
matching track data is still sent to local Chunes for suppression when a service
is disabled. Only the master setting stops tab queries and track reporting.

## `scripting`

Chune ID declares isolated-world bridge and MAIN-world reader scripts on
SoundCloud, YouTube Music, and Apple Music. They read current page Media Session
metadata; the Apple Music reader also reads MusicKit timing. Manifest content
scripts only load on navigation, so an already-open matching tab would run no
reader until refreshed. The `scripting` permission injects that same reviewed
pair into already-open matching tabs once, on install or update. It is never
used on other sites or at any other time.

## `http://127.0.0.1/*`

Chune ID POSTs classification reports to the Chunes desktop app at the fixed
runtime URL `http://127.0.0.1:52846/tabs`. Chrome match patterns cannot limit a
host permission to one port, so the manifest declares the loopback host while
the code fixes both the port and path. Reports use `Content-Type:
application/json`; this direct extension request does not leave the user's
computer. Chunes controls the separately disclosed downstream Discord presence
and optional SoundCloud, YouTube Music, or Apple Music album-art requests.

## `https://soundcloud.com/*` and `https://www.soundcloud.com/*`

This access lets `chrome.tabs.query` identify audible SoundCloud tabs. The
reviewed page scripts read current Media Session title, artist, and a
provider-hosted artwork URL. Chune ID reduces the tab URL to its hostname before
the local report so Chunes can identify or suppress that service according to
the user's local SoundCloud setting.

## `https://youtube.com/*`, `https://www.youtube.com/*`, and `https://m.youtube.com/*`

This access lets audible regular YouTube tabs be classified as blocked so
Chunes does not mistake video audio for generic music. Regular YouTube remains
blocked regardless of the YouTube Music setting.

## `https://music.youtube.com/*`

This access lets `chrome.tabs.query` identify audible YouTube Music tabs. The
reviewed page scripts read current Media Session title, artist, and a
provider-hosted artwork URL. Chune ID also derives and validates the watch
page's public video ID. It does not report the full URL.

## `https://music.apple.com/*`

This access lets `chrome.tabs.query` read the URL and title only when a
currently audible tab is on Apple Music, enabling correct local music
classification or suppression according to the user's local Apple Music setting.
It also lets two content scripts on `music.apple.com` read the page's own
MusicKit player state (playback position, duration, playing state, and
now-playing metadata), which Chune ID relays to local Chunes for accurate Apple
Music timing. Chune ID reports only the hostname, validated metadata, and those
bounds-checked MusicKit timing fields for Apple Music tabs; no video ID or media
identifier is extracted and the full URL is not reported.

## Permissions Not Requested

Chune ID does not request `tabs`, `activeTab`, cookies, identity, browsing
history, downloads, or any other Chrome permission beyond `alarms`, `storage`,
`scripting`, and the listed host permissions. Content scripts run only on the
three supported music hosts, and `scripting` injects those same reviewed pairs
only into already-open matching tabs on install or update. Matching host
permissions replace broad `tabs` access.
