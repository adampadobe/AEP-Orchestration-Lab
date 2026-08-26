"""Shared customer journey probabilities for the travel data generators."""

import random


class CustomerJourneyConfig:
    """Probability controls used by Phase 1 profile generation."""

    LOYALTY_ENROLLMENT_RATE = 0.60
    USES_MOBILE_RATE = 0.50
    CALLS_CENTRE_RATE = 0.20
    DOES_CHECKIN_RATE = 0.70
    HAS_DISRUPTION_RATE = 0.10
    USES_INFLIGHT_RATE = 0.40
    USES_HOTEL_RATE = 0.30
    USES_POS_RATE = 0.30

    @classmethod
    def get_customer_profile_flags(cls):
        return {
            "has_loyalty": random.random() < cls.LOYALTY_ENROLLMENT_RATE,
            "uses_mobile": random.random() < cls.USES_MOBILE_RATE,
            "calls_centre": random.random() < cls.CALLS_CENTRE_RATE,
            "does_checkin": random.random() < cls.DOES_CHECKIN_RATE,
            "has_disruption": random.random() < cls.HAS_DISRUPTION_RATE,
            "uses_inflight": random.random() < cls.USES_INFLIGHT_RATE,
            "uses_hotel": random.random() < cls.USES_HOTEL_RATE,
            "uses_pos": random.random() < cls.USES_POS_RATE,
        }
