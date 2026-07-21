# Chune ID

[![Chune ID on the Chrome Web Store](https://img.shields.io/chrome-web-store/v/ofbfkbhgfhoapckgjcpmcohbhnogpfjd?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/chune-id/ofbfkbhgfhoapckgjcpmcohbhnogpfjd) [![Latest release](https://img.shields.io/github/v/release/getchunes/chunes-extension?label=release)](https://github.com/getchunes/chunes-extension/releases/latest)

Companion Chrome extension for [Chunes](https://github.com/getchunes/chunes),
the Windows app that shows supported music listening as Discord presence.

Windows only tells Chunes that "your browser is playing something", never
which site. Chune ID fills that gap by checking audible SoundCloud and YouTube
tabs and reporting their hostname, title, and optional YouTube Music video ID
to the Chunes app on this computer at `127.0.0.1:52846`.

With it installed, Chunes can:

- identify SoundCloud and YouTube Music playback
- suppress regular YouTube videos instead of treating them as generic music
- improve supported/blocked overlap handling when browser titles are distinguishable

Windows exposes browser audio at the process level, so overlap resolution uses
tab-title evidence. Identical or very similar titles can remain ambiguous; the
extension does not guarantee correct attribution in those cases.

## Requirements

- Google Chrome 120 or a compatible Chromium browser with Manifest V3 support
- Windows with [Chunes desktop](https://github.com/getchunes/chunes/releases/latest) running for protocol-3 presence reporting (Chunes 1.0.9 or newer)

## Install

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/chune-id/ofbfkbhgfhoapckgjcpmcohbhnogpfjd), or load it manually from source:

1. Install Chunes using the MSI from its [latest release](https://github.com/getchunes/chunes/releases/latest).
2. Clone this repository.
3. Open `chrome://extensions` (or `brave://extensions`).
4. Enable Developer mode, choose **Load unpacked**, and select this repository's root folder.
5. Pin Chune ID and click its toolbar icon to view connection and source status.

Check the selected Chunes release's trust notice before installation. Signed
releases identify their publisher. An unsigned manual release displays
**Unknown publisher** and should be installed only after its hash is verified.

## Settings

The popup stores these settings only in `chrome.storage.local`. All three are
on by default:

- **Chune ID enabled** controls all audible-tab identification. When off, the extension does not query tabs and sends only a minimal local heartbeat so Chunes can clear browser presence.
- **SoundCloud** controls whether Chunes may publish SoundCloud presence.
- **YouTube Music** controls whether Chunes may publish YouTube Music presence.

The service switches control publishing, not local classification. Disabled
services still have their matching host and title sent to local Chunes so it
can suppress them instead of treating their audio as an unknown browser
source. YouTube Music reports also include its public video ID for exact album
art. Only the master switch stops tab queries and track reporting. Regular
YouTube is always classified as blocked, independently of the YouTube Music
setting.

## Local protocol

The service worker reports after relevant tab changes, setting changes, popup
refreshes, browser startup/installation, and a 30-second alarm. It sends an
`application/json` POST to `http://127.0.0.1:52846/tabs` with this shape:

```json
{
  "enabled": true,
  "services": {
    "soundcloud": true,
    "youtubeMusic": true
  },
  "tabs": [
    {
      "host": "soundcloud.com",
      "mediaId": null,
      "title": "Example track title"
    }
  ]
}
```

When the master switch is off, the worker skips `chrome.tabs.query` and sends
the same object with `enabled: false` and `tabs: []` as a paused heartbeat.
Reports contain at most 64 tabs, titles are limited to 512 Unicode characters,
YouTube Music video IDs must be exactly 11 valid ID characters, and the
serialized UTF-8 body never exceeds 32 KiB. Enabled publishable tabs
are considered first, disabled supported services second, and blocked regular
YouTube last. A tab that does not fit is skipped so a later smaller tab can
still be included; the popup reports omitted-tab and truncated-title counts.

Chune ID shows the companion as connected only when a successful response
contains `X-Chunes-Protocol: 3`. A response without that marker is treated as
an incompatible desktop version.

## Permissions

- `alarms` keeps desktop classification current while the popup is closed.
- `storage` saves only the three local boolean settings.
- Narrow host access for `127.0.0.1`, SoundCloud, and YouTube lets the worker contact Chunes and read URL/title only for supported audible hosts. The worker derives a public video ID from a YouTube Music watch URL but never reports a full URL.

Chune ID does not request the broad `tabs` permission, inject content scripts,
or run remote code.

## Privacy

Chune ID has no analytics, ads, or remote code. The extension itself directly
contacts only Chunes over the HTTP loopback address: it reads audible matching
tabs, reduces each URL to a hostname and optional YouTube Music video ID, and
sends that information with the title locally. For enabled sources, Chunes
sends presence to Discord and may request optional album art from the matching
SoundCloud or YouTube Music service. See the
[Chune ID Privacy Policy](PRIVACY.md) and the
[Chunes companion Privacy Policy](https://github.com/getchunes/chunes/blob/main/PRIVACY.md).

## Validate and package

The release scripts require only Node.js and Windows PowerShell 5.1 or newer:

```powershell
.\scripts\validate.ps1
.\scripts\package.ps1
.\scripts\validate-package.ps1
```

Packaging reads the manifest version and creates
`dist/chune-id-1.0.2.zip`. The archive is built from an explicit allowlist;
store materials, source archives, CI files, and development scripts are not
included.

## Support and security

Use [GitHub Issues](https://github.com/getchunes/chunes-extension/issues) for
support. Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## License

Chune ID is licensed under the [Apache License 2.0](LICENSE). The canonical
Chunes icon includes geometry adapted from Bootstrap Icons under the MIT
License; see [Third-Party Notices](THIRD_PARTY_NOTICES.md).
