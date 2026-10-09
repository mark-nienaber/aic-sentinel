# AIC Sentinel

**Version:** 1.0.0
**Author:** Mark Nienaber

A local web based log viewer for PingOne Advanced Identity Cloud (AIC). It gives you live tailing, historical search, a combined AM and IDM view, and noise filtering, without leaving the browser.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey)
![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue)

## Overview

AIC Sentinel is a dashboard for watching and searching the logs of an AIC tenant. Command line tools usually keep AM and IDM output in separate streams. Sentinel interleaves every source into one list, newest first, so you can follow a request as it moves between the two.

What it does:

- **Live tailing** over a WebSocket, with a configurable poll frequency
- **Combined AM and IDM view**, interleaved with the newest entries at the top
- **14 noise filter categories** to hide chatty loggers (Session, Config, REST, Health, LDAP and others), each with its own toggle
- **Readable messages** that pull out the event name, principal, journey name, outcome, HTTP method and path, and similar fields so you do not have to expand every row
- **Transaction tracing**: hover a transaction ID, click the Trace badge, and every log for that transaction is shown
- **Historical search** by time range, with pagination and a banner that lets you return to live tailing
- **Saved connections** for multiple tenants, with credentials kept in your operating system keychain
- **Export** to JSON, plain text, or CSV

## Design Philosophy and Related Tools

Sentinel talks to the [PingOne AIC Monitoring API](https://docs.pingidentity.com/pingoneaic/latest/tenants/audit-debug-logs-pull.html) with plain REST calls and has four production dependencies: Express, ws, dotenv, and `@napi-rs/keyring`. There is no SDK, and the HTTP client is about 170 lines. There is no build step to run either. The Tailwind stylesheet is generated ahead of time and committed, and Alpine.js is vendored, so `npm start` is all you need.

If you work with AIC regularly, take a look at the [**Frodo CLI**](https://github.com/rockcarver/frodo-cli) and [**frodo-lib**](https://github.com/rockcarver/frodo-lib). Frodo covers far more than logs: journeys, scripts, OAuth2 clients, IDM configuration, secrets, variables, and promotion between environments. It also has log tailing and search. It is the better choice for automation and CI/CD, and the [Frodo CLI documentation](https://github.com/rockcarver/frodo-cli/blob/main/README.md) is the place to start.

Sentinel could integrate with frodo-lib in a future version, for example to look up the journeys, scripts, or OAuth2 clients that appear in log entries, or to support service account authentication alongside API keys. For now it stays focused on fast, visual log debugging.

[**fidc-debug-tools**](https://github.com/vscheuber/fidc-debug-tools) by Volker Scheuber was the original inspiration for this project. It is a command line log tailer with configurable filters, and it works well when you want to pipe output into `jq` or other shell tools.

## Security Model

Sentinel is meant to run on your own machine and is built to refuse anything else.

- **Loopback only.** The server listens on `127.0.0.1`. HTTP requests and WebSocket upgrades from a non local address are rejected, and a request that carries an `Origin` header must come from `127.0.0.1`, `localhost`, or `[::1]` on the server's own port. This blocks other websites from driving the API through your browser.
- **Credentials stay on the server.** After a successful connection, the API key and secret are written to the OS keychain (macOS Keychain, Windows Credential Manager, or the Secret Service on Linux). The browser only ever receives a tenant ID, name, and URL. API calls and the WebSocket refer to a tenant by ID, and the server looks up the credentials itself.
- **Restricted tenant hosts.** The tenant URL must be an HTTPS origin with no path, query, or fragment. Hostnames must end in `.forgeblocks.com` or `.id.forgerock.io`. A custom domain is accepted only after you tick the approval checkbox for that URL. Every hostname must resolve to public IP addresses, and raw IP addresses are rejected. This keeps the server from being pointed at internal services.
- **Tenant profile file.** Names and URLs (never secrets) are stored in `~/.config/aic-sentinel/tenants.json`, or under `$XDG_CONFIG_HOME` if set, or `%APPDATA%` on Windows. The directory is created with mode `0700` and the file with `0600`.
- **Content Security Policy.** All scripts and styles are served from the app itself, with no CDN. The policy includes `'unsafe-eval'` because Alpine.js evaluates template expressions at runtime.
- **If the keychain is unavailable**, Sentinel falls back to holding credentials in memory. They are lost when the server stops, and the UI shows a warning when this happens.

## Prerequisites

### 1. Node.js 18 or higher

```bash
node --version   # v18.x or higher
npm --version    # bundled with Node.js
```

Install it from [nodejs.org](https://nodejs.org/) or with a version manager such as [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 18
nvm use 18
```

### 2. An AIC tenant

You need a PingOne Advanced Identity Cloud tenant where you can create a Log API key.

### 3. A Log API key and secret

1. Sign in to the AIC admin console
2. Go to **Tenant Settings** > **Log API Keys**
3. Click **New Log API Key**
4. Copy the **Key ID** and the **Secret**. The secret is shown only once.

> **Note:** The Log API gives read only access to audit and debug logs. It cannot change tenant configuration.

### 4. A working OS keychain (recommended)

macOS and Windows work out of the box. On Linux you need a running Secret Service provider such as GNOME Keyring or KWallet. Without one, Sentinel still works but credentials last only until the server stops.

## Installation

```bash
git clone https://github.com/mark-nienaber/aic-sentinel.git
cd aic-sentinel
npm install
```

`npm install` is required after every pull that changes `package.json`. If you skip it you may see `Cannot find module '@napi-rs/keyring'` when the server starts.

Production dependencies:

- `express` serves the API and static files
- `ws` provides the WebSocket used for live tailing
- `dotenv` loads the optional `.env` file
- `@napi-rs/keyring` reads and writes the OS keychain

### Optional: environment settings

```bash
cp .env.example .env
```

The `.env` file is optional. It only controls the port and the default poll and buffer settings (see the [Configuration Reference](#configuration-reference)). Tenant credentials are **not** read from `.env` by the app. You enter them in the browser.

## Running the Application

```bash
npm start        # run the server
npm run dev      # restart automatically when files change
npm stop         # stop whatever is listening on PORT (default 3000)
```

On startup you should see:

```
AIC Sentinel local-only service running at http://127.0.0.1:3000
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

## Connecting to Your Tenant

1. Enter the **Tenant URL**, for example `https://openam-yourtenant.forgeblocks.com`
2. Enter the **API Key** and **API Secret**
3. If the URL is not a `*.forgeblocks.com` or `*.id.forgerock.io` address, a checkbox appears asking you to approve the custom domain. Tick it to continue.
4. Click **Connect**

Sentinel tests the credentials against the tenant first. Only if that succeeds does it save the tenant profile and write the key and secret to your keychain. Live tailing then starts.

### Saved Connections

Every successful connection is saved automatically.

- **Reconnect:** open the **Saved Connections** dropdown and pick a tenant, then click **Connect**. The key and secret fields are replaced by a note saying they are stored in your OS keychain, so there is nothing to retype, including after a restart.
- **Change the URL:** if you edit the Tenant URL after picking a saved tenant, the key and secret fields come back so you can enter new values.
- **Delete:** click the trash icon next to a tenant in the dropdown, or the **Delete** link shown for the selected tenant. After you confirm, the profile is removed from `tenants.json` and its keychain entry is deleted.

## Usage Guide

### Live Log Tailing

- Logs arrive over a WebSocket from the tenant
- AM and IDM logs are shown together by default
- The newest logs appear at the top, so you never need to scroll down to see what just happened
- Rows are color coded by source: amber for AM and cyan for IDM
- Levels are color coded too: red for ERROR, yellow for WARNING, blue for INFO, gray for DEBUG
- The message column shows a summary (event name, principal, journey name, node outcome, request path and so on) so you can find the right entry before expanding it
- Click a row to see the full JSON payload with syntax highlighting
- Autoscroll keeps the view at the top. Scroll down to browse older entries, then click **Latest logs** to jump back.

### Filtering

| Filter | Description |
|--------|-------------|
| **Sources** | Choose which log sources to include (AM, IDM, or individual sub sources) |
| **Level** | Show only ERROR, WARNING, INFO, or DEBUG entries |
| **Search** | Free text search across messages, logger names, and full payloads |
| **Transaction ID** | Show a single transaction. Hover any transaction ID and click the Trace badge to fill this in. |
| **Noise Filter** | 14 categories of noisy loggers grouped by severity (High, Medium, Low, IDM), each with a toggle. High, Medium, and IDM are on by default. Low is off. |

### Transaction Tracing

A transaction ID ties together the log entries produced by one request, across AM and IDM.

1. Hover a transaction ID in the log list and it turns into an orange **Trace** badge
2. Click the badge to filter everything to that transaction
3. The Transaction ID input is highlighted while the filter is active
4. Click the **×** on the input to clear it

This is useful for following an authentication flow, an OAuth token exchange, or an IDM sync operation that spans many entries.

### Historical Search

Click the clock icon to open the panel.

1. Pick a quick range (15 minutes, 1 hour, and so on) or set a custom start and end time
2. Optionally add a transaction ID or a query filter
3. Click **Search**
4. Click **Load More Results** to page through the results. The API returns up to 1000 entries per page.
5. A banner and an amber **Historical** indicator in the status bar show that live tailing is paused. Click **Resume Live Tailing** to go back.

> **Note:** The Monitoring API limits a historical query to a 24 hour window. Keep your range within that.

### Exporting Logs

Click the export icon in the toolbar.

| Format | Description |
|--------|-------------|
| **JSON** | A formatted JSON array of the log entries |
| **Text** | Readable lines with timestamp, source, level, and message |
| **CSV** | Columns: timestamp, source, level, logger, transactionId, message |

You can export everything in the buffer or only the entries currently visible after filtering.

### Settings

Click the gear icon.

| Setting | Description | Default |
|---------|-------------|---------|
| **Poll Frequency** | Seconds between API polls (2 to 30) | 10 |
| **Max Buffer Size** | Maximum number of logs held in browser memory (1,000 to 10,000) | 5000 |
| **Auto scroll** | Keep the view on the newest logs | On |
| **Noise Categories** | See and toggle all 14 categories, with the loggers each one covers | |
| **Muted Loggers** | Mute individual loggers. You can also hover a logger name in the list and click the mute icon. | |

Noise category choices and muted loggers are remembered in your browser's local storage.

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port the server listens on (always on `127.0.0.1`) | `3000` |
| `POLL_FREQUENCY` | Default seconds between tail polls | `10` |
| `MAX_LOG_BUFFER` | Default maximum logs held in the browser | `5000` |
| `TENANT_URL` | E2E tests only: tenant URL | |
| `API_KEY_ID` | E2E tests only: Log API key ID | |
| `API_KEY_SECRET` | E2E tests only: Log API secret | |
| `TEST_USER` | E2E tests only: AIC username | |
| `TEST_PASS` | E2E tests only: AIC password | |

### Available Log Sources

| Source | Description |
|--------|-------------|
| `am-everything` | All AM log sources combined |
| `am-access` | AM access audit logs |
| `am-activity` | AM activity audit logs |
| `am-authentication` | AM authentication events |
| `am-config` | AM configuration changes |
| `am-core` | AM core debug logs |
| `idm-everything` | All IDM log sources combined |
| `idm-access` | IDM access audit logs |
| `idm-activity` | IDM activity audit logs |
| `idm-authentication` | IDM authentication events |
| `idm-config` | IDM configuration changes |
| `idm-core` | IDM core debug logs |
| `idm-recon` | IDM reconciliation events |
| `idm-sync` | IDM automatic sync changes |
| `environment-access` | Environment audit logs (ESV changes, promotions) |
| `ws-everything` | All WS-Federation log sources combined |
| `ws-activity` | WS-Federation authentication events |
| `ws-config` | WS-Federation configuration changes |
| `ws-core` | WS-Federation core debug logs |
| `ctsstore` | Core Token Service store logs |
| `ctsstore-access` | CTS access logs |
| `userstore` | User store directory logs |
| `userstore-access` | User store access logs |

## Development

### Unit tests

```bash
npm run test:unit
```

These use Node's built in test runner and run offline. The keychain and the tenant network calls are replaced with fakes. They cover the origin and DNS policy, the local only request checks, the tenant registry, the credential store (including the in memory fallback), the connection routes, the WebSocket tail manager, and the frontend asset and CSP checks.

### Rebuilding the stylesheet

`public/vendor/tailwindcss/tailwind.css` is generated from `assets/tailwind.css` and committed, because the app does not build CSS at runtime. If you add Tailwind classes to `public/index.html` that are not already in the file, regenerate it:

```bash
npx tailwindcss -c tailwind.config.js -i assets/tailwind.css \
  -o public/vendor/tailwindcss/tailwind.css --minify
```

### End to end tests

`npm run test:e2e` runs `tests/e2e.test.js` against a live tenant and a running server. It needs `TENANT_URL`, `API_KEY_ID`, `API_KEY_SECRET`, `TEST_USER`, and `TEST_PASS` in `.env`.

> **Note:** This suite was written before credentials moved server side. It still calls `POST /api/connect` and opens the WebSocket without an `Origin` header, so it will not pass against the current server until it is updated to use the tenant routes and a local origin. Treat the unit tests as the working suite for now.

## Architecture

```
aic-sentinel/
├── server.js                  # Express and WebSocket entry point
├── package.json
├── tailwind.config.js
├── .env.example               # Optional settings template
├── assets/
│   └── tailwind.css           # Tailwind input used to build the stylesheet
├── src/
│   ├── api/
│   │   ├── logClient.js       # AIC Monitoring API client (tail and query)
│   │   └── rateLimiter.js     # Tracks X-RateLimit headers
│   ├── credentials/
│   │   └── credentialStore.js # OS keychain wrapper with in memory fallback
│   ├── tenants/
│   │   └── tenantRegistry.js  # Tenant profiles in tenants.json (no secrets)
│   ├── security/
│   │   ├── localOrigin.js     # Loopback and Origin checks, CSP header
│   │   └── originPolicy.js    # Tenant hostname, port, and DNS validation
│   ├── services/
│   │   └── tenantClient.js    # Builds a log client from a saved tenant ID
│   ├── ws/
│   │   └── tailManager.js     # Per client WebSocket polling
│   ├── routes/
│   │   ├── connection.js      # /api/tenants: list, save, test, delete
│   │   └── logs.js            # /api/config, sources, categories, logs/search
│   └── data/
│       ├── categories.json    # 14 noise filter categories
│       └── sources.json       # Log source metadata
├── tests/
│   ├── unit/                  # Offline unit tests (npm run test:unit)
│   └── e2e.test.js            # Live tenant tests (needs updating, see above)
└── public/
    ├── index.html             # Single page application
    ├── css/app.css            # Custom styles
    ├── vendor/                # Alpine.js and generated Tailwind CSS
    └── js/
        ├── app.js             # Alpine component and WebSocket client
        └── utils/
            ├── formatter.js   # Log formatting and JSON highlighting
            └── timeUtils.js   # Date and time helpers
```

- **Backend:** Node.js, Express for HTTP, and the `ws` library for WebSocket streaming
- **Frontend:** Alpine.js and Tailwind CSS, both served from `public/vendor`
- **API:** the [PingOne AIC Monitoring API](https://docs.pingidentity.com/pingoneaic/tenants/audit-debug-logs-pull.html), which allows 60 requests per minute

### HTTP and WebSocket interface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/tenants` | List saved tenant profiles and keychain status |
| `POST /api/tenants` | Validate and test credentials, then save the profile and keychain entry |
| `POST /api/tenants/:id/test` | Test a saved tenant using its stored credentials |
| `DELETE /api/tenants/:id` | Remove a tenant profile and its keychain entry |
| `POST /api/logs/search` | Historical search for a tenant by ID |
| `GET /api/config`, `/api/sources`, `/api/categories` | Defaults and static metadata |
| `ws://127.0.0.1:PORT/ws/tail` | Live tailing. The client sends a `connect` message with a tenant ID. |

## Troubleshooting

### Cannot find module '@napi-rs/keyring'

Dependencies are out of date. Run `npm install` and start the server again.

### Port already in use

If you see `EADDRINUSE: address already in use 127.0.0.1:3000`:

```bash
npm stop

# or pick another port
PORT=3001 npm start
```

### Connection fails

- Use an `https://` URL with no path and no trailing slash
- Check the API Key ID and Secret. A lost secret cannot be recovered, so create a new key.
- A message saying the domain requires explicit approval means the URL is not a `*.forgeblocks.com` or `*.id.forgerock.io` address. Tick the approval checkbox if you trust it.
- A message about the hostname resolving to non public addresses means DNS returned a private or loopback IP, which Sentinel refuses
- Make sure your network can reach the tenant (firewall, VPN, proxy)

### Credentials seem lost after a restart

Credentials are kept in the OS keychain, not in the browser. Select the tenant from **Saved Connections** and click **Connect**. If the form shows an amber "OS keychain unavailable" warning, the keychain could not be used and credentials were held in memory only. Check that your keychain or Secret Service is running and unlocked, then connect again.

### No logs appearing

- Confirm the tenant has activity that produces logs
- Check which log sources are selected
- Open the Noise Filter and disable a few categories to see whether logs are being hidden
- Look at the rate limit counter in the status bar. At 0 remaining, wait for the reset.

### Rate limiting

The Monitoring API allows 60 requests per minute and the status bar shows the current count. If you reach the limit, Sentinel backs off and resumes when it resets.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Free for personal, educational, and noncommercial use. Contact the author for commercial licensing.
