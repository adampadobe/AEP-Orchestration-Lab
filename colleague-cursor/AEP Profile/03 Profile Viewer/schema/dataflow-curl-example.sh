#!/usr/bin/env bash
# Operational Profile Dataflow – example POST to the DCS streaming collection endpoint.
# Replace YOUR_BEARER_TOKEN with a valid IMS access token and ensure the sandbox name matches your AEP sandbox.
#
# Body shape matches operational-profile-schema-sample.json: _demoemea + root mixins (e.g. consents, optInOut, loyalty, telecomSubscription).
# Retail/travel live under _demoemea.individualCharacteristics in the current sample.
# The Profile Viewer sends identification.core (ecid, email), changed attributes, consents, and optInOut.

curl --location --request POST 'https://dcs.adobedc.net/collection/a8b78b230d3f48d0e3f75ae4b9376249effe996d139a613497066ae3f77caf4b' \
  --header 'Content-Type: application/json' \
  --header 'sandbox-name: kirkham' \
  --header 'x-adobe-flow-id: e5654ef9-0f14-420a-84a9-8c48506f0173' \
  --header 'Authorization: Bearer YOUR_BEARER_TOKEN' \
  --header 'x-api-key: YOUR_ADOBE_CLIENT_ID' \
  --data-raw '{"_demoemea":{"identification":{"core":{"ecid":"YOUR_ECID","email":"user@example.com"}},"individualCharacteristics":{"core":{"age":35,"employer":"Sample value","favouriteCategory":"Sample value"},"retail":{"favoriteColor":"blue","favoriteStore":"Sample value"}}},"consents":{"marketing":{"any":{"val":"y","reason":"curl example","time":"2018-11-12T20:20:39+00:00"}},"collect":{"val":"y"},"share":{"val":"y"},"personalize":{"content":{"val":"y"}}},"optInOut":{"_channels":{"email":"in","sms":"in","push":"in","phone":"in","directMail":"in","whatsapp":"in","facebookFeed":"in","web":"in","mobileApp":"in","twitterFeed":"in"}}}'
