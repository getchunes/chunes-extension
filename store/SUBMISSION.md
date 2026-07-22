# Chrome Web Store Submission

Use the separated paste-ready dashboard material as the canonical submission
copy:

- Listing copy: [`LISTING.md`](LISTING.md)
- Privacy answers: [`PRIVACY_DISCLOSURES.md`](PRIVACY_DISCLOSURES.md)
- Permission justifications: [`PERMISSION_JUSTIFICATIONS.md`](PERMISSION_JUSTIFICATIONS.md)
- Reviewer notes: [`REVIEWER_NOTES.md`](REVIEWER_NOTES.md)
- Manual dashboard and release checklist: [`DASHBOARD_CHECKLIST.md`](DASHBOARD_CHECKLIST.md)

## Reviewed Runtime Contract

- Manifest V3, version 1.0.11, minimum Chrome version 120
- Permissions limited to `alarms`, `storage`, `scripting`, loopback, SoundCloud, YouTube, and Apple Music hosts
- SoundCloud, YouTube Music, and Apple Music each use an isolated-world bridge and MAIN-world reader for current page metadata. Apple Music additionally reads MusicKit timing. The `scripting` permission injects those existing pairs into already-open matching tabs on install or update.
- `application/json` POSTs to `http://127.0.0.1:52846/tabs`
- Protocol 4 adds explicit top-level `protocol: 4`; an older protocol-3 desktop receives one exact fallback report without page metadata
- At most 64 tabs, 512 Unicode characters per title, and 32 KiB per UTF-8 body
- Tab payloads contain `host`, `mediaId`, and `title`. Protocol 4 can additionally carry validated current page `metadata` with title, artist, and provider-hosted artwork. `mediaId` is a validated YouTube Music video ID or `null`; it is always `null` for Apple Music.
- Apple Music tabs may additionally carry `position`, `duration`, `playing`, and `sampledAt` MusicKit timing fields, each bounds-checked; no other host may send them
- Connection accepts `X-Chunes-Protocol: 4`, with an isolated protocol-3 compatibility fallback for older desktop releases
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

Version 1.0.0 has already been submitted to the Chrome Web Store. Earlier
immutable GitHub artifacts remain unchanged. This submission is the coordinated
1.0.11 protocol-4 metadata release and must use `chune-id-1.0.11.zip` with
SHA-256 `720251dd155b364f4b303598e7c22014b29efc4716d9f4edec8761eb3915833e`.

The latest Chunes desktop release is the matching protocol-4 companion. Its release-specific
notice labels the immutable MSI as an unsigned manual release. Chrome reviewers
should expect **Unknown publisher** for that explicitly labeled companion build.
