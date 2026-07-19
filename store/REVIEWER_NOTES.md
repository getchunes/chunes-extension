# Chrome Web Store Reviewer Notes

The following text is ready to paste into the reviewer-notes field.

Chune ID is a local companion for the Chunes Windows desktop app and requires
Chrome 120 or newer. No extension account, paid subscription, or test
credentials are required. Testing Discord presence requires the Discord desktop
app to be running and signed in with **Share my activity** enabled.

1. Start the signed-in Discord desktop app, then install and start Chunes desktop 1.0.1 from https://github.com/getchunes/chunes/releases/tag/v1.0.1. Check that release's trust notice: a signed stable MSI identifies its publisher, while an explicitly labeled unsigned manual build displays **Unknown publisher**. Every release, tag, and sole MSI is immutable. Its local extension endpoint listens at `127.0.0.1:52846`.
2. Install Chune ID and click its toolbar icon. Click **Refresh**; the popup should show **Chunes desktop connected**.
3. Play a public SoundCloud track from `https://soundcloud.com/`, then refresh. The popup should show **SoundCloud** and the audible tab title.
4. Play a public audio track from `https://music.youtube.com/`, then refresh. The popup should show **YouTube Music**, a **YTM** badge, and the audible tab title. With online album art enabled in Chunes, an audio track with available album metadata should use square YouTube Music artwork rather than a generic video thumbnail; video-style tracks without square music artwork may use the fallback Chunes image.
5. Play a track from `https://music.apple.com/`, then refresh. The popup should show **Apple Music** and the audible tab title.
6. Turn off the relevant service switch. The popup labels the source **publishing off**. Its matching track data remains locally reported so Chunes can suppress that disabled service.
7. Play a regular video at `https://www.youtube.com/`. Chunes suppresses regular YouTube regardless of the YouTube Music switch. If no supported music is audible, the popup shows **No supported audio**.
8. Turn off **Chune ID enabled**. The popup shows **Identification paused**. The worker does not query tabs and sends an empty paused heartbeat so Chunes can clear browser presence.
9. Stop Chunes and refresh. The popup should show **Chunes desktop not detected** without changing browser playback.

Reports run after relevant tab changes, setting changes, popup refreshes, and a
30-second alarm. Each request is an `application/json` POST to
`http://127.0.0.1:52846/tabs` with exactly this top-level shape:

```json
{
  "enabled": true,
  "services": {
    "appleMusic": true,
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

Reports contain at most 64 tabs, each title is limited to 512 Unicode
characters, and the serialized UTF-8 body is at most 32 KiB. The popup shows
connected only when a successful desktop response includes
`X-Chunes-Protocol: 2`; a response without that marker is shown as an
incompatible desktop version.

The master and all service settings default to on and persist only in
`chrome.storage.local`. Host permissions replace broad `tabs` access. Chune ID
contains no remote code and directly contacts only local Chunes. For enabled
services, Chunes sends presence to Discord and may search SoundCloud with
title/artist, send a public video ID to YouTube Music for optional album art,
or search Apple's public iTunes Search API with title/artist for Apple Music
artwork under companion controls. Companion
privacy: https://github.com/getchunes/chunes/blob/main/PRIVACY.md
