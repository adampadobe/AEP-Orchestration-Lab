# Profile schema reference

**operational-profile-schema-sample.json** — Full **Operational – Profile** record shape exported from AEP (union of tenant mixin `_demoemea` + standard profile mixins at the JSON root). Use it for Data Prep source paths and for this app’s attribute paths.

## Root of the payload (siblings of `_demoemea`)

These objects sit at the **top level** of the profile JSON next to `_demoemea`:

- `consents`, `person`, `personID`, `personalEmail`
- `homeAddress`, `homePhone`, `billingAddress`, `billingAddressPhone`, `mailingAddress`, `shippingAddress`, `shippingAddressPhone`, `faxPhone`, `mobilePhone`
- `loyalty` — program, tier, points, `cardsDetails`, dates, etc.
- `telecomSubscription`

The Profile Viewer streaming helper sends `consents` and `optInOut` at the root by default, and places mixin attributes from the UI (loyalty, telecom, person, addresses, phones) at the root when appropriate.

## Under `_demoemea` (tenant / demo operational fields)

- `_demoemea.identification` — including `core` (ecid, email, …)
- `_demoemea.individualCharacteristics` — `core`, `fsi`, **`retail`**, **`travel`**, `grocery`, `package`, `favouriteTeam`, etc.
- `_demoemea.gym`, `_demoemea.media`, `_demoemea.complaint`, `_demoemea.demoEnvironment`, `_demoemea.experience`, `_demoemea.loyaltyDetails` (summary `level` / `points`), `_demoemea.offersAndPromotions`, `_demoemea.orderProfile`, `_demoemea.packages`, `_demoemea.scoring`, …

**Note:** In this sample, **retail** and **travel** are under **`_demoemea.individualCharacteristics`**, not directly under `_demoemea`.

## Streaming POST body

Bare JSON commonly looks like:

```json
{
  "_demoemea": {
    "identification": { "core": { "ecid": "...", "email": "..." } },
    "individualCharacteristics": { "retail": { "favoriteColor": "blue" } }
  },
  "consents": { ... },
  "optInOut": { ... }
}
```

Optional root keys such as `loyalty` or `telecomSubscription` appear alongside `_demoemea` when those mixins are populated.

Partial payloads are valid; which fields persist depends on the dataflow **mapping set** (see **dataflow-curl-example.sh** for a curl example).
