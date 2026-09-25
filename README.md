# Matt & Hailey's Wedding Guestbook

A kiosk-style digital guestbook. Guests type their name and an optional note,
take their own photo, and a captioned 2×3-inch print is printed automatically.
The original photo and composed print image are saved to the computer.

## How it's built

- **`client/`** — the React app guests actually see (Vite + React)
- **`server/`** — a small local Express server that saves each entry
  (name, note, photo) to files on this computer — no cloud account needed
- Data lives in `server/data/entries.json` plus `server/data/photos/`

Nothing leaves this computer. This is intentional: venue wifi can be
unreliable, and this way the guestbook works no matter what.

## Public GitHub Pages demo

The client can also be deployed as a static, memory-only demo with GitHub
Pages. The workflow in `.github/workflows/deploy-pages.yml` builds the client
with demo mode enabled and publishes it from `client/dist`.

The demo never calls the Express server and does not use browser storage.
Entries and photos exist only in the current browser tab and disappear when
the page is refreshed or closed. Camera access requires browser permission,
and printing uses the browser's normal print dialog; the local Chrome
`--kiosk-printing` setup below is still required for silent kiosk printing.

To enable the deployment, turn on GitHub Pages for the repository using
**GitHub Actions** as the source. Pushes to `main` then rebuild and publish
the demo at `https://<owner>.github.io/<repository>/`.

## 1. One-time setup

You'll need [Node.js](https://nodejs.org/) installed (version 18 or newer).
The easiest way on a Mac:

```bash
# If you have Homebrew:
brew install node

# Otherwise, download the installer from nodejs.org and run it.
```

Check it worked:

```bash
node -v   # should print v18.x or higher
```

Then, from the `wedding-guestbook` folder, install everything:

```bash
cd wedding-guestbook
npm run install:all
npm install
```

## 2. Run it

From the `wedding-guestbook` folder:

```bash
npm run dev
```

This starts both the server (on port 4000) and the client (on port 5173) at
once. Leave this terminal window open while the guestbook is running.

Open **http://localhost:5173** in Chrome.

The first time you tap "Sign In With a Photo," the browser will ask for
camera permission — click **Allow**. (If you don't see the prompt, check
**System Settings → Privacy & Security → Camera** and make sure your
browser is allowed.)

## 3. Set up auto-printing (recommended)

By default, browsers show a print dialog every time and ask you to pick a
printer — not great for a kiosk where guests are pressing the buttons.
Chrome has a flag that skips this and prints straight to your default
printer.

1. Connect the Canon SELPHY CP1500 to the same Wi-Fi network as the Mac, add
   it in **System Settings → Printers & Scanners**, and set it as the default
   printer. Load the CP1500 card-size paper (54 × 86 mm / about 2.1 × 3.4 in)
   and select that media size in the printer's saved print settings.
2. Quit Chrome completely.
3. Launch Chrome from the Terminal with the kiosk-printing flag, pointed
   straight at the app:

```bash
open -a "Google Chrome" --args --kiosk-printing "http://localhost:5173"
```

Now tapping "Confirm & Print" prints the composed 2×3-inch image without a
dialog. Do one test print first and confirm the CP1500 is using card-size
media; the app's print image is 2×3 inches, while the physical sheet is larger.

Optional: add `--kiosk` to the same command to make Chrome go fullscreen
with no address bar or window chrome, so guests can't accidentally
navigate away:

```bash
open -a "Google Chrome" --args --kiosk --kiosk-printing "http://localhost:5173"
```

(Press `Cmd+Q` — or `Cmd+Option+Esc` and force-quit — to get out of kiosk
mode afterward.)

## 4. During the wedding

- Leave the Terminal window (running `npm run dev`) open the whole time —
  closing it stops the server and the app will stop working.
- The small **"View all guests"** link on the home screen shows everyone
  who has signed in so far, with their photo and note.
- If the app looks frozen or errors out, refresh the page (`Cmd+R`) — no
  data is lost, since every entry is saved the moment it's confirmed.

## 5. After the wedding

All your data is sitting in:

- `server/data/entries.json` — every guest's name, note, and timestamp
- `server/data/photos/` — each original camera photo and its captioned 2×3 print image

Back these up / copy them wherever you like (an external drive, cloud
storage, etc.) — there's no automatic upload built in right now, so this is
a manual step. If down the road you want this synced somewhere
automatically (GitHub, cloud storage, etc.), that's a straightforward
add-on to the server.

## Troubleshooting

- **"Couldn't access the camera"** — another app (Zoom, Photo Booth, etc.)
  might be using the camera. Close it and refresh.
- **Nothing prints** — make sure a printer is set as default in System
  Settings, and that you launched Chrome with `--kiosk-printing` as shown
  above. Without that flag, you'll get a normal print dialog instead (which
  still works, just requires a click).
- **Port already in use** — if `npm run dev` complains a port is taken,
  another copy of the app may already be running; check for a leftover
  Terminal window/tab.
