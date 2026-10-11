# Matt & Hailey's Wedding Guestbook

A kiosk-style digital guestbook. Guests enter a name and optional note, take a
photo, and print a captioned photo card. The web client is a static React
app hosted on GitHub Pages. The live backend uses AWS API Gateway, Lambda,
DynamoDB, and a private S3 bucket.

## Architecture

- `client/`: React + Vite user interface.
- `backend/src/handler.mjs`: AWS Lambda API for guestbook entries and signed
  photo uploads.
- `template.yaml`: AWS SAM infrastructure definition.
- `.github/workflows/deploy-pages.yml`: builds and publishes the client.

Photos upload directly from the browser to private S3 using short-lived
pre-signed URLs. Entry metadata is stored in DynamoDB. The API returns
time-limited photo URLs for the gallery and print view. The API is public so
guests can submit entries; do not put private information in the guestbook.

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

At 25 mm, the calibration page is 1.33 inches long and guest photo cards are
1.38 inches long to add a small blank tail. At 50 mm, guest photo cards are
about 2.53 inches long. The print bridge scales the image to the selected roll
width and sends it directly to the printer with auto-cut enabled. The default
print width is 50 mm; set `VITE_PRINT_WIDTH_MM=25` for 1-inch stock.
For example:

```bash
VITE_PRINT_WIDTH_MM=25 npm run dev
```

To start the guestbook server, run this from the project root:

```bash
./launch.sh
```

The launcher serves the app over HTTPS on the local network, allowing iPhones
to use the live camera preview. Set up the local certificate once before
launching:

1. Install `mkcert` on the Mac (`brew install mkcert`).
2. Run `./setup-lan-https.sh` from the project root. It prints the path to
   `rootCA.cer` and creates the HTTPS certificate used by the launcher. Transfer
   the CA certificate to the iPhone using AirDrop or another private method.
   **Never transfer `rootCA-key.pem`.**
3. On the iPhone, open the certificate and install its configuration profile
   in Settings. Then go to **Settings → General → About → Certificate Trust
   Settings** and enable full trust for the local certificate.
4. Run `./launch.sh`. Open the printed `https://<Mac-LAN-IP>:5173` address in
   Safari on the iPhone and allow camera access.
5. To launch like an app, tap Safari's **Share → Add to Home Screen**, then open
   the new home-screen icon. This uses the Apple Touch Icon and hides Safari's
   browser controls. The iOS status bar remains visible over the app.

`./launch.sh` only starts the app; it does not generate certificates. The
setup script includes all active IPv4 interface addresses in the certificate,
and the launcher lists the addresses to use from each connected network. The
existing HTTPS certificate remains in place between launches. Run
`./setup-lan-https.sh` again if the Mac's network addresses change. If the
iPhone shows a certificate warning, reinstall/trust the CA certificate before
using the camera. Keep the iPhone and Mac on the same network; check the Mac
firewall and Wi-Fi client isolation if the address cannot be reached.

For an iPad on a local Wi-Fi network without internet, keep the Mac connected
to that network and to an internet-enabled network. In local development, the
Mac relays guestbook reads, saves, and image uploads to the AWS API and S3, so
the iPad only needs to reach the Mac. The Mac must have outbound internet
access for guestbook entries to save; printing remains handled by the Mac.

Entries/photos still use the configured AWS API, and direct print jobs are
sent by the Mac to the printer configured by `PRINTER_HOST`. GitHub Pages
supports the live camera, but does not currently connect to the Mac's private
print bridge; use the LAN-hosted app URL for automatic network printing.

Pass `-k` to also open Chrome in kiosk mode:

```bash
./launch.sh -k
```

Pass `-a` to show the admin-only demo and calibration print buttons:

```bash
./launch.sh -a
```

Pass `-t` to enable test mode. A persistent banner warns that nothing will be
saved or printed; guest entries and print jobs are simulated. Combine it with
other launcher options as needed, for example `./launch.sh -a -k -t`.

The launcher defaults to 50 mm labels. Use `VITE_PRINT_WIDTH_MM=25 ./launch.sh`
for 1-inch stock. At startup, it reports the label width and whether it is
running live network printing or test mode. After a guest confirms their entry,
it sends the print job directly over the network to `PRINTER_HOST`; it never
invokes the macOS print driver. Confirm the printer's selected roll size
matches the launcher setting. Press Ctrl-C in the launcher terminal to stop
the local server.

## Operational notes

- The API permits anonymous uploads and reads to support the public wedding
  guestbook. Consider deleting the AWS stack after the event if the service is
  no longer needed.
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
