/**
 * Card Explorer channel panel copy (What it is / What it does / Example) per industry.
 * Keys align with getIndustryPack / App industry state: retail, fsi, travel, media, sports, telecommunications, public.
 */

const BASE_META = [
  { id: 'email', label: 'Email', icon: 'Mail', color: '#2D3142' },
  { id: 'web', label: 'Web', icon: 'Globe', color: '#2D3142' },
  { id: 'app', label: 'App', icon: 'AppWindow', color: '#2D3142' },
  { id: 'push', label: 'Push', icon: 'BellRing', color: '#2D3142' },
  { id: 'sms', label: 'SMS', icon: 'MessageSquare', color: '#2D3142' },
  { id: 'code', label: 'Code', icon: 'Code', color: '#2D3142' },
];

/** @type {Record<string, Record<string, { what: string, does: string, example: string }>>} */
const COPY_BY_INDUSTRY = {
  retail: {
    email: {
      what: 'Personalized offer blocks inside AJO email campaigns.',
      does: 'The decisioning engine fills a template placeholder at send time — each recipient gets the offer most relevant to them.',
      example:
        'A weekly newsletter has an "Offer of the Week" block. Each recipient sees a different offer — one gets a seasonal sale, another a loyalty perk.',
    },
    web: {
      what: 'Real-time decisions delivered via Adobe Web SDK.',
      does: 'Offers are injected into the page as the customer browses — hero banners, inline cards, or modal overlays.',
      example:
        'A returning shopper sees "Welcome back — 15% off your cart" as the homepage hero instead of the generic banner.',
    },
    app: {
      what: 'In-app messages and content cards within mobile applications.',
      does: 'The decisioning engine delivers personalized offers inside the app — banners, interstitials, or native content cards triggered by behavior.',
      example:
        'After viewing running shoes, the customer sees an in-app card for a matching accessory bundle — chosen by the Decision Policy from the catalog.',
    },
    push: {
      what: 'Mobile push notifications with personalized offers.',
      does: 'Push campaigns in AJO include a decisioning action. The winning item\'s push representation is assembled and delivered to the device.',
      example:
        'A cart abandoned two hours ago triggers a push: "Free express shipping today" — selected in real time for that profile.',
    },
    sms: {
      what: 'Personalized text messages with offer deep links.',
      does: 'SMS campaigns deliver the winning offer as a short message with a deep link to convert.',
      example:
        'A high-value customer receives: "Hi Alex — your VIP weekend code expires tonight" with a link straight to checkout.',
    },
    code: {
      what: 'Structured JSON via Edge Decisioning API for any custom channel.',
      does: 'Store systems, kiosks, or partner apps can request the winning offer and render it in their own UI.',
      example:
        'An in-store associate tablet calls the API at checkout. The response shows the best upsell for that basket as a one-tap add-on.',
    },
  },
  fsi: {
    email: {
      what: 'Compliant, personalized offer modules in banking and wealth emails (statements, lifecycle, AJO campaigns).',
      does: 'At send time, the engine resolves the best eligible product or service message for each recipient — within consent and policy rules.',
      example:
        'A monthly wealth digest includes a "Next best action" module: one client sees a mortgage rate review, another a premium card upgrade.',
    },
    web: {
      what: 'Authenticated digital banking and advisor portals powered by Web SDK.',
      does: 'While a customer is signed in, decisioning selects the right offer tile — loans, savings, cards — based on balances, segments, and eligibility.',
      example:
        'After checking a savings balance, the dashboard hero promotes a CD ladder for rate seekers and a cash-management bundle for others.',
    },
    app: {
      what: 'In-app banners and cards inside mobile banking.',
      does: 'Behavioral signals (transfers, bill pay, searches) trigger contextual offers surfaced as native app content.',
      example:
        'A customer who just paid a large card balance sees an in-app card for a lower-rate consolidation option.',
    },
    push: {
      what: 'Push notifications that pair service messages with optional marketing content.',
      does: 'The winning offer is merged into the push payload when policy allows — e.g., after a deposit or credit alert.',
      example:
        'A low-balance alert is followed by a push line: "You pre-qualify for overdraft protection" with a secure deep link.',
    },
    sms: {
      what: 'Short transactional or consent-based SMS with links to apply or learn more.',
      does: 'SMS journeys pick the best compliant message variant and trackable link for each recipient.',
      example:
        'A payment reminder SMS ends with: "Tap to see your personalized refinance options" — one of several approved variants.',
    },
    code: {
      what: 'JSON responses for branch workstations, IVR handoffs, or core integrations.',
      does: 'Any channel that cannot use AJO native surfaces calls Edge Decisioning and renders the winning offer server- or agent-side.',
      example:
        'When a client is routed to a relationship manager, the CRM shows the top retention or cross-sell offer returned by the API for that party ID.',
    },
  },
  travel: {
    email: {
      what: 'Itinerary, pre-trip, and promotional emails with dynamic offer blocks.',
      does: 'Send-time decisioning swaps hero modules — ancillaries, upgrades, partner deals — per traveler and trip context.',
      example:
        'A fare confirmation email includes "Add-ons for your route": one traveler sees extra legroom, another a lounge pass, based on tier and segment.',
    },
    web: {
      what: 'Web SDK placements on booking paths, manage-trip pages, and loyalty sites.',
      does: 'Offers update as the traveler searches, holds, or changes flights — seats, bags, hotels, insurance.',
      example:
        'A logged-in member on the homepage sees "Your upgrade window" instead of a generic promo, matched to upcoming flights.',
    },
    app: {
      what: 'Native airline or hotel app surfaces — home feed, trip detail, and boarding flows.',
      does: 'Decisioning selects ancillaries and partner perks during check-in, day-of-travel, and post-stay moments.',
      example:
        'During mobile check-in, an interstitial offers priority boarding to one traveler and a bundle (seat + bag) to another.',
    },
    push: {
      what: 'Gate changes, reminders, and promotional pushes with personalized upsells.',
      does: 'The winning offer is attached when the journey allows marketing content alongside operational messages.',
      example:
        'A delay notification adds: "Complimentary lounge pass — tap to claim" for eligible elites only.',
    },
    sms: {
      what: 'Concise SMS with deep links to seats, bags, cars, or partner offers.',
      does: 'One-to-one SMS campaigns resolve the best add-on or flash fare link per traveler.',
      example:
        'Day before departure: "Your upgrade offer expires in 3h" with a link that shows the right cabin price for that PNR.',
    },
    code: {
      what: 'API responses for airport kiosks, contact centers, and partner networks.',
      does: 'Downstream systems request the best offer for a booking or loyalty ID and render it without AJO-owned UI.',
      example:
        'A gate agent’s terminal calls decisioning when rebooking a disrupted passenger; the API returns the top compensation or voucher package.',
    },
  },
  media: {
    email: {
      what: 'Newsletters and lifecycle email with personalized content and subscription CTAs.',
      does: 'Dynamic blocks promote the right plan, add-on, or catalog title for each subscriber profile.',
      example:
        'A weekly digest places a "Because you watched…" strip: one reader sees a documentary bundle, another a sports add-on.',
    },
    web: {
      what: 'Streaming and publishing sites using Web SDK for hero rails and paywalls.',
      does: 'Decisioning chooses promos, free trials, and upgrade paths as visitors browse or hit entitlement limits.',
      example:
        'A fan returning mid-series sees "Finish the season — 30% off premium" while a new visitor sees a standard intro offer.',
    },
    app: {
      what: 'In-app messaging for mobile streaming, audio, or news apps.',
      does: 'Surface the best upsell, bundle, or content recommendation card based on watch history and subscription tier.',
      example:
        'After binge-watching a genre, the app shows a limited-time bundle for related add-on channels.',
    },
    push: {
      what: 'Alerts for new episodes, live events, or price drops — with optional offer lines.',
      does: 'Marketing-approved pushes include the winning creative and deep link from decisioning.',
      example:
        'A new episode alert adds: "Add sports pack for €1" for viewers in a trial who match the segment.',
    },
    sms: {
      what: 'Short SMS with links to redeem trials, discounts, or partner bundles.',
      does: 'Campaigns pick the best SMS variant and landing experience per subscriber.',
      example:
        'A lapsed subscriber gets: "Your comeback offer is inside — 48h only" linking to a personalized renewal page.',
    },
    code: {
      what: 'JSON for connected TVs, partner apps, and billing platforms.',
      does: 'Any endpoint that needs a single "best next offer" for an account or device calls Edge Decisioning.',
      example:
        'A smart-TV partner app requests the top upgrade path when the viewer hits a paywall; the API returns tier, price, and entitlement flags.',
    },
  },
  sports: {
    email: {
      what: 'Fan newsletters, ticket on-sales, and membership emails with dynamic offer modules.',
      does: 'Blocks promote tickets, merch, or experiences per fan segment and past purchases.',
      example:
        'A gameday email shows "Your offer": one fan gets a parking bundle, another a jersey promo based on loyalty tier.',
    },
    web: {
      what: 'Team and venue sites with Web SDK — schedule pages, fan zones, checkout.',
      does: 'Heroes and sidebars swap between single-game tickets, plans, and retail bundles.',
      example:
        'A repeat buyer on the schedule page sees a season-seat upgrade offer; a first-timer sees a value section promo.',
    },
    app: {
      what: 'Official team or venue apps — gameday mode, wallet, and shop.',
      does: 'In-app cards promote add-ons (parking, F&B credits) at the right moment in the journey.',
      example:
        'After mobile ticket delivery, a card offers express lane pickup for VIPs and a merch discount for families.',
    },
    push: {
      what: 'Score alerts, kickoff reminders, and flash promos.',
      does: 'When allowed, pushes append the winning concession or retail offer for that fan.',
      example:
        'Halftime push: "Order from your seat — 20% off today" with an item picked for the fan’s usual orders.',
    },
    sms: {
      what: 'SMS with ticket links, presale codes, or limited merch drops.',
      does: 'SMS journeys resolve the best short message and URL per fan and event.',
      example:
        'Presale morning: "Your code for tonight’s drop" — different seat maps or bundles per segment.',
    },
    code: {
      what: 'APIs for POS, venue kiosks, and partner resale platforms.',
      does: 'Point-of-sale and access-control systems pull the top offer for a fan ID or ticket scan.',
      example:
        'A concession stand tablet loads "Suggested add-on" after a ticket scan — upsell chosen by decisioning for that game.',
    },
  },
  telecommunications: {
    email: {
      what: 'Bill, usage, and lifecycle email with personalized plan and device modules.',
      does: 'Send-time blocks pitch the best upgrade, add-on, or loyalty perk per subscriber line.',
      example:
        'A monthly usage summary includes "Offers for you": unlimited trials for heavy data users, accessory credit for others.',
    },
    web: {
      what: 'Care and shop sites using Web SDK — plan management, upgrades, support.',
      does: 'Real-time decisioning fills hero and inline placements as customers review usage or shop devices.',
      example:
        'A customer near data cap sees a bump-up offer; a new visitor sees a family-bundle intro.',
    },
    app: {
      what: 'Carrier apps for usage, recharge, and device care.',
      does: 'In-app cards promote add-ons (roaming, insurance, streaming) based on line and usage patterns.',
      example:
        'After an international trip search in the app, a roaming pack card appears with the best-priced bundle for that destination.',
    },
    push: {
      what: 'Network, billing, and promotional pushes with tailored upsells.',
      does: 'Operational pushes can append a marketing line when the Decision Policy qualifies an offer.',
      example:
        'A "Bill ready" notification adds: "Trade in today — extra €100 toward your next phone" for eligible lines.',
    },
    sms: {
      what: 'SMS with short codes and deep links to plans, top-ups, or appointments.',
      does: 'Campaigns select the winning SMS body and trackable link per subscriber and consent profile.',
      example:
        'A prepaid customer gets: "Your data boost — tap before midnight" with a link priced for their usage tier.',
    },
    code: {
      what: 'JSON for retail POS, field tech tablets, and OSS/BSS integrations.',
      does: 'Call centers and stores request the single best offer for an MSISDN or account without rendering AJO UI.',
      example:
        'A store associate’s app calls decisioning during a plan change; the API returns the top device trade and installment bundle.',
    },
  },
  public: {
    email: {
      what: 'Program and service emails with accessible, citizen-specific content blocks.',
      does: 'Decisioning selects eligible benefits, appointments, or enrollment prompts per resident record and consent.',
      example:
        'A quarterly update email shows "Recommended for you": one household sees a child-care subsidy link, another a transit pass renewal.',
    },
    web: {
      what: 'Government and agency portals using Web SDK for authenticated sessions.',
      does: 'While residents complete tasks, offers surface as optional programs, fee relief, or scheduling — only when rules allow.',
      example:
        'After filing a form, the confirmation page promotes a related workshop or fee waiver path matched to income band.',
    },
    app: {
      what: 'Citizen mobile apps for services, permits, and benefits.',
      does: 'In-app cards highlight next-step programs, document help, or optional services based on case context.',
      example:
        'A resident who renewed a license sees a card for an optional digital ID program they qualify for.',
    },
    push: {
      what: 'Appointment and deadline reminders that may include optional program CTAs.',
      does: 'When policy permits, a second line promotes a relevant service or enrollment window.',
      example:
        'A pickup-ready alert adds: "You may qualify for utility assistance — tap to check" for eligible accounts.',
    },
    sms: {
      what: 'Short SMS with secure links to appointments, forms, or program information.',
      does: 'Outbound SMS picks the clearest variant and link for each resident segment and language preference.',
      example:
        'A reminder SMS ends with: "See personalized savings programs" for households flagged by self-reported criteria.',
    },
    code: {
      what: 'Structured responses for contact centers, field offices, and partner systems.',
      does: 'Agents and kiosks retrieve the best next public service action or optional program for a citizen identifier.',
      example:
        'At a service desk, the CRM loads the top recommended program bundle from decisioning when a case is opened.',
    },
  },
  healthcare: {
    email: {
      what: 'Clinical and wellness journeys with HIPAA-appropriate placeholders in member communications.',
      does: 'Send-time decisioning picks the best care program, screening, or benefit message for each attributed member.',
      example:
        'A monthly care summary includes "Recommended next step": one patient sees a diabetes coaching slot, another a mammography reminder.',
    },
    web: {
      what: 'Patient and member portals using Web SDK on authenticated sessions.',
      does: 'While members review labs or benefits, decisioning surfaces the right follow-up offer or program tile.',
      example:
        'After viewing A1c results, the portal hero promotes a remote monitoring bundle for elevated values.',
    },
    app: {
      what: 'Native payer or provider apps — home, care team, and benefits surfaces.',
      does: 'In-app cards promote screenings, refills, or digital programs triggered by utilization and risk.',
      example:
        'A member who missed a preventive window sees an in-app card for a zero-copay screening slot.',
    },
    push: {
      what: 'Care reminders and nudges that may include optional wellness or pharmacy CTAs.',
      does: 'When allowed, pushes append the winning program line from decisioning alongside operational text.',
      example:
        'A refill-ready alert adds: "Add mail-order — save a trip" for members on maintenance meds.',
    },
    sms: {
      what: 'Short SMS with secure links to book, enroll, or complete e-consent.',
      does: 'Outbound SMS resolves the best variant and deep link per member segment and channel preference.',
      example:
        'A screening SMS ends with a personalized booking link priced to the member’s benefit tier.',
    },
    code: {
      what: 'JSON for EHR hooks, call-center desktops, and connected devices.',
      does: 'Clinical and service systems request the single best next-best-action for an MRN or member ID.',
      example:
        'At nurse triage, the workstation calls decisioning; the API returns the top care-gap closure offer for that encounter.',
    },
  },
};

function normalizeIndustry(industry) {
  const k = (industry || 'retail').toLowerCase();
  return COPY_BY_INDUSTRY[k] ? k : 'retail';
}

/**
 * Channel rows for the Card Explorer (id, label, icon, color, info) for the active industry.
 */
export function getChannelsForIndustry(industry) {
  const key = normalizeIndustry(industry);
  const copy = COPY_BY_INDUSTRY[key];
  return BASE_META.map((meta) => ({
    ...meta,
    info: { ...copy[meta.id] },
  }));
}

export const CHANNEL_IDS = BASE_META.map((m) => m.id);
