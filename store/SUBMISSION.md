# Chrome Web Store Submission

Use the separated paste-ready dashboard material as the canonical submission
copy:

- Listing copy: [`LISTING.md`](LISTING.md)
- Privacy answers: [`PRIVACY_DISCLOSURES.md`](PRIVACY_DISCLOSURES.md)
- Permission justifications: [`PERMISSION_JUSTIFICATIONS.md`](PERMISSION_JUSTIFICATIONS.md)
- Reviewer notes: [`REVIEWER_NOTES.md`](REVIEWER_NOTES.md)
- Manual dashboard and release checklist: [`DASHBOARD_CHECKLIST.md`](DASHBOARD_CHECKLIST.md)

## Reviewed Runtime Contract

- Manifest V3, version 1.0.0, minimum Chrome version 120
- Permissions limited to `alarms`, `storage`, loopback, SoundCloud, and YouTube hosts
- `application/json` POSTs to `http://127.0.0.1:52846/tabs`
- Exact top-level payload keys: `enabled`, `services`, and `tabs`
- At most 64 tabs, 512 Unicode characters per title, and 32 KiB per UTF-8 body
- Connection accepted only with response header `X-Chunes-Protocol: 1`
- Service switches control publishing while local host/title classification continues for suppression
- Master off skips tab queries and sends an empty paused heartbeat

## Data-Flow Scope

Chune ID itself directly sends matching host/title data only to local Chunes at
`127.0.0.1`. For enabled services, Chunes sends listening presence to Discord
and may, under optional companion artwork controls, send title/artist search
terms to SoundCloud. Use both public policies in the dashboard:

- Chune ID: https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md
- Chunes companion: https://github.com/getchunes/chunes/blob/main/PRIVACY.md

## Release Coordination

Version 1.0.0 is intentionally retained because it has not been uploaded to the
Chrome Web Store and the existing GitHub release has zero downloads. Before
publishing corrected artifacts, a maintainer must delete the old GitHub
`v1.0.0` release and tag, then recreate both from the corrected release commit.
No script in this repository performs those GitHub operations.
