# n8n-nodes-proweblook

Connect n8n to [ProWebLook](https://proweblook.com/) to verify an email address, validate a phone number, check WhatsApp registration, or read product credit balances.

Licensed under the [MIT License](LICENSE). Maintained by ProWebLook (`info@proweblook.com`).

## Installation and credentials

Install `n8n-nodes-proweblook` using n8n's [Community Nodes](https://docs.n8n.io/integrations/community-nodes/installation/) settings. For local development, run `npm ci`, `npm run build`, and `npm run dev` in this directory with Node.js 22.16+ (tested on Node.js 24 with `n8n-core` 2.16.1 / `n8n-workflow` 2.16.0).

Create a **ProWebLook API** credential and paste your account API key from your ProWebLook dashboard into the password field. n8n stores credentials encrypted using its own encryption key. The node sends the key only in an `Authorization: Bearer` header to the fixed `https://proweblook.com` host. Credential testing uses only free `POST /api/v1/n8n/get_balance` requests. n8n may repeat an unsuccessful credential probe once; paid node operations disable that helper retry path. No paid verification runs when saving credentials.

Do not paste API keys into node parameters or workflow JSON. Exported examples include no credentials. Credential storage, access controls and execution log retention are controlled by your n8n installation.

## Operations

| Operation         | Example input                                          | Credit behavior                                                             |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Get Balances      | No fields                                              | Free; returns email, phone and WhatsApp pools as `{amount, unlimited}`      |
| Verify Email      | `person+tag@example.com`                               | One email credit for a completed verdict, including negative results        |
| Validate Phone    | `+12025550123`; or `2025550123` with Country Code `US` | Up to one phone credit per request under the account's product rules        |
| Validate WhatsApp | `+12025550123`                                         | Up to one WhatsApp credit for a registration check; sends no message or OTP |

Map an upstream item with expressions such as `{{ $json.email }}` or `{{ $json.phone }}`. Use phone **strings**, preserving the leading `+`. Enter digits only (without spaces, parentheses or dashes). Country Code is a two-letter ISO code, required only for national phone input. Every item produces one corresponding output item with n8n item linking. The API's `data` object becomes the output JSON without changing negative/unknown verdicts or product-specific charge/refund fields.

A negative, unknown or catch-all result is a completed lookup, not a node error. Catch-all does not prove that a mailbox exists. Phone validity and WhatsApp registration do not prove ownership or consent. Results are best-effort and carry no accuracy guarantee.

## Cost, errors and retries

Each input item makes at most one API invocation; structurally invalid input fails locally. This node has no automatic retries, deduplication, background checks or pagination. It is disabled as an AI tool. n8n may dispatch multiple input items concurrently; stopping on an error does not cancel requests for other items that have already started.

The dedicated API must be enabled by the ProWebLook operator before use. It allows 60 requests per minute per account, including free balance checks; HTTP 429 includes a 60-second retry delay. This node never automatically retries.

The default **On Error** behavior stops the node. n8n's **Continue (using regular output)** returns a safe `{error: "…"}` item, linked to the failed input. The error-output mode is managed by n8n. Authentication, insufficient credits, throttling, provider failure and malformed API envelopes produce errors; HTTP 200 application errors never become successful verification data. Upstream diagnostic bodies and request credentials are not included in node errors.

A timeout or interrupted response does not establish that no credit was consumed. Check balances before rerunning. Manual reruns, workflow-level retries, or enabling n8n's **Retry On Fail** setting can make another paid request. ProWebLook applies the existing product billing/refund rules, including email failure refunds where applicable; the node does not apply a second debit or promise a refund.

Import the four [manual-trigger examples](examples/). They are inactive and use synthetic addresses/numbers. Add your own credential and inspect credit costs before executing. There are no scheduled triggers or automatic confirmations: the workflow owner chooses when to activate and run a workflow. Synthetic examples are not approval to perform paid tests.

## Service accounting and privacy

The package contains no analytics, runtime dependencies, filesystem or environment access. Each request is sent to a dedicated ProWebLook n8n API route. ProWebLook records minimal service usage metadata: a server-generated event ID, account identity when authenticated, fixed operation, outcome, latency and timestamps, retained for 90 days with designated reviewer/test accounts excluded. This supports account activity reporting and service operation; it does not prove an n8n marketplace installation.

New integration usage events exclude API keys/key hashes, checked emails/numbers, provider messages/results, workflow/instance/execution IDs and prompts. Existing product service/billing records may follow their existing policies. Your n8n workflow execution history may contain input targets and validation results; manage that history separately. ProWebLook cannot see when an API-key credential is deleted from n8n, so connected/authorized account counts for n8n are unavailable. Service accounting is disclosed for n8n review; this is not a claim of verification approval.

See [privacy](https://proweblook.com/privacy-policy), [API documentation](https://proweblook.com/documentation) and [support](https://proweblook.com/contact).

## Development and publishing

`npm test` builds and exercises routing behavior and the real n8n routing runtime against mocked HTTP. `npm run lint` checks official n8n rules (including Cloud strict mode). `npm pack --dry-run` lists distributable files. Tests never send requests to a provider or production API. The checked-in logo is copied from the official ProWebLook organization logo; trademark rights are not granted.

Releases are published from GitHub Actions via `.github/workflows/publish.yml` with npm provenance (`npm run release`).
