"""Shared customer journey probabilities for the travel data generators."""

import random


class CustomerJourneyConfig:
    """Probability controls used by Phase 1 profile generation."""

    LOYALTY_ENROLLMENT_RATE = 0.60

    @classmethod
    def get_customer_profile_flags(cls):
        return {
            "has_loyalty": random.random() < cls.LOYALTY_ENROLLMENT_RATE,
        }
