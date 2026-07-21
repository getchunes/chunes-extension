# Chrome Web Store Submission

Use the separated paste-ready dashboard material as the canonical submission
copy:

- Listing copy: [`LISTING.md`](LISTING.md)
- Privacy answers: [`PRIVACY_DISCLOSURES.md`](PRIVACY_DISCLOSURES.md)
- Permission justifications: [`PERMISSION_JUSTIFICATIONS.md`](PERMISSION_JUSTIFICATIONS.md)
- Reviewer notes: [`REVIEWER_NOTES.md`](REVIEWER_NOTES.md)
- Manual dashboard and release checklist: [`DASHBOARD_CHECKLIST.md`](DASHBOARD_CHECKLIST.md)

## Reviewed Runtime Contract

- Manifest V3, version 1.0.6, minimum Chrome version 120
- Permissions limited to `alarms`, `storage`, `scripting`, loopback, SoundCloud, YouTube, and Apple Music hosts
- Two `music.apple.com` content scripts read the page's own MusicKit player state (playback position, duration, playing state, and now-playing title); the `scripting` permission injects the same pair into an already-open Apple Music tab on install or update
- `application/json` POSTs to `http://127.0.0.1:52846/tabs`
- Exact top-level payload keys: `enabled`, `services`, and `tabs`
- At most 64 tabs, 512 Unicode characters per title, and 32 KiB per UTF-8 body
- Exact tab payload keys: `host`, `mediaId`, and `title`; `mediaId` is a validated YouTube Music video ID or `null`; `mediaId` is always `null` for Apple Music
- Apple Music tabs may additionally carry `position`, `duration`, `playing`, and `sampledAt` MusicKit timing fields, each bounds-checked; no other host may send them
- Connection accepted only with response header `X-Chunes-Protocol: 3`
- Service switches control publishing while local track classification continues for suppression
- Master off skips tab queries and sends an empty paused heartbeat

## Data-Flow Scope

Chune ID itself directly sends matching track data and a validated YouTube Music
video ID only to local Chunes at `127.0.0.1`. For enabled sources, Chunes sends
listening presence to Discord and may, under optional album-art controls, search
SoundCloud with title/artist, request exact square artwork from YouTube Music
using its public video ID, or search Apple's public iTunes Search API with
title/artist for Apple Music artwork. Use both public policies in the dashboard:

- Chune ID: https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md
- Chunes companion: https://github.com/getchunes/chunes/blob/main/PRIVACY.md

## Release Coordination

Version 1.0.0 has already been submitted to the Chrome Web Store. The immutable
1.0.0, 1.0.1, 1.0.2, 1.0.3, and 1.0.4 GitHub artifacts remain unchanged. This
submission is the separate 1.0.6 Apple Music timing update and must use a
newly built `chune-id-1.0.6.zip` with SHA-256
`626f05457ea650f349dbebafb5981438687d8294eee46eb97acb9d9aee7d80bf`.

The latest Chunes desktop release is the matching protocol-3 companion. Its release-specific
notice labels the immutable MSI as an unsigned manual release. Chrome reviewers
should expect **Unknown publisher** for that explicitly labeled companion build.
