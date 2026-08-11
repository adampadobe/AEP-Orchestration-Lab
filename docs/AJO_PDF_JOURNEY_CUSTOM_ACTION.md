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

## Request payload to paste

This superset supports both built-in templates. At journey design time, mark the fields you need as Variable and map them from the event or profile. Fields unused by the selected template can remain empty strings.

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

The worker uses API campaign `30f45cd3-da50-436c-ae46-d0ab8f521f14` by default. Override it at deployment with the non-secret environment variable `PDF_JOURNEY_CAMPAIGN_ID` when a dedicated campaign is ready.

## Runtime sequence

1. AJO posts the selected template name, recipient, and journey data.
2. Firebase validates the API key and request contract.
3. Firebase creates an idempotent Firestore job and returns HTTP `202`.
4. The worker loads the built-in template and performs an escaped Handlebars merge.
5. Adobe PDF Services converts the completed HTML with `HTMLToPDFJob`.
6. Firebase stores the PDF in `dlz-ajoemailattachments`, plus private S3 and Google Cloud backups.
7. Firebase calls the AJO unitary execution API using recipient type `aep` and the DLZ-relative attachment path.
8. The worker records the PDF job ID, AJO execution ID, and final status without logging the personalisation payload.
