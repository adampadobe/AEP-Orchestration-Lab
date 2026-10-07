# AJO journey custom action: generate and email a personalised PDF

This custom action accepts journey data, selects a server-side HTML template, generates a PDF through Adobe PDF Services, stores it in the dedicated AJO email-attachment Data Landing Zone, and triggers the proven API campaign with the PDF attached.

The HTTP action only validates and queues the request, returning within the Journey Optimizer timeout. A Firestore worker performs conversion and delivery asynchronously. The same `requestId` is used for queue, PDF, and AJO idempotency so Journey Optimizer retries do not create another logical send.

## Copy-ready action configuration

| AJO field | Value |
|---|---|
| Name | `GeneratePersonalisedPDF` |
| Description | `Generate a personalised booking or check-in PDF and send it through the configured AJO API-triggered email campaign.` |
| Action type | `Custom` |
| Channel | `Email` |
| Required marketing action | `None` for this controlled demo; apply the governed production label before release |
| URL | `https://aep-orchestration-lab.web.app/api/pdf-personalisation/journey-action` |
| Method | `POST` |
| Content-Type | `application/json` |
| Charset | `UTF-8` |
| Query parameters | None |
| Authentication type | `API key` |
| Authentication name | `x-pdf-api-key` |
| Authentication location | `Header` |
| Authentication value | Generate a scoped key on **PDF Personalisation → AJO journey integration**, then paste the one-time value |

Open [PDF Personalisation](https://aep-orchestration-lab.web.app/profile-viewer/pdf-personalisation.html), sign in, and scroll to **Generate a custom-action API key**. The page provides individual Copy buttons for every action field, request payload, success response, failure response, and a **Copy all setup values** option.

The generated secret is shown once. Only its SHA-256 hash, owner, label, scope, and audit timestamps are stored. It is valid only for the PDF journey action, template-list, and status endpoints; it cannot call the manual HTML/DOCX conversion or private-template repository routes. Create separate named keys for independent AJO configurations so one can be revoked without disrupting another.

The existing Firebase Secret Manager value `PDF_PERSONALISATION_API_KEY` remains an operational fallback, but it should not be distributed to page users. Do not paste any key into a request payload, URL, repository, screenshot, or browser JavaScript. AJO encrypts the authentication value after it is saved.

## Key lifecycle

1. Sign in to the Lab and open the PDF Personalisation page.
2. Enter a descriptive name such as `AJO booking journey`.
3. Select **Generate API key**.
4. Copy the full `pdf_…` value from the one-time panel.
5. Paste it into the AJO custom action authentication **Value** field and save the action.
6. Return to the page to view redacted active-key metadata or revoke an obsolete key.

Revoking a key invalidates it immediately. The full secret cannot be recovered; generate another key if it was not copied.

## Server template library

The same PDF Personalisation page includes **Upload and manage custom-action templates**. An authorised user can:

1. Drop an HTML or supported source document into the page.
2. Choose a stable lowercase `templateName`, display label, output PDF filename, and email subject.
3. Upload the source into private Firebase Storage.
4. See built-in and uploaded templates in one server-side list.
5. Copy the exact template name into an AJO payload or archive an uploaded template.

HTML templates use the existing escaped Handlebars renderer and can reference payload values such as `{{data.bookingReference}}` and `{{data.passenger.firstName}}`. DOCX templates use Adobe Document Generation with the journey `data` object. Word templates may also use top-level `firstName` and `lastName`, which Firebase adds from the recipient fields. Other supported documents are converted directly to PDF and ignore personalisation data.

Uploaded templates are owner-scoped to the Firebase user who uploaded them. A self-service `pdf_…` API key carries that same owner identity, so it can resolve built-ins plus only that owner's uploaded template names. The operational fallback secret intentionally resolves built-ins only.

Deleting an uploaded template marks it unavailable for new actions but retains its immutable private source version so an already-queued worker can finish safely. Re-uploading the same stable name is allowed after deletion.

### Switching airline demos in the browser

The transactional test does not choose an arbitrary template on first use. An explicit
selection is remembered in this browser per signed-in account and Adobe sandbox.
If that template is unavailable, the dropdown remains on **Choose a published template**;
it never substitutes another airline's template. Choosing the empty option clears the
remembered choice. This is separate from **Use last values**, which restores confirmed-send
form values for 30 days.

The journey example retains its full instructions but uses `[customer name]`, `[origin]`
and `[destination]`. Replace these before **Populate fields**; unresolved placeholders
are rejected locally without calling the assistant. **Load example** restores that
unbranded text.

The feature-image picker includes a hosted **Doha West Bay skyline (illustration)** PNG.
It is a destination preset, not a Firefly-generated photograph. Legacy Riyadh images
and the Dubai Mall offer remain explicitly labelled choices, never automatic fallbacks.
The demo barcode is unbranded. A template's own image URL, sample values, filename and
embedded branding are preserved; review them before presenting to another airline.
Live Firefly generation still follows the actual booking destination, not the Doha preset.

## Request payload to paste

The PDF Personalisation page now includes a **Copy AJO field definition** button containing one universal AJO request schema for both built-in templates. It uses `optionalMapping: true` for template-specific fields so they may remain unmapped on the other journey activity.

Always map `requestId`, `templateName`, `emailAddress`, `firstName`, `lastName`, `bookingReference`, `flightNumber`, `departureAirport`, and `arrivalAirport`. `documentName` is optional because Firebase selects the template's default filename when omitted.

Booking-only optional fields are `ticketNumber`, `departureDateTime`, `arrivalDateTime`, `totalPaid`, and `currency`. Check-in-only optional fields are `originCity`, `destinationCity`, `boardingTime`, `gate`, `seat`, and `zone`. `departureTime` is accepted as an optional display value but is not rendered by the current built-in check-in template.

The following populated superset supports both built-in templates for direct endpoint testing. Fields unused by the selected template can be omitted.

```json
{
  "requestId": "booking-event-EK8F2Q-001",
  "templateName": "booking-confirmation",
  "emailAddress": "traveller@example.com",
  "firstName": "Amelia",
  "lastName": "Palmer",
  "documentName": "booking-confirmation.pdf",
  "data": {
    "bookingReference": "EK8F2Q",
    "ticketNumber": "1761234567890",
    "flightNumber": "EK 001",
    "departureAirport": "DXB",
    "arrivalAirport": "LHR",
    "originCity": "Dubai",
    "destinationCity": "London",
    "departureDateTime": "2026-08-12T07:45:00Z",
    "arrivalDateTime": "2026-08-12T15:10:00Z",
    "boardingTime": "07:00",
    "departureTime": "07:45",
    "gate": "A12",
    "seat": "24A",
    "zone": "3",
    "totalPaid": 1280.5,
    "currency": "GBP"
  }
}
```

Use one of these exact `templateName` values:

- `booking-confirmation`
- `checkin-confirmation`

### Optional generated destination image (Firefly / Firefly Foundry)

Add `imageGeneration` to opt a single request into an AI-generated hero image. The worker builds a generic, non-PII travel-photography prompt from the booking destination (`destinationCity`, `destination.city`, `arrivalCity`, an airport name, or the `arrivalAirport` IATA code), generates the image, stores it as a JPEG in `gs://aep-orchestration-lab-brand-scrapes/pdf-personalisation/generated/<hash>.jpg`, and merges its public URL into `data.FF_Image` before PDF conversion.

```json
{
  "imageGeneration": { "enabled": true, "provider": "firefly", "aspectRatio": "16:9" }
}
```

AJO can instead send flat fields: `generateImage` (`true`), `imageProvider` (`firefly` | `foundry`), and `imageAspectRatio` (`16:9` | `4:3` | `1:1`). Omitting both keeps the existing behaviour unchanged.

- **Firefly** (default) calls Firefly Services `POST /v4/images/generate-async` with model `image5`.
- **Foundry** calls `FOUNDRY_GENERATION_URL` (default `https://foundry-inference.adobe.io/v1/image/generate`) with the `x-foundry-model-id` header. The PDF functions set the non-secret `FOUNDRY_MODEL_ID` to `humain-image-api` (the HUMAIN sovereign model, same as humain-create); override it via the environment at deploy time. Foundry takes ~35 s per image and its content policy blocks some destinations (for example, Barcelona returns `FOUNDRY_CONTENT_FILTERED`); blocked or failed generations fall back without failing the PDF.
- Both reuse the lab's existing Adobe IMS client-credentials token (`ADOBE_CLIENT_ID` as `x-api-key`), with scopes from the `AEP_LAB_FIREFLY_SCOPES` secret.
- Identical destination/provider/aspect prompts are cached by hash, so retries and repeat bookings reuse the stored image.
- Image generation never blocks the PDF. On failure the worker keeps the original `data.FF_Image` (or omits the hero) and records the error code on the job.

The built-in `booking-confirmation` and `checkin-confirmation` templates render the hero only when `data.FF_Image` is present. For uploaded DOCX templates, insert a placeholder image sized as the hero should appear and set its alt text to `{"location-path":"FF_Image","image-props":{"alt-text":"Destination image"}}`; Document Generation replaces it with the image at the URL while keeping the placeholder's dimensions. The job status response includes an `image` object: `{ status: "generated" | "cached" | "fallback", provider, model, url, destination, error }`.

Map `requestId` to a stable unique source event identifier. It must remain identical if AJO retries the same action, but must differ for a genuinely new booking or check-in.

## Success response to paste

```json
{
  "status": "queued",
  "jobId": "6f442fca6b76330e4de4ded79e18fe718673fa52",
  "requestId": "booking-event-EK8F2Q-001",
  "templateName": "booking-confirmation",
  "campaignId": "30f45cd3-da50-436c-ae46-d0ab8f521f14",
  "acceptedAt": "2026-08-11T15:00:00.000Z",
  "reused": false
}
```

HTTP `202` means the request was authenticated, validated, and durably queued. A duplicate request with identical data returns HTTP `200`, the same `jobId`, and `reused: true`.

## Failure response to paste

Enable **Define a failure response payload**, then paste:

```json
{
  "status": "error",
  "error": "PDF_JOURNEY_TEMPLATE_INVALID",
  "message": "Unknown templateName. Use one of: booking-confirmation, checkin-confirmation."
}
```

On the journey action activity, enable **Add an alternative path in case of a timeout or an error**. AJO exposes the built-in `jo_status_code` and the configured failure response on that branch.

## Journey mappings

For a booking event:

- `templateName`: constant `booking-confirmation`
- `requestId`: the booking event ID
- `emailAddress`: profile email or event email
- `firstName`, `lastName`: profile or event passenger fields
- `documentName`: constant `booking-confirmation.pdf`
- Map the booking, ticket, flight, airport, time, and fare fields under `data`

For a check-in event:

- `templateName`: constant `checkin-confirmation`
- `requestId`: the check-in event ID
- `emailAddress`: profile email or event email
- `firstName`, `lastName`: profile or event passenger fields
- `documentName`: constant `checkin-confirmation.pdf`
- Map `bookingReference`, `flightNumber`, airport/city, boarding time, gate, seat, and zone under `data`

## Diagnostic endpoints

Both require the same `x-pdf-api-key` header.

```text
GET https://aep-orchestration-lab.web.app/api/pdf-personalisation/journey-action/templates
GET https://aep-orchestration-lab.web.app/api/pdf-personalisation/journey-action/status/{jobId}
```

The PDF Personalisation page also uses two portal-session-only image endpoints (they reject `x-pdf-api-key` callers):

```text
GET  /api/pdf-personalisation/journey-action/image-providers
POST /api/pdf-personalisation/journey-action/image-preview   { "data": {...}, "provider": "firefly", "aspectRatio": "16:9" }
```

The worker uses API campaign `30f45cd3-da50-436c-ae46-d0ab8f521f14` by default. Override it at deployment with the non-secret environment variable `PDF_JOURNEY_CAMPAIGN_ID` when a dedicated campaign is ready.

## Runtime sequence

1. AJO posts the selected template name, recipient, and journey data.
2. Firebase validates the API key and request contract.
3. Firebase creates an idempotent Firestore job and returns HTTP `202`.
4. When `imageGeneration` is enabled, the worker generates (or reuses) the destination image and sets `data.FF_Image`.
5. The worker loads the built-in template and performs an escaped Handlebars merge.
6. Adobe PDF Services converts the completed HTML with `HTMLToPDFJob`.
7. Firebase stores the PDF in `dlz-ajoemailattachments`, plus private S3 and Google Cloud backups.
8. Firebase calls the AJO unitary execution API using recipient type `aep` and the DLZ-relative attachment path.
9. The worker records the PDF job ID, AJO execution ID, and final status without logging the personalisation payload.
