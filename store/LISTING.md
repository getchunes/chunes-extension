# Chrome Web Store Listing

## Product name

Chune ID

## Summary

Identify SoundCloud and YouTube Music tabs for the local Chunes desktop presence app.

## Detailed description

Chune ID is the browser companion for Chunes, the Windows desktop app that
shows supported listening as Discord presence.

Windows can tell Chunes that a browser is playing audio, but not which site is
responsible. Chune ID closes that local information gap. It identifies audible
SoundCloud, YouTube Music, and regular YouTube tabs and sends only their
hostname and tab title to the Chunes app running on your computer. For YouTube
Music, it also sends the public video ID so Chunes can request exact album art.
It never sends a full tab URL.

With Chune ID, Chunes can:

- identify SoundCloud and YouTube Music playback;
- keep regular YouTube videos from appearing as generic music presence;
- improve supported/blocked overlap handling when tab titles are distinguishable; and
- let you pause identification or disable either music service from an accessible toolbar popup.

Windows exposes browser audio at the process level. Identical or very similar
tab titles can remain ambiguous, so correct overlap attribution is not
guaranteed in those cases.

The popup shows whether Chunes desktop is connected, the current supported
audible source and title, and the last local check. The master, SoundCloud, and
YouTube Music controls are on by default and are stored only in the local
browser profile. Service switches control what Chunes may publish; matching
track data still goes to local Chunes for suppression. Turning off the master
switch is the only way to stop tab queries and track reporting.

Chune ID has no analytics, ads, accounts, or remote code. The extension itself
directly contacts only Chunes at 127.0.0.1:52846. For enabled services, Chunes
sends presence to Discord and may, under optional companion artwork controls,
search SoundCloud with title/artist or request exact album art from YouTube
Music using its public video ID. See both privacy policies below.

Requires the Chunes Windows companion app. Chunes is available from:
https://github.com/getchunes/chunes/releases/tag/v1.0.1

Check the selected Chunes release's trust notice before installation. Signed
stable releases are eligible for automatic updates. If signing is unavailable,
an unsigned release may be offered as an immutable manual-only prerelease and
Windows will display **Unknown publisher**.

## Single-purpose statement

Chune ID's single purpose is to identify supported audible browser tabs for
the locally installed Chunes desktop app so it can publish the correct music
presence and suppress regular YouTube audio.

## Suggested category and language

- Category: Social & Communication
- Primary language: English

## Required links

- Privacy policy: https://github.com/getchunes/chunes-extension/blob/main/PRIVACY.md
- Companion privacy: https://github.com/getchunes/chunes/blob/main/PRIVACY.md
- Support: https://github.com/getchunes/chunes-extension/issues
- Companion app: https://github.com/getchunes/chunes/releases/tag/v1.0.1

## Assets

- 128 x 128 icon: uploaded from `icons/icon-128.png`
- 440 x 280 small promo tile: `store/assets/store-promo-440x280.png`
- 1280 x 800 screenshot: `store/screenshots/popup-1280x800.png`

The promo tile is the canonical generated Chunes Chrome asset. Store assets
are intentionally excluded from the extension upload ZIP.
