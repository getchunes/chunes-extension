# Chrome Web Store Submission

Use the separated paste-ready dashboard material as the canonical submission
copy:

- Listing copy: [`LISTING.md`](LISTING.md)
- Privacy answers: [`PRIVACY_DISCLOSURES.md`](PRIVACY_DISCLOSURES.md)
- Permission justifications: [`PERMISSION_JUSTIFICATIONS.md`](PERMISSION_JUSTIFICATIONS.md)
- Reviewer notes: [`REVIEWER_NOTES.md`](REVIEWER_NOTES.md)
- Manual dashboard and release checklist: [`DASHBOARD_CHECKLIST.md`](DASHBOARD_CHECKLIST.md)

## Reviewed Runtime Contract

- Manifest V3, version 1.0.1, minimum Chrome version 120
- Permissions limited to `alarms`, `storage`, loopback, SoundCloud, and YouTube hosts
- `application/json` POSTs to `http://127.0.0.1:52846/tabs`
- Exact top-level payload keys: `enabled`, `services`, and `tabs`
- At most 64 tabs, 512 Unicode characters per title, and 32 KiB per UTF-8 body
- Exact tab payload keys: `host`, `mediaId`, and `title`; `mediaId` is a validated YouTube Music video ID or `null`
- Connection accepted only with response header `X-Chunes-Protocol: 2`
- Service switches control publishing while local track classification continues for suppression
- Master off skips tab queries and sends an empty paused heartbeat

## Data-Flow Scope

Chune ID itself directly sends matching track data and a validated YouTube Music
video ID only to local Chunes at `127.0.0.1`. For enabled sources, Chunes sends
listening presence to Discord and may, under optional album-art controls, search
SoundCloud with title/artist or request exact square artwork from YouTube Music
using its public video ID. Use both public policies in the dashboard:

- Chune ID: https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md
- Chunes companion: https://github.com/getchunes/chunes/blob/main/PRIVACY.md

## Release Coordination

Version 1.0.0 has already been submitted to the Chrome Web Store and remains
unchanged. This submission is the separate 1.0.1 update and must use a newly
built `chune-id-1.0.1.zip` with SHA-256
`b7c1c577a92d3dbaf39e4ef2e98db9989a4b8db8fb284333702358eab0ff380c`.

Chunes desktop 1.0.1 is the matching protocol-2 companion. Its release-specific
notice states whether the MSI is signed or is an immutable unsigned manual
prerelease. Chrome reviewers should expect **Unknown publisher** only for an
explicitly labeled unsigned companion build.
