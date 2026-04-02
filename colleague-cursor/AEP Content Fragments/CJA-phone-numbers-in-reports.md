# CJA: Getting Phone Numbers in Reports (Bounce Reasons)

## What your current request does

Your curl calls the **ranked report** endpoint with:

- **Dimension (rows):** `variables/adobe_reserved_label.ajo_messageErrorReason` → one row per **bounce/error reason**
- **Metric:** `cm_ajo_eventErrors`
- **Global filters:** Campaign "Mobile App Download Campaign - SMS - FY25", channel SMS, Not Test Events, date range

So the API returns a table like:

| Error reason (dimension) | Event errors (metric) |
|--------------------------|------------------------|
| Invalid number           | 150                    |
| Carrier block            | 42                     |
| …                        | …                      |

There is **no phone number in the request**. The report has only one dimension (error reason). If you see “no value” it’s usually because:

1. You expect a **second column** (e.g. phone) but the request only has one dimension, or  
2. Some rows have an empty/null value for the dimension and the UI shows that as “no value”.

To see **which phone numbers** had which bounce reason, you need to introduce the dimension that holds the phone (recipient/destination) in the same report.

---

## How to get phone numbers in the report

You have two main patterns:

### Option 1: Phone numbers as rows (primary dimension)

- Set the **main dimension** to the one that represents the **recipient/phone** (e.g. destination address or profile mobile).
- Keep your metric (e.g. `cm_ajo_eventErrors`).
- Optionally add a **breakdown** by `ajo_messageErrorReason` so you see error reason per phone.

Result: one row per phone number, with counts (and optionally breakdown by error reason).

### Option 2: Error reason as rows, breakdown by phone

- Keep **dimension** = `variables/adobe_reserved_label.ajo_messageErrorReason`.
- Add a **breakdown** (sub-dimension) = the dimension that holds the phone number.

Result: each error reason row expands to show the list of phone numbers (and counts) for that reason.

Either way, you must know the **dimension ID** for “phone” in your CJA data view.

---

## Finding the “phone” dimension in your data view

The exact ID depends on how your CJA connection and data view are built:

1. **AJO event data**  
   The SMS send event may expose the destination (phone) as a dimension, often under the same `variables/adobe_reserved_label` or similar namespace (e.g. something like destination/address/phone). Names vary by schema and data view.

2. **Profile data**  
   If you added a **Profile dataset** to the AJO-compatible CJA connection (with a field like mobile/phone), that field is available as a dimension. Its ID is usually a path like `variables/...` or a profile schema path, and it appears in the data view’s dimension list.

**Steps that always apply:**

1. **List dimensions for your data view**  
   Use the CJA Dimensions API with your **data view ID** (from your request: `dataId: "dv_666acca0779b1c01e1aca5b7"`).  
   - Endpoint: `GET https://cja.adobe.io/data/dataviews/{dataviewId}/dimensions`  
   - In the response, look for a dimension whose **name** or **id** suggests phone/recipient, e.g.:
     - “Phone”, “Mobile”, “Recipient”, “Destination”, “To”, “Destination address”, “Mobile number”
     - Or IDs containing `recipient`, `destination`, `phone`, `mobile`, `address`, `ajo_`

2. **Or in the CJA UI**  
   In Analysis Workspace, open the same data view and check the left rail (Dimensions). Find the dimension that clearly represents “phone number” or “recipient” for SMS. The dimension ID you use in the API is the same as in the UI (often shown in the component’s details or when you use “Get dimension” / API help).

3. **If no phone dimension exists**  
   - For **event-level** phone: the AJO dataset may have a field that isn’t yet added to the data view. Add that field as a dimension in the CJA data view.  
   - For **profile-level** phone: add a Profile dataset to the CJA connection (with the identity that links to your AJO events), add the mobile/phone attribute as a dimension in the data view, then use that dimension in the report.

Once you have the dimension ID (e.g. `variables/adobe_reserved_label.ajo_destinationAddress` or a profile path), use it in the API as below.

---

## Changing the API request to include phone numbers

Your curl uses the **ARES/Analysis Workspace** endpoint:

`POST https://reporting.nld.appsvc.an.adobe.com/reporting/1.0/ares/users/reports/ranked`

### A. Phone as primary dimension (rows = phone numbers)

In the request body, **replace** the current `dimension` with the phone dimension ID you found, e.g.:

```json
"dimension": "variables/adobe_reserved_label.ajo_XXXXXXXX"
```

(Replace `ajo_XXXXXXXX` with the actual dimension ID from the Dimensions API or UI.)

Keep the same `metricContainer`, `globalFilters`, and `settings`. You’ll get one row per phone number and the metric (e.g. event errors). To also see error reason per phone, the API must support a breakdown/sub-dimension (see below).

### B. Error reason as primary dimension, breakdown by phone

If the ranked endpoint supports a **breakdown** (sub-dimension), add it so the report shows:

- Rows: error reasons  
- Sub-rows or extra column: phone number dimension  

The exact field name in the body depends on the ARES API. Common patterns:

- A `breakdown` or `subDimension` or `itemIds`-style structure where you specify a second dimension.
- Or a **metricFilter** with `type: "breakdown"` and a `dimension` for the phone dimension.

Because the public CJA docs focus on `cja.adobe.io` and your curl uses `reporting.nld.appsvc.an.adobe.com`, the best way to get the exact structure is:

1. In **Analysis Workspace**, build the table you want:
   - Dimension = Error reason  
   - Breakdown by = the dimension that is “Phone” / “Recipient”
2. Use the **“Get help” / “API request”** (or similar) in that report to get the new curl/body.  
   That will show the exact JSON for a ranked request with that breakdown.

Then replace the bearer token (and any other headers) with your own auth if you’re calling from a script.

---

## Summary

| Goal | Action |
|------|--------|
| See why you get “no value” | Your current request has only one dimension (error reason). There is no “phone” column; add the phone dimension. |
| Get all phone numbers | Use the **phone/recipient dimension** as the primary dimension (rows = phone numbers), or add it as a breakdown under error reason. |
| Find the dimension ID | Call CJA Dimensions API for data view `dv_666acca0779b1c01e1aca5b7` (or use the ID without `dv_` if the API expects it) and search for phone/recipient/destination; or find it in the CJA UI. |
| Get exact request shape | Build the same table in Analysis Workspace (error reason + breakdown by phone), then use the report’s “help” / API request to copy the full curl/body. |

**Script to list dimensions:** From the `00 Adobe Auth` folder run:

```bash
node scripts/cja-list-dimensions.js dv_666acca0779b1c01e1aca5b7
```

This calls the CJA Dimensions API and prints all dimension IDs and names; look for one that represents phone/recipient/destination. If you get **403**, add the **Customer Journey Analytics** API to your project at [console.adobe.io](https://console.adobe.io/), or set `CJA_BEARER_TOKEN`, `CJA_API_KEY`, and `CJA_ORG_ID` from your CJA Get help curl and run again. You can also find dimension IDs in Analysis Workspace by adding a dimension to a table and using Get help to see the API request.

This calls the CJA Dimensions API and prints all dimension IDs and names; look for one that represents phone/recipient/destination. (For 403: add CJA API to your project or use token from Get help curl.) In your CJA “Get help” curl 