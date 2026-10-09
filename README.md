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
For automatic network printing, the printer must be reachable over the network
by the Mac running the print bridge. Choose the matching roll width in the
printer setup: 50 mm for 2-inch labels or 25 mm for 1-inch test labels.

The default is `25` for a 25 mm wide calibration page 1.33 inches long; guest
photo cards are 1.38 inches long to add a small blank tail. Set
`VITE_PRINT_WIDTH_MM=50` for a 50 mm wide card about 2.53 inches long. The
print bridge scales the image to the selected roll width and sends it directly
to the printer with auto-cut enabled.
For example:

```bash
VITE_PRINT_WIDTH_MM=25 npm run dev
```

To start the guestbook server, run this from the project root:

```bash
./launch.sh
```

The launcher serves the app over HTTPS on the local network, allowing iPhones
to use the live camera preview. On first run it creates and trusts a local
certificate authority on the Mac. To connect an iPhone, install the CA
certificate printed by the launcher/setup script:

1. Install `mkcert` on the Mac (`brew install mkcert`).
2. Run `./setup-lan-https.sh` from the project root. It prints the path to
   `rootCA.cer`; transfer that certificate to the iPhone using AirDrop or
   another private method. **Never transfer `rootCA-key.pem`.**
3. On the iPhone, open the certificate and install its configuration profile
   in Settings. Then go to **Settings → General → About → Certificate Trust
   Settings** and enable full trust for the local certificate.
4. Run `./launch.sh`. Open the printed `https://<Mac-LAN-IP>:5173` address in
   Safari on the iPhone and allow camera access.
5. To launch like an app, tap Safari's **Share → Add to Home Screen**, then open
   the new home-screen icon. This uses the Apple Touch Icon and hides Safari's
   browser controls. The iOS status bar remains visible over the app.

The certificate is regenerated when `./launch.sh` starts, so a changed Mac
LAN IP is covered automatically. If the iPhone shows a certificate warning,
reinstall/trust the CA certificate before using the camera. Keep the Mac and
guest devices on the same Wi-Fi; check the Mac firewall and Wi-Fi client
isolation if the address cannot be reached. Entries/photos still use the
configured AWS API, and direct print jobs are sent by the Mac to the printer
configured by `PRINTER_HOST`. GitHub Pages supports the live camera, but does
not currently connect to the Mac's private print bridge; use the LAN-hosted app
URL for automatic network printing.

Pass `-k` to also open Chrome in kiosk mode:

```bash
./launch.sh -k
```

Pass `-t` to enable test mode. A persistent banner warns that nothing will be
saved or printed; guest entries and print jobs are simulated, and disposable
camera/admin routes are disabled. Combine it with `-k` to run the app in kiosk
mode, for example `./launch.sh -k -t`.

The launcher defaults to 25 mm labels. Use `VITE_PRINT_WIDTH_MM=50 ./launch.sh`
for 2-inch stock. After a guest confirms their entry, it sends the print job
directly over the network to `PRINTER_HOST`; it never invokes the macOS print
driver. Confirm the printer's selected roll size matches the launcher setting.
Press Ctrl-C in the launcher terminal to stop the local server.

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

Setting `PRINTER_HOST` makes the dev server send the job straight to the printer over
the network (TCP 9100) with `<cutmode>full</cutmode>`, using the protocol from
[vc-500w_autocut](https://github.com/corentin-soriano/vc-500w_autocut). The app
does not fall back to the macOS print driver: if direct printing fails, it
shows an error. The entry has already been saved, and retrying the print does
not create a second entry.

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
