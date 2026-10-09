# Matt & Hailey's Wedding Guestbook

A kiosk-style digital guestbook. Guests enter a name and optional note, take a
photo, and print a captioned photo card. The web client is a static React
app hosted on GitHub Pages. The live backend uses AWS API Gateway, Lambda,
DynamoDB, and a private S3 bucket. It also includes a single-event disposable
camera that guests can open from a QR code or link without installing an app
or creating an account.

## Architecture

- `client/`: React + Vite user interface.
- `backend/src/handler.mjs`: AWS Lambda API for guestbook entries, signed photo
  uploads, and disposable-camera rolls.
- `template.yaml`: AWS SAM infrastructure definition.
- `.github/workflows/deploy-pages.yml`: builds and publishes the client.

Photos upload directly from the browser to private S3 using short-lived
pre-signed URLs. Entry metadata is stored in DynamoDB. The API returns
time-limited photo URLs for the gallery and print view. The API is public so
guests can submit entries; do not put private information in the guestbook.

## Disposable camera

Open `?camera=1` on the Pages URL or scan the QR code from the app. Each guest
can take up to five photos from one browser, without an account. The app asks
for a name and optional email; the name appears with photos, while email is
visible only to hosts. The camera limit is per browser and can be reset by
clearing browser data or switching devices; it is not a verified per-person
limit.

Guests can take photos directly with the live camera or choose existing photos
from their device. **My photos** shows the guest's own uploads and lets them
delete a photo, which returns that shot to their roll. Photos stay hidden from
the shared event gallery until the host reviews the roll and chooses **Reveal
the roll** at `?camera-admin=1`. Hosts can also delete photos there. S3 remains
private; the browser receives short-lived upload and viewing links from the API.

To enable host controls, put the review code in the root `.env` file (it is
git-ignored), then deploy only its SHA-256 hash as the `CameraAdminCodeHash`
SAM parameter. The Lambda needs the hash to check codes; no Secrets Manager
secret is used. From the repository root, run:

```bash
set -a
source .env
set +a
CAMERA_ADMIN_CODE_HASH="$(printf %s "$CAMERA_ADMIN_CODE" | shasum -a 256 | cut -d ' ' -f 1)"
sam deploy --parameter-overrides "CameraAdminCodeHash=$CAMERA_ADMIN_CODE_HASH" "CameraPhotosPerGuest=5" --profile GuestbookIdentity --region us-east-1
unset CAMERA_ADMIN_CODE CAMERA_ADMIN_CODE_HASH
```

Do not commit `.env` or put the raw code in GitHub Actions. The public guest
flow does not require this code.

## Deploy the AWS backend

Install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
and [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html),
then configure credentials for an AWS account and region. From the repository
root:

```bash
sam build
sam deploy --guided
```

The guided deployment creates a CloudFormation stack containing the API,
Lambda, DynamoDB tables, and private S3 bucket. Keep the stack name and region.
The deployed stack's `ApiUrl` is
`https://wmuwh7dlg1.execute-api.us-east-1.amazonaws.com`. For future deploys,
copy the `ApiUrl` output from CloudFormation.

## Publish on GitHub Pages

1. Under **Settings → Pages**, set the source to **GitHub Actions**.
2. Push to `main` or run **Deploy client to GitHub Pages** from the Actions tab.

The client defaults to the deployed API. Set `VITE_API_URL` only when using a
different backend. For a repository named
`owner/repository`, the Pages URL is `https://owner.github.io/repository/`.

## Run locally

```bash
cd client
npm ci
VITE_API_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com npm run dev
```

Open the local URL shown by Vite. Camera access requires browser permission.
Install the Brother VC-500W printer software if macOS does not add the printer
automatically, connect it by USB, and set it as the macOS default printer.
Choose the matching roll width in the printer setup: 50 mm for 2-inch labels or
25 mm for 1-inch test labels.

The default is `25` for a 25 mm wide calibration page 1.33 inches long; guest
photo cards are 1.38 inches long to add a small blank tail. Set
`VITE_PRINT_WIDTH_MM=50` for a 50 mm wide card about 2.53 inches long. The
browser sends a page with that specific size; the printer does not auto-cut
when printing from the computer.
For example:

```bash
VITE_PRINT_WIDTH_MM=25 npm run dev
```

To start the guestbook server, run this from the project root:

```bash
./launch.sh
```

Pass `-k` to also open Chrome in kiosk-printing mode:

```bash
./launch.sh -k
```

Pass `-t` to simulate print jobs without sending them to the network printer or
macOS. A small notice shows which print route would have been used. Combine it
with `-k` to run the app in kiosk mode, for example `./launch.sh -k -t`.

The launcher defaults to 25 mm labels. Use `VITE_PRINT_WIDTH_MM=50 ./launch.sh`
for 2-inch stock. After a guest confirms their entry, it prints automatically to
the macOS default printer. Confirm the printer's selected roll size matches the
launcher setting. Press Ctrl-C in the launcher terminal to stop the local server.

## Operational notes

- The API permits anonymous uploads and reads to support the public wedding
  guestbook and disposable camera. Guests can bypass the per-browser photo limit
  by resetting their browser or using another device. Consider deleting the AWS
  stack after the event if the service is no longer needed.
- AWS charges are usage based. DynamoDB is on-demand and the Lambda/API use
  pay-per-request billing; S3 storage and transfer charges may apply.
- `VITE_API_URL` is a public API endpoint, not a credential. AWS credentials
  must never be placed in the client or GitHub Pages build variables.
- The client also supports a memory-only demo build with `VITE_DEMO_MODE=true`.

## Direct printing with auto cut (Brother VC-500W)

The macOS print driver can't turn on the VC-500W's auto cut. Setting
`PRINTER_HOST` makes the dev server send the job straight to the printer over
the network (TCP 9100) with `<cutmode>full</cutmode>`, using the protocol from
[vc-500w_autocut](https://github.com/corentin-soriano/vc-500w_autocut). If the
direct job fails, the app falls back to the normal `window.print()` path.

Requirements: the printer must be reachable by IP from the Mac (Wi-Fi or
Wireless Direct). USB-only will not work for this path.

```bash
./launch.sh
```

The launcher defaults to `192.168.8.228`. To use a different printer, override
it with `PRINTER_HOST=192.168.x.x ./launch.sh`.

Optional env vars: `PRINTER_PORT` (default 9100), `PRINTER_DRY_RUN=1` (log the
job without contacting the printer), `VITE_DIRECT_PRINT_DPI` (default 313,
resample density; adjust if prints come out scaled wrong).
