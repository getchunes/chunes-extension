# Chunes Helper

Companion browser extension for [Chunes](https://github.com/getchunes/chunes),
the app that shows your SoundCloud and YouTube Music listening as a Discord
status.

Windows only tells Chunes that "your browser is playing something", never
which site. This extension fills that gap: it watches which tabs are audible
and reports the site name and tab title to the Chunes app on your own machine
at `127.0.0.1:52846`. That is all it does.

With it installed, Chunes can:

- ignore regular YouTube videos instead of showing them as music
- label your status with the right service (SoundCloud or YouTube Music)
- keep your music status up while a video plays at the same time

## Install

From the Chrome Web Store: coming soon.

Manually: clone this repo, open `chrome://extensions` (or `brave://extensions`),
enable Developer mode, click "Load unpacked" and select the folder.

## Privacy

No analytics, no remote servers, no data collection. The only network request
this extension makes is to `127.0.0.1` on your own computer, and only the
hostname and title of currently audible tabs are sent. If the Chunes app is
not running, the request silently fails and nothing happens.
