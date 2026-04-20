import logging

logger = logging.getLogger(__name__)


def _fuzzy_match(suggested_name, segment_name):
    """Check if a suggested segment name loosely matches an actual segment name."""
    s = suggested_name.lower().strip()
    n = segment_name.lower().strip()
    if s == n:
        return True
    if s in n or n in s:
        return True
    s_words = set(s.split())
    n_words = set(n.split())
    stop_words = {"the", "a", "an", "of", "for", "and", "in", "on", "with", "to", "is"}
    s_meaningful = s_words - stop_words
    n_meaningful = n_words - stop_words
    if not s_meaningful or not n_meaningful:
        return False
    overlap = s_meaningful & n_meaningful
    smaller = min(len(s_meaningful), len(n_meaningful))
    return len(overlap) >= max(1, smaller * 0.5)


def crosslink_personas_segments(personas, segments):
    """Bidirectionally link personas and segments."""
    seg_lookup = {s["name"]: s for s in segments if s.get("name")}

    for seg in segments:
        seg["qualified_personas"] = []

    for persona in personas:
        raw_suggestions = persona.get("suggested_segments", [])
        resolved = []
        for suggestion in raw_suggestions:
            if isinstance(suggestion, dict):
                resolved.append(suggestion)
                continue
            for seg_name, seg in seg_lookup.items():
                if _fuzzy_match(str(suggestion), seg_name):
                    link = {"id": seg.get("id", ""), "name": seg_name}
                    resolved.append(link)
                    already = {p.get("id") for p in seg["qualified_personas"]}
                    if persona.get("id") not in already:
                        seg["qualified_personas"].append({
                            "id": persona.get("id", ""),
                            "name": persona.get("name", "Unknown"),
                            "initial": persona.get("name", "?")[0],
                        })
                    break
            else:
                resolved.append({"id": "", "name": str(suggestion)})
        persona["suggested_segments"] = resolved

    logger.info("Cross-linked %d personas with %d segments", len(personas), len(segments))
    return personas, segments


def crosslink_campaigns_segments(campaigns, segments):
    """Bidirectionally link campaigns and segments.

    - Each segment's suggested_campaigns becomes resolved {id, name} dicts.
    - Each campaign gains a linked_segments list of {id, name} dicts.
    """
    camp_lookup = {c.get("name", ""): c for c in campaigns if c.get("name")}
    seg_lookup = {s.get("name", ""): s for s in segments if s.get("name")}

    for camp in campaigns:
        camp["linked_segments"] = []

    # Resolve segment -> campaign references
    for seg in segments:
        raw_campaigns = seg.get("suggested_campaigns", [])
        resolved = []
        for suggestion in raw_campaigns:
            name = suggestion.get("name", suggestion) if isinstance(suggestion, dict) else str(suggestion)
            for camp_name, camp in camp_lookup.items():
                if _fuzzy_match(name, camp_name):
                    resolved.append({"id": camp.get("id", ""), "name": camp_name})
                    already = {s.get("id") for s in camp["linked_segments"]}
                    if seg.get("id") not in already:
                        camp["linked_segments"].append({"id": seg.get("id", ""), "name": seg.get("name", "")})
                    break
            else:
                resolved.append({"id": "", "name": name})
        seg["suggested_campaigns"] = resolved

        # Normalize qualified_personas to always be dicts
        raw_personas = seg.get("qualified_personas", [])
        normalized = []
        for qp in raw_personas:
            if isinstance(qp, dict):
                normalized.append(qp)
            else:
                normalized.append({"id": "", "name": str(qp), "initial": str(qp)[0] if qp else "?"})
        seg["qualified_personas"] = normalized

    # Resolve campaign -> segment references (from target_segments field)
    for camp in campaigns:
        raw_targets = camp.get("target_segments", [])
        for target in raw_targets:
            name = target.get("name", target) if isinstance(target, dict) else str(target)
            for seg_name, seg in seg_lookup.items():
                if _fuzzy_match(name, seg_name):
                    already = {s.get("id") for s in camp["linked_segments"]}
                    if seg.get("id") not in already:
                        camp["linked_segments"].append({"id": seg.get("id", ""), "name": seg_name})
                    break

    logger.info("Cross-linked %d campaigns with %d segments", len(campaigns), len(segments))
    return campaigns, segments


def crosslink_accounts(accounts, personas, campaigns, segments):
    """Cross-link B2B accounts with personas, campaigns, and segments."""
    persona_lookup = {p.get("name", ""): p for p in personas if p.get("name")}
    camp_lookup = {c.get("name", ""): c for c in campaigns if c.get("name")}
    seg_lookup = {s.get("name", ""): s for s in segments if s.get("name")}

    for account in accounts:
        # Resolve decision_makers -> persona links
        for dm in account.get("decision_makers", []):
            pname = dm.get("persona_name", "")
            dm["persona_id"] = ""
            if pname:
                for p_name, p in persona_lookup.items():
                    if _fuzzy_match(pname, p_name):
                        dm["persona_id"] = p.get("id", "")
                        dm["persona_name"] = p_name
                        break

        # Resolve target_campaigns -> {id, name}
        raw_camps = account.get("target_campaigns", [])
        resolved_camps = []
        for tc in raw_camps:
            name = tc.get("name", tc) if isinstance(tc, dict) else str(tc)
            for camp_name, camp in camp_lookup.items():
                if _fuzzy_match(name, camp_name):
                    resolved_camps.append({"id": camp.get("id", ""), "name": camp_name})
                    break
            else:
                resolved_camps.append({"id": "", "name": name})
        account["target_campaigns"] = resolved_camps

        # Resolve target_segments -> {id, name}
        raw_segs = account.get("target_segments", [])
        resolved_segs = []
        for ts in raw_segs:
            name = ts.get("name", ts) if isinstance(ts, dict) else str(ts)
            for seg_name, seg in seg_lookup.items():
                if _fuzzy_match(name, seg_name):
                    resolved_segs.append({"id": seg.get("id", ""), "name": seg_name})
                    break
            else:
                resolved_segs.append({"id": "", "name": name})
        account["target_segments"] = resolved_segs

    logger.info("Cross-linked %d accounts", len(accounts))
    return accounts
