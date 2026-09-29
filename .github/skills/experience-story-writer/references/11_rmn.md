RMN REFERENCE — RETAIL MEDIA NETWORK COMMERCIAL MODEL
Last updated: May 2026
═══════════════════════════════════════════════════════

Read this file whenever the brief mentions: RMN, retail media, media monetisation,
brand partner revenue, inventory products, CPM, media agency, DSP, SSP, or audience
products.

═══════════════════════════════════════════════════════
THE RMN COMMERCIAL MODEL
═══════════════════════════════════════════════════════

A retail media network is a media business sitting on top of a retail business.
The retailer sells advertising — audience segments and owned media placements —
to brand partners and their media agencies.

THE THREE-PARTY STRUCTURE:
- Retailer — owns the data, the audience products, the media inventory, and the
  commercial relationships. Uses Adobe platform.
- Brand partner — wants to reach specific audiences at the retailer to drive sales.
  Has a marketing/brand team and a media agency.
- Media agency — buys the inventory on behalf of the brand partner. The agency
  makes the actual media buy — not the brand team directly.

WHAT THE RETAILER'S RMN TEAM DOES:
- Builds audience segments from loyalty and transaction data, publishes them as
  sellable inventory products
- Pitches inventory to media agencies with performance data
- Manages brand partner relationships, contracts, campaign operations, and QBRs
- Measures and reports campaign performance (incrementality, sales lift, ROAS)

═══════════════════════════════════════════════════════
WHERE ADOBE SITS IN AN RMN
═══════════════════════════════════════════════════════

Adobe's platform supports the retailer's internal operations. It does NOT operate
inside the DSP/SSP where the agency buys.

RTCDP IN AN RMN CONTEXT:
- RTCDP's role is audience strategy and inventory building — creating, validating,
  and publishing segments as products the agency can buy
- "Activation" in RTCDP means making the segment available as inventory in the DSP
  (e.g. Criteo, The Trade Desk) — it does NOT mean Adobe is running the campaign
- RTCDP does not serve ads, set bid prices, manage campaign pacing, or control
  campaign delivery — that is the DSP's function
- Never write scenes where RTCDP is doing what the DSP does

CJA IN AN RMN CONTEXT:
- CJA provides segment lift analysis, audience performance data, and incrementality
  measurement — the analytical layer the retailer uses to prove inventory value
  to agencies
- The pitch to a media agency is always performance-led — CJA data is what makes
  the case
- CJA does not control what the agency sees in their own DSP reporting

WORKFRONT IN AN RMN CONTEXT:
- Workfront manages the partner relationship lifecycle: brief intake, contract
  tracking, campaign operations, QBR cadence, touchpoint history
- Both internal workflows (audience build, analysis, approval) and external
  partner-facing workflows (campaign setup, reporting, relationship management)
  live in Workfront

COWORKER IN AN RMN CONTEXT:
- Coworker can surface signals from RTCDP, CJA, and Workfront — category spend
  gaps, segment underperformance, partner engagement patterns visible in Adobe
  systems
- Coworker cannot surface what is happening inside the agency's DSP, the brand
  partner's internal budget decisions, or any data not in Adobe's connected systems

═══════════════════════════════════════════════════════
THE PITCH CONVERSATION
═══════════════════════════════════════════════════════

The commercial conversation in an RMN story is almost always with a media agency,
not the brand team directly.

- The agency makes the buy — the brand team approves strategy, but the agency
  selects placements
- The pitch to the agency is a performance conversation: "Here is what our
  inventory delivers. Here is the audience. Here is the lift data."
- The pitch to the brand team (if featured) is strategic: "Here is the competitive
  risk in your category. Here is the opportunity."

Never write the pitch as a direct brand sale where the retailer closes a deal with
the brand team over a media package. The correct story arc is:
1. RMN team identifies commercial opportunity (signal in Coworker or CJA)
2. Internal team builds the audience product and performance case
3. Pitch is made to the media agency with CJA performance data
4. Agency activates the buy in the DSP — this happens off-screen
5. Performance is measured via RTCDP + CJA + DSP data flowing back into Adobe

═══════════════════════════════════════════════════════
ACCEPTABLE RMN PERSONAS
═══════════════════════════════════════════════════════

(Never VP/C-suite as hands-on users)

- RMN Revenue Manager / Commercial Manager — owns category revenue targets,
  initiates briefs
- Retail Media Insights Analyst / Audience Strategist — runs CJA analysis,
  builds audience products in RTCDP
- RMN Campaign Operations Manager — manages Workfront workflows, partner lifecycle
- RMN Partnerships Manager — owns the external conversation with agencies and brand
  partners
- Retail Media Planner (agency-side) — the external counterpart; can appear in
  pitch scenes but is not an Adobe user

═══════════════════════════════════════════════════════
COMMON MISTAKES TO AVOID
═══════════════════════════════════════════════════════

— Never write RTCDP as serving ads or controlling campaign delivery
— Never write RTCDP as managing bid prices, CPM floors, or campaign pacing
— Never write Coworker surfacing data from inside the DSP
— Never write the pitch as a direct brand team close (it goes through the agency)
— Never write the agency as using Adobe tools — they use their own DSP
— Never show Adobe products performing the function of Criteo, The Trade Desk,
  or any DSP/SSP
