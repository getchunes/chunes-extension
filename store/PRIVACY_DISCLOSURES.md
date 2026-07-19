# Chrome Web Store Privacy Disclosures

## Single Purpose

Chune ID's single purpose is to identify supported audible browser tabs for
the locally installed Chunes desktop app so it can publish the correct music
presence and suppress regular YouTube audio.

## Data Categories

- Web history: **Yes**. Chune ID transiently handles the hostname of a currently audible tab on a declared SoundCloud, YouTube, or Apple Music host and the public video ID of a YouTube Music watch page. It does not read or collect general browsing history or send full URLs.
- Website content: **Yes**. Chune ID transiently handles the title of a currently audible matching tab; a title can contain a track, artist, or video title.
- Personally identifiable information: **No**.
- Health information: **No**.
- Financial and payment information: **No**.
- Authentication information: **No**.
- Personal communications: **No**.
- Location: **No**.
- User activity beyond the limited web-history handling described above: **No**.

## Data Use Certifications

- Data is not sold to third parties.
- Data is not used or transferred for purposes unrelated to Chune ID's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending purposes.
- Chrome API data is used only for the extension's prominent user-facing functionality, consistent with the Chrome Web Store User Data Policy and Limited Use requirements.

## Transfer, Storage, and Retention

The extension itself directly sends matching tab hostnames, titles, and a
validated YouTube Music video ID only to the locally installed Chunes app using
HTTP loopback at `127.0.0.1:52846`; it does not send them to the developer or
persist them. For enabled sources, Chunes sends listening presence to Discord.
If optional album-art behavior is enabled, Chunes searches SoundCloud with
title/artist for SoundCloud tracks, sends the public video ID to YouTube
Music's web metadata endpoint for exact square music artwork, or searches
Apple's public iTunes Search API with title/artist for Apple Music artwork.
Those downstream requests are made by Chunes and are covered by the companion
privacy policy. Four boolean extension settings persist only in
`chrome.storage.local` until changed, browser storage is cleared, or the
extension is removed.

Each loopback report is limited to 64 tabs, 512 Unicode characters per title,
validated 11-character YouTube Music video IDs, and a 32 KiB serialized UTF-8
body. Enabled supported services are considered
before disabled supported services and blocked regular YouTube. Tabs that do
not fit are omitted; the popup reports omitted-tab and truncated-title counts.

## Remote Code

**No, this extension does not use remote code.** All JavaScript, CSS, and image
assets execute or load from the submitted package. There are no remote scripts,
WebAssembly modules, `eval` calls, or inline scripts.

## Public URLs

- Privacy policy: https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md
- Companion privacy: https://github.com/getchunes/chunes/blob/main/PRIVACY.md
- Support: https://github.com/getchunes/chunes-extension/issues
