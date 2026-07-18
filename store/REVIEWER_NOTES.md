# Chrome Web Store Reviewer Notes

The following text is ready to paste into the reviewer-notes field.

Chune ID is a local companion for the Chunes Windows desktop app and requires
Chrome 120 or newer. No account, extension login, paid subscription, or test
credentials are required.

1. Install and start the latest Chunes MSI from https://github.com/getchunes/chunes/releases/latest. Chunes v1.0.0 is an explicitly labeled unsigned interim release while SignPath Foundation approval is pending, so Windows displays **Unknown publisher**. The GitHub release, tag, and sole MSI are immutable. Its local extension endpoint listens at `127.0.0.1:52846`.
2. Install Chune ID and click its toolbar icon. Click **Refresh**; the popup should show **Chunes desktop connected**.
3. Play a public SoundCloud track from `https://soundcloud.com/`, then refresh. The popup should show **SoundCloud** and the audible tab title.
4. Play music from `https://music.youtube.com/`, then refresh. The popup should show **YouTube Music** and the audible tab title.
5. Turn off the relevant service switch. The popup labels the source **publishing off**. Its host/title remains locally reported so Chunes can suppress that disabled service.
6. Play a regular video at `https://www.youtube.com/`. Chunes suppresses regular YouTube regardless of the YouTube Music switch. If no supported music is audible, the popup shows **No supported audio**.
7. Turn off **Chune ID enabled**. The popup shows **Identification paused**. The worker does not query tabs and sends an empty paused heartbeat so Chunes can clear browser presence.
8. Stop Chunes and refresh. The popup should show **Chunes desktop not detected** without changing browser playback.

Reports run after relevant tab changes, setting changes, popup refreshes, and a
30-second alarm. Each request is an `application/json` POST to
`http://127.0.0.1:52846/tabs` with exactly this top-level shape:

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
      "title": "Example track title"
    }
  ]
}
```

Reports contain at most 64 tabs, each title is limited to 512 Unicode
characters, and the serialized UTF-8 body is at most 32 KiB. The popup shows
connected only when a successful desktop response includes
`X-Chunes-Protocol: 1`; an old 204 response without that marker is shown as an
incompatible desktop version.

The master and both service settings default to on and persist only in
`chrome.storage.local`. Host permissions replace broad `tabs` access. Chune ID
contains no remote code and directly contacts only local Chunes. For enabled
services, Chunes sends presence to Discord and may send title/artist search
terms to SoundCloud for optional artwork under companion controls. Companion
privacy: https://github.com/getchunes/chunes/blob/main/PRIVACY.md
