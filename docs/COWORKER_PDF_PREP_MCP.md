# Coworker PDF preparation MCP

The focused PDF context exposes the existing Firebase PDF Personalisation workspace to Adobe AI Coworker without sharing the operational `X-PDF-API-Key`.

## Coworker configuration

| Field | Copy value |
|---|---|
| Name | `aep-lab-pdf-prep` |
| MCP URL | `https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/pdf` |
| Header | `X-AEP-Lab-Mcp-Key` |
| Key | Generate a sandbox-scoped key on the Profile Viewer MCP servers page |

The same tools are also present in the complete `aep-lab-general` context at `/mcp`.

Set the Coworker tool timeout to at least 330 seconds for PDF generation or server-template publication.

## Safe workflow

1. Call `lab_pdf_capabilities` before uploading a source.
2. For HTML, save or select a draft and call `lab_pdf_html_preview` before generation.
3. For DOCX merge data, optionally call `lab_pdf_extract_docx_data` to create editable JSON.
4. Call `lab_pdf_generate` with a fresh `idempotency_key`. Reuse that key only for an exact retry.
5. Open the returned private `previewUrl`. The response also includes storage locations, hash, size, expiry, and a download URL.
6. Use `lab_pdf_job_list` or `lab_pdf_job_status` to issue fresh links while the file is retained.
7. Analyse a reusable server template before publishing it. Publication and archive operations require explicit confirmation.

## Source and output limits

| Input or output | Limit |
|---|---:|
| HTML template | 1.5 MB |
| HTML JSON data | 1.5 MB |
| Source document | 10 MB |
| DOCX merge JSON | 8 MB |
| Generated PDF | 5 MB |
| Generated PDF retention | 14 days by default |

Supported document sources include Word, PowerPoint, Excel, RTF, text, JPEG, PNG, BMP, GIF, and TIFF. A DOCX plus non-empty merge data uses `DocumentMergeJob`; other supported documents use `CreatePDFJob`. HTML uses `HTMLToPDFJob`.

The MCP does not return PDF binary in the model context. It returns an expiring private HTTPS resource link. Source documents used for one-off generation are not retained; generated PDFs are stored in the configured DLZ route with optional S3 and GCS backups. Private HTML drafts and published server templates are retained separately.

## Example prompts

### HTML draft and PDF

> Use `aep-lab-pdf-prep` in sandbox `apalmer`. Save this HTML as a private draft with the supplied JSON, preview the merged HTML, and show me the preview summary. Do not generate the PDF until I confirm. After confirmation, generate `customer-demo.pdf` with a fresh idempotency key and return the private preview link.

### Uploaded Word document

> Inspect PDF capabilities, then convert the attached DOCX to `customer-proposal.pdf` in sandbox `apalmer`. Use the attached JSON as merge data, generate with a fresh idempotency key, and return the job ID, page preview, expiry, and storage locations.

### Reusable server template

> Analyse the attached template and show the detected fields and suggested mappings. Do not publish it yet. After I confirm the exact template name and expected page count, validate it through Adobe PDF Services and publish it as a user-owned server template.

## Security boundaries

- The Firebase API derives the owner and sandbox from the user-generated MCP key.
- A caller cannot select another owner, and a mismatched sandbox is rejected.
- Existing Firebase portal authentication and journey custom-action keys remain separate.
- Built-in server templates are read-only.
- Published-template archive requires the exact name and `confirmed: true`.
- Download tokens are opaque, private, expiring capability URLs.
