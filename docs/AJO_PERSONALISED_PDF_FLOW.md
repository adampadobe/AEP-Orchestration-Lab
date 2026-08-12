# AJO personalised PDF generation

The AEP Orchestration Lab generates or converts PDFs before an Adobe Journey Optimizer message is sent. Firebase owns template storage, data merge, Adobe PDF Services conversion, private object storage, expiry, and the handoff response.

The workspace exposes two PDF Services operations:

- **HTML to PDF:** merge JSON into escaped Handlebars HTML, ZIP `index.html`, then run `HTMLToPDFJob`.
- **Document to PDF:** upload a supported Word, PowerPoint, Excel, text, or image file and run `CreatePDFJob` without a data merge.

Adobe Document Generation (a DOCX template plus JSON merge) is a separate operation and is not implemented by the Document to PDF mode.

## Product boundary

The Lab now uses AJO's personalised PDF attachment contract: each PDF is stored in the sandbox's dedicated `dlz-ajoemailattachments` container and the API-triggered campaign receives a `dlzPath` attachment for an `aep` recipient. The opaque HTTPS download URL remains available for preview and backup delivery, but it is not the attachment source used by AJO.

## Runtime flow

1. An authorised Lab owner saves static HTML as a reusable template.
2. AJO calls `POST /generate` with `templateId`, recipient data, and an idempotency key.
3. Firebase renders Handlebars fields into escaped static HTML.
4. Firebase creates a ZIP whose top-level entry is `index.html`.
5. Adobe PDF Services runs `HTMLToPDFJob` and returns PDF bytes.
6. Firebase validates the `%PDF-` signature and enforces the 5 MB AJO attachment limit.
7. The PDF is written to a private Cloud Storage object.
8. Firebase returns an opaque download URL. The capability token expires independently of Firebase or AJO authentication.

The local merge happens before Adobe receives the ZIP. Adobe PDF Services converts complete HTML; it does not interpret AJO profile fields.

## Endpoints

Hosting base:

```text
https://aep-orchestration-lab.web.app/api/pdf-personalisation
```

Direct Cloud Function base (useful for the longer conversion request):

```text
https://us-central1-aep-orchestration-lab.cloudfunctions.net/pdfPersonalisation
```

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| `GET` | `/templates` | List the signed-in owner's templates | Firebase ID token |
| `POST` | `/templates` | Save private reusable HTML | Firebase ID token |
| `POST` | `/preview` | Merge data and return rendered HTML | Firebase ID token |
| `POST` | `/generate` | Generate HTML or convert a source document, store it, and issue a download URL | Firebase ID token or `X-PDF-API-Key` |
| `GET` | `/status/{jobId}` | Read a generation result and issue a fresh download URL | Firebase ID token or `X-PDF-API-Key` |
| `GET` | `/download/{token}` | Stream an unexpired PDF | Opaque capability token in URL |
| `POST` | `/journey-action` | Queue template selection, PDF generation, DLZ storage, and AJO campaign delivery | `X-PDF-API-Key` |
| `GET` | `/journey-action/templates` | List built-in journey template names | `X-PDF-API-Key` |
| `GET` | `/journey-action/status/{jobId}` | Inspect queued, processing, sent, or failed state | `X-PDF-API-Key` |

The owner UI is:

```text
https://aep-orchestration-lab.web.app/profile-viewer/pdf-personalisation.html
```

## Generate request

### HTML to PDF

```json
{
  "conversionMode": "html",
  "templateId": "saved-template-uuid",
  "idempotencyKey": "journey-instance-and-message-key",
  "documentName": "booking-confirmation.pdf",
  "data": {
    "bookingReference": "EK8F2Q",
    "passenger": {
      "firstName": "Amelia",
      "lastName": "Palmer"
    }
  },
  "options": {
    "pageWidth": 8.27,
    "pageHeight": 11.69,
    "includeHeaderFooter": false,
    "waitTimeToLoad": 100,
    "locale": "en-GB",
    "timeZone": "UTC"
  }
}
```

### Document to PDF

The browser workspace base64-encodes files for this JSON API. The source file is limited to 10 MB and is not persisted separately after Adobe consumes the uploaded asset.

```json
{
  "conversionMode": "document",
  "idempotencyKey": "journey-instance-and-document-key",
  "documentName": "booking-pack.pdf",
  "sourceDocument": {
    "fileName": "booking-pack.docx",
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "base64": "UEsDB..."
  }
}
```

Supported extensions are `doc`, `docx`, `ppt`, `pptx`, `xls`, `xlsx`, `rtf`, `txt`, `jpg`, `jpeg`, `png`, `bmp`, `gif`, `tif`, and `tiff`.

Use a stable idempotency key for one logical recipient/document send. Reusing the key with identical input returns the existing PDF. Reusing it with different input returns `PDF_IDEMPOTENCY_CONFLICT`.

## Ready response

```json
{
  "status": "ready",
  "jobId": "job-uuid",
  "conversionMode": "html",
  "sourceName": null,
  "templateId": "saved-template-uuid",
  "documentName": "booking-confirmation.pdf",
  "mimeType": "application/pdf",
  "size": 483921,
  "sha256": "...",
  "expiresAt": "2026-08-20T10:00:00.000Z",
  "downloadUrl": "https://aep-orchestration-lab.web.app/api/pdf-personalisation/download/opaque-token",
  "ajoHandoff": {
    "attachmentName": "booking-confirmation.pdf",
    "attachmentMimeType": "application/pdf",
    "attachmentUrl": "https://aep-orchestration-lab.web.app/api/pdf-personalisation/download/opaque-token"
  }
}
```

## AJO custom action

Use the asynchronous `/journey-action` endpoint so AJO receives a durable `202 queued` response before its external-action timeout while the worker performs conversion and campaign delivery. The complete copy-ready configuration, request schema, response schema, template names, and journey mappings are in [AJO_PDF_JOURNEY_CUSTOM_ACTION.md](AJO_PDF_JOURNEY_CUSTOM_ACTION.md).

## Template syntax

Templates use escaped Handlebars expressions:

```handlebars
Hello {{data.passenger.firstName}}

{{#each data.flightDetails}}
  {{flightNumber}}: {{departureAirport}} to {{arrivalAirport}}
{{/each}}
```

Available helpers:

- `{{formatDate value}}`
- `{{formatDateTime value}}`
- `{{formatCurrency value currency}}`

Triple braces are not recommended because they bypass HTML escaping.

## Security and retention

- HTML templates and PDF objects are private.
- Browser operations require the allow-listed, non-anonymous Firebase account.
- The AJO key is a Firebase secret and must never appear in Hosting JavaScript or Git.
- Templates reject active content, insecure resources, and private-host URLs.
- Object names contain opaque UUIDs rather than email addresses or booking references.
- PDF download tokens are random, stored only as SHA-256 hashes, and checked for expiry.
- Generated PDFs expire after 14 days by default; the daily cleanup function removes expired objects and metadata.
- Logs contain job identifiers and error codes, not personalisation payloads.

## Required secrets

PDF conversion uses a dedicated PDF Services Developer Console credential pair, intentionally isolated from the Lab's enterprise AEP/IMS connection:

- `PDF_SERVICES_CLIENT_ID`
- `PDF_SERVICES_CLIENT_SECRET`

The source credential JSON must remain outside the repository. Transfer its values directly into Firebase Secret Manager and bind only these secret names to `pdfPersonalisation`.

Machine-to-machine AJO access additionally requires:

- `PDF_PERSONALISATION_API_KEY`

The enterprise `ADOBE_CLIENT_ID` and `ADOBE_CLIENT_SECRET` remain bound to the existing AEP functions and are not used by this PDF conversion service.
