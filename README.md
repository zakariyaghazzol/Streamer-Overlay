# Space Stream Overlay

An interactive space-themed browser overlay for OBS, Streamlabs Desktop, and browser/link-source streaming tools.

## Run It

```powershell
cd C:\Users\zghaz\Desktop\projects\space-stream-overlay
npm start
```

Open these URLs while the server is running:

- Overlay: `http://127.0.0.1:8787/overlay`
- Controls: `http://127.0.0.1:8787/control`
- Preview with a demo background: `http://127.0.0.1:8787/overlay?demo=1`

## Add To Streaming Software

For OBS or Streamlabs Desktop:

1. Keep your Fortnite source as `Game Capture`.
2. Add a new `Browser Source`.
3. Put the Browser Source above Game Capture in the Sources list.
4. Use this URL:

```text
http://127.0.0.1:8787/overlay
```

Recommended source size:

- Landscape streams: `1920 x 1080`
- TikTok-style vertical streams: `1080 x 1920`

The overlay does not inject into Fortnite. Streamlabs combines sources like layers: Fortnite is the bottom layer, and this browser overlay sits above it.

Keep `control` open in your regular browser to update kills, wins, the timer, and the subscriber goal. The overlay source updates live.

## Manual Changes

Use the control panel at `http://127.0.0.1:8787/control` for normal live changes:

- Click `+` or `-` for kills, wins, and subscribers.
- Press `Start`, `Pause`, or `Reset` for the timer.
- Edit streamer name, game title, status, goal label, current subs, and target subs, then press `Save`.

For design changes, edit these files:

- `public/styles.css` controls the look, colors, sizes, positions, and animations.
- `public/overlay.html` controls what appears on stream.
- `public/control.html` controls the private dashboard.

After editing code, reload the Streamlabs Browser Source or click its refresh button.

## Notes

Streamlabs Desktop supports browser sources/custom widgets. TikTok LIVE Studio lists a Link source for adding a webpage preview to a LIVE scene, but TikTok access and behavior can vary by account and app version. If TikTok refuses a local URL, use OBS/Streamlabs and send that output to TikTok, or host this folder on a private HTTPS page.

On hosted platforms like Vercel, the control panel URL is public unless you add authentication. The local version is best for live streaming because `127.0.0.1` is only reachable from your own machine.
