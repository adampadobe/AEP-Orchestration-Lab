#!/usr/bin/env python3
"""
Phase 2 Data Generator Extension
Adds loyalty, preferences, mobile, call centre, and check-in data generation
"""

import snowflake.connector
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from datetime import datetime, timedelta
from pathlib import Path
import random
import sys
import uuid
from attribution_helper import AttributionHelper
from session_journey_helper import SessionJourneyHelper

class Phase2DataGenerator:
    """Generate Phase 2 data: loyalty, preferences, and events"""
    
    def __init__(self, conn, cursor, journey_flags=None):
        """Initialize with existing Snowflake connection and optional journey flags"""
        self.conn = conn
        self.cursor = cursor
        self.journey_flags = journey_flags or {}  # Dictionary of {crmId: flags}
    
    def get_journey_flags(self, crm_id):
        """Get journey flags for a specific customer"""
        return self.journey_flags.get(crm_id, {})
    
    def set_journey_flags(self, journey_flags_dict):
        """Set journey flags for batch of customers"""
        self.journey_flags = journey_flags_dict
    
    @staticmethod
    def get_current_timestamp():
        """
        Get current timestamp matching Snowflake warehouse timezone
        Uses Python's datetime.now() which returns local system time
        This prevents the 8-hour UTC offset bug
        """
        # Simple approach: use system local time (should be PST/PDT)
        # This matches how Phase 1 generator creates timestamps
        return datetime.now()
    
    @staticmethod
    def generate_realistic_timestamp(days_ago=0, hour_range=(0, 23)):
        """
        Generate a realistic timestamp spread throughout the day
        
        Args:
            days_ago: Number of days in the past (0 = today, 1 = yesterday, etc.)
            hour_range: Tuple of (min_hour, max_hour) for realistic business hours
        
        Returns:
            datetime object with randomized hour, minute, second
        """
        now = datetime.utcnow()
        base_date = now - timedelta(days=days_ago)
        random_hour = random.randint(hour_range[0], hour_range[1])
        random_minute = random.randint(0, 59)
        random_second = random.randint(0, 59)
        random_microsecond = random.randint(0, 999999)
        
        realistic_timestamp = base_date.replace(
            hour=random_hour,
            minute=random_minute,
            second=random_second,
            microsecond=random_microsecond
        )
        
        return realistic_timestamp
    
    @staticmethod
    def generate_phase2_verification_sql():
        """Generate SQL verification queries for Phase 2 tables"""
        return {
            'count_phase2': """
-- Count all Phase 2 records
SELECT 'Loyalty Profiles' as table_name, COUNT(*) as count 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_LOYALTY
UNION ALL
SELECT 'Preference Profiles', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_PREFERENCES
UNION ALL
SELECT 'Mobile Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_MOBILE
UNION ALL
SELECT 'Call Centre Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CALLCENTRE
UNION ALL
SELECT 'Check-In Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CHECKIN;
""",
            'latest_calls': """
-- Latest 5 call centre events
SELECT 
    CRMID,
    EMAIL,
    CALL_PRIMARY_REASON,
    CALL_DURATION,
    CALL_RESOLUTION_STATUS,
    CALL_SATISFACTION_SCORE,
    TIMESTAMP
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CALLCENTRE
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_checkins': """
-- Latest 5 check-in events
SELECT 
    CRMID,
    EMAIL,
    CHECKIN_METHOD,
    CHECKIN_SEAT_NUMBER,
    CHECKIN_CHECKED_BAGS,
    CHECKIN_DIGITAL_BOARDING_PASS,
    TIMESTAMP
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CHECKIN
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_loyalty': """
-- Latest 5 loyalty profiles
SELECT 
    CRMID,
    EMAIL,
    LOYALTY_CURRENT_TIER,
    LOYALTY_TOTAL_POINTS,
    LOYALTY_LOUNGE_ACCESS,
    LOYALTY_PRIORITY_BOARDING
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_LOYALTY
ORDER BY _RECORDCREATEDTIMESTAMP DESC
LIMIT 5;
""",
            'latest_preferences': """
-- Latest 5 preference profiles
SELECT 
    CRMID,
    EMAIL,
    PREF_COMM_PREFERRED_CHANNEL,
    PREF_TRAVEL_CABIN_CLASS,
    PREF_TRAVEL_SEAT_TYPE,
    PREF_TRAVEL_MEAL
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_PREFERENCES
ORDER BY _RECORDCREATEDTIMESTAMP DESC
LIMIT 5;
""",
            'latest_mobile': """
-- Latest 5 mobile events
SELECT 
    CRMID,
    EMAIL,
    MOBILE_INTERACTION_TYPE,
    MOBILE_SCREEN_NAME,
    SEARCHDESTINATION,
    TIMESTAMP
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_MOBILE
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_calls': """
-- Latest 5 call centre events
SELECT 
    CRMID,
    EMAIL,
    CALL_PRIMARY_REASON,
    CALL_DURATION,
    CALL_RESOLUTION_STATUS,
    CALL_SATISFACTION_SCORE
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CALLCENTRE
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_checkins': """
-- Latest 5 check-in events
SELECT 
    CRMID,
    EMAIL,
    CHECKIN_METHOD,
    CHECKIN_SEAT_NUMBER,
    CHECKIN_CHECKED_BAGS,
    CHECKIN_DIGITAL_BOARDING_PASS
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_CHECKIN
ORDER BY TIMESTAMP DESC
LIMIT 5;
"""
        }
    
    def generate_loyalty_profiles(self, base_profiles, start_index):
        """Generate loyalty profile data based on customer profiles"""
        loyalty_data = []
        
        for i, profile in enumerate(base_profiles):
            # Skip if customer doesn't have a loyalty ID (not enrolled in program)
            if not profile.get('loyaltyId'):
                continue
            
            # Determine tier based on varied distribution
            tier_choice = random.choices(
                ['bronze', 'silver', 'gold', 'platinum'],
                weights=[40, 30, 20, 10]
            )[0]
            
            tier_points = {
                'bronze': random.randint(0, 24999),
                'silver': random.randint(25000, 49999),
                'gold': random.randint(50000, 99999),
                'platinum': random.randint(100000, 200000)
            }
            
            total_points = tier_points[tier_choice]
            lifetime_earned = total_points + random.randint(10000, 50000)
            lifetime_redeemed = lifetime_earned - total_points
            
            loyalty_data.append((
                profile['crmId'],  # CRMID
                profile['ecid'],  # ECID
                profile['email'],  # EMAIL
                None,  # EMAILIDSHA256
                None,  # GAID
                profile.get('loyaltyId', f'LOYALTY{start_index + i + 2000}'),  # LOYALTYID - reuse from base profile
                None,  # PASSPORTID
                profile['phoneNumber'],  # PHONENUMBER
                None,  # PUSHTOKENS
                None,  # STACKCHATID
                True,  # TESTPROFILE
                'Skywards Premium',  # LOYALTY_PROGRAM_NAME
                f'LOY_{random.randint(100000, 999999)}',  # LOYALTY_MEMBER_NUMBER
                (datetime.now() - timedelta(days=random.randint(365, 1825))).date(),  # LOYALTY_MEMBER_SINCE
                'active',  # LOYALTY_PROGRAM_STATUS
                tier_choice,  # LOYALTY_CURRENT_TIER
                (datetime.now() - timedelta(days=random.randint(30, 365))).date(),  # LOYALTY_TIER_START_DATE
                (datetime.now() + timedelta(days=random.randint(30, 365))).date(),  # LOYALTY_TIER_EXPIRY_DATE
                datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # LOYALTY_LAST_TIER_UPDATE_DATE (TIMESTAMP_NTZ format)
                random.choice(['bronze', 'silver', 'none']),  # LOYALTY_PREVIOUS_TIER
                tier_points[tier_choice],  # LOYALTY_TIER_QUALIFYING_POINTS
                random.randint(5000, 25000),  # LOYALTY_POINTS_TO_NEXT_TIER
                total_points,  # LOYALTY_TOTAL_POINTS
                lifetime_earned,  # LOYALTY_LIFETIME_POINTS_EARNED
                lifetime_redeemed,  # LOYALTY_LIFETIME_POINTS_REDEEMED
                random.randint(500, 5000),  # LOYALTY_POINTS_EXPIRING_SOON
                datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # LOYALTY_POINTS_EXPIRY_DATE (TIMESTAMP_NTZ format)
                (datetime.now() - timedelta(days=random.randint(1, 90))).date(),  # LOYALTY_LAST_POINTS_EARNED_DATE
                (datetime.now() - timedelta(days=random.randint(30, 180))).date() if random.random() > 0.3 else None,  # LOYALTY_LAST_POINTS_REDEEMED_DATE
                tier_choice in ['gold', 'platinum'],  # LOYALTY_LOUNGE_ACCESS
                random.randint(2, 12) if tier_choice in ['gold', 'platinum'] else 0,  # LOYALTY_LOUNGE_VISITS_REMAINING
                tier_choice in ['silver', 'gold', 'platinum'],  # LOYALTY_PRIORITY_BOARDING
                random.choice([20, 30, 40]) if tier_choice in ['gold', 'platinum'] else 20,  # LOYALTY_FREE_BAGGAGE_ALLOWANCE
                tier_choice in ['gold', 'platinum'],  # LOYALTY_SEAT_UPGRADE_ELIGIBLE
                random.randint(0, 2) if tier_choice == 'platinum' else 0,  # LOYALTY_COMPANION_TICKETS
                tier_choice in ['gold', 'platinum'],  # LOYALTY_FAST_TRACK_SECURITY
                random.randint(2, 20),  # LOYALTY_FLIGHTS_THIS_YEAR
                random.randint(5, 25),  # LOYALTY_FLIGHTS_LAST_YEAR
                random.randint(10, 100),  # LOYALTY_SEGMENTS_FLOWN
                round(random.uniform(5000, 50000), 2),  # LOYALTY_TOTAL_SPEND
                round(random.uniform(500, 2500), 2)  # LOYALTY_AVERAGE_SPEND_PER_BOOKING
            ))
        
        return loyalty_data
    
    def insert_loyalty_profiles(self, loyalty_data):
        """Insert loyalty profiles into Snowflake with explicit timestamp"""
        # Get current timestamp once for all records in this batch
        current_ts = self.get_current_timestamp()
        
        sql = """
        INSERT INTO AGENTIC_TRAVEL_PROFILE_LOYALTY (
            CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
            TESTPROFILE, LOYALTY_PROGRAM_NAME, LOYALTY_MEMBER_NUMBER, LOYALTY_MEMBER_SINCE, LOYALTY_PROGRAM_STATUS,
            LOYALTY_CURRENT_TIER, LOYALTY_TIER_START_DATE, LOYALTY_TIER_EXPIRY_DATE, LOYALTY_LAST_TIER_UPDATE_DATE,
            LOYALTY_PREVIOUS_TIER, LOYALTY_TIER_QUALIFYING_POINTS, LOYALTY_POINTS_TO_NEXT_TIER, LOYALTY_TOTAL_POINTS,
            LOYALTY_LIFETIME_POINTS_EARNED, LOYALTY_LIFETIME_POINTS_REDEEMED, LOYALTY_POINTS_EXPIRING_SOON,
            LOYALTY_POINTS_EXPIRY_DATE, LOYALTY_LAST_POINTS_EARNED_DATE, LOYALTY_LAST_POINTS_REDEEMED_DATE,
            LOYALTY_LOUNGE_ACCESS, LOYALTY_LOUNGE_VISITS_REMAINING, LOYALTY_PRIORITY_BOARDING,
            LOYALTY_FREE_BAGGAGE_ALLOWANCE, LOYALTY_SEAT_UPGRADE_ELIGIBLE, LOYALTY_COMPANION_TICKETS,
            LOYALTY_FAST_TRACK_SECURITY, LOYALTY_FLIGHTS_THIS_YEAR, LOYALTY_FLIGHTS_LAST_YEAR,
            LOYALTY_SEGMENTS_FLOWN, LOYALTY_TOTAL_SPEND, LOYALTY_AVERAGE_SPEND_PER_BOOKING,
            _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        
        # Add timestamps to each record
        loyalty_data_with_ts = [record + (current_ts, current_ts) for record in loyalty_data]
        self.cursor.executemany(sql, loyalty_data_with_ts)
    
    def generate_preferences(self, base_profiles):
        """Generate preference profiles"""
        pref_data = []
        
        for profile in base_profiles:
            pref_data.append((
                profile['crmId'],  # CRMID
                profile['ecid'],  # ECID
                profile['email'],  # EMAIL
                None,  # EMAILIDSHA256
                None,  # GAID
                None,  # LOYALTYID
                None,  # PASSPORTID
                profile['phoneNumber'],  # PHONENUMBER
                None,  # PUSHTOKENS
                None,  # STACKCHATID
                True,  # TESTPROFILE
                random.choice(['email', 'sms', 'push', 'phone']),  # PREF_COMM_PREFERRED_CHANNEL
                random.choice([True, False]),  # PREF_COMM_EMAIL_OPT_IN
                random.choice([True, False]),  # PREF_COMM_SMS_OPT_IN
                random.choice([True, False]),  # PREF_COMM_PUSH_OPT_IN
                random.choice([True, False]),  # PREF_COMM_PHONE_OPT_IN
                random.choice([True, False]),  # PREF_COMM_MARKETING_OPT_IN
                random.choice(['daily', 'weekly', 'monthly']),  # PREF_COMM_FREQUENCY
                'en-GB',  # PREF_COMM_PREFERRED_LANGUAGE
                random.choice(['window', 'aisle', 'any']),  # PREF_TRAVEL_SEAT_TYPE
                random.choice(['front', 'middle', 'back']),  # PREF_TRAVEL_SEAT_LOCATION
                random.choice(['standard', 'vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free']),  # PREF_TRAVEL_MEAL
                random.choice(['economy', 'premium_economy', 'business', 'first']),  # PREF_TRAVEL_CABIN_CLASS
                random.choice([True, False]),  # PREF_TRAVEL_WILLING_TO_PAY_UPGRADE
                None,  # PREF_TRAVEL_AIRLINES
                None,  # PREF_TRAVEL_HOTEL_CHAINS
                False,  # PREF_ACCESS_WHEELCHAIR
                False,  # PREF_ACCESS_SPECIAL_ASSISTANCE
                None,  # PREF_ACCESS_ASSISTANCE_TYPES
                None  # PREF_ACCESS_MEDICAL_CONDITIONS
            ))
        
        return pref_data
    
    def insert_preferences(self, pref_data):
        """Insert preference profiles with explicit timestamp"""
        # Get current timestamp once for all records in this batch
        current_ts = self.get_current_timestamp()
        
        sql = """
        INSERT INTO AGENTIC_TRAVEL_PROFILE_PREFERENCES (
            CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
            TESTPROFILE, PREF_COMM_PREFERRED_CHANNEL, PREF_COMM_EMAIL_OPT_IN, PREF_COMM_SMS_OPT_IN,
            PREF_COMM_PUSH_OPT_IN, PREF_COMM_PHONE_OPT_IN, PREF_COMM_MARKETING_OPT_IN,
            PREF_COMM_FREQUENCY, PREF_COMM_PREFERRED_LANGUAGE, PREF_TRAVEL_SEAT_TYPE, PREF_TRAVEL_SEAT_LOCATION,
            PREF_TRAVEL_MEAL, PREF_TRAVEL_CABIN_CLASS, PREF_TRAVEL_WILLING_TO_PAY_UPGRADE,
            PREF_TRAVEL_AIRLINES, PREF_TRAVEL_HOTEL_CHAINS, PREF_ACCESS_WHEELCHAIR,
            PREF_ACCESS_SPECIAL_ASSISTANCE, PREF_ACCESS_ASSISTANCE_TYPES, PREF_ACCESS_MEDICAL_CONDITIONS,
            _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        
        # Add timestamps to each record
        pref_data_with_ts = [record + (current_ts, current_ts) for record in pref_data]
        self.cursor.executemany(sql, pref_data_with_ts)
    
    def generate_mobile_events(self, base_profiles, events_per_profile=2):
        """Generate mobile app events with proper funnel - matches complete AEP schema"""
        mobile_events = []
        destinations = ['Dubai', 'New York', 'Paris', 'Tokyo', 'Singapore', 'Sydney', 'Barcelona']
        uk_cities = ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Glasgow']
        airports = {
            'Dubai': 'DXB', 'New York': 'JFK', 'Paris': 'CDG', 'Tokyo': 'NRT',
            'Singapore': 'SIN', 'Sydney': 'SYD', 'Barcelona': 'BCN'
        }
        uk_origins = ['LHR', 'LGW', 'MAN', 'EDI', 'BHX', 'GLA']
        
        event_counter = 5001  # Start counter for Mobile events
        
        for profile in base_profiles:
            # Check journey flags - only generate mobile events if customer uses mobile app
            flags = self.get_journey_flags(profile['crmId'])
            if not flags.get('uses_mobile', False):
                continue  # Skip mobile events for this customer
            
            # Generate realistic mobile session with 8-10 events
            # Proper funnel: app.opened → search → results → product views → checkout → purchase
            
            destination = random.choice(destinations)
            dest_airport = airports[destination]
            origin = random.choice(uk_cities)
            origin_airport = random.choice(uk_origins)
            session_id = f'MOBILE_SESSION_{event_counter}'
            
            # Build session events in funnel order
            session_events = []
            
            # 1. App opened
            session_events.append(('app_open', 'app_opened', 'Home', None, 0))
            
            # 2. Screen view - Search
            session_events.append(('screen_view', 'screen_viewed', 'Search', None, 2))
            
            # 3. Search initiated (80% search)
            if random.random() < 0.8:
                session_events.append(('search', 'search_initiated', 'Search', destination, 3))
                
                # 4. Screen view - Results (80% view results)
                if random.random() < 0.8:
                    session_events.append(('screen_view', 'screen_viewed', 'Results', None, 6))
                    
                    # 5. Results viewed
                    session_events.append(('search_results_viewed', 'search_results_viewed', 'Results', destination, 7))
                    
                    # 6-7. View first product (70% view product)
                    if random.random() < 0.7:
                        flight_1 = f'BA{random.randint(100, 999)}'
                        session_events.append(('screen_view', 'screen_viewed', 'Flight Details', None, 10))
                        session_events.append(('product_view', 'product_viewed', 'Flight Details', None, 11))
                        
                        # 8-9. View second product for comparison (40% compare)
                        if random.random() < 0.4:
                            session_events.append(('screen_view', 'screen_viewed', 'Flight Details', None, 15))
                            session_events.append(('product_view', 'product_viewed', 'Flight Details', None, 16))
                        
                        # 10. Add to cart (35% add)
                        if random.random() < 0.35:
                            session_events.append(('add_to_cart', 'product_added_to_cart', 'Flight Details', None, 20))
                            
                            # 11-12. Checkout (75% of cart additions)
                            if random.random() < 0.75:
                                session_events.append(('screen_view', 'screen_viewed', 'Checkout', None, 25))
                                session_events.append(('booking_start', 'checkout_started', 'Checkout', None, 26))
                                
                                # 13. Complete purchase (80% complete)
                                if random.random() < 0.8:
                                    session_events.append(('booking_complete', 'purchase_completed', 'Confirmation', None, 30))
            
            # Now generate the actual mobile event tuples from session_events
            # Generate attribution once per session
            attribution = AttributionHelper.assign_marketing_channel(is_mobile=True)
            platform = random.choice(['ios', 'android'])
            app_version = f'{random.randint(1,5)}.{random.randint(0,9)}.0'
            os_version = random.choice(['iOS 17.2', 'iOS 16.5', 'Android 14', 'Android 13'])
            device_model = random.choice(['iPhone 15 Pro', 'iPhone 14', 'Samsung Galaxy S24', 'Google Pixel 8'])
            # Use realistic timestamp for mobile events (within last 1-14 days, typical mobile usage hours)
            mobile_days_ago = random.randint(1, 14)
            base_timestamp_dt = self.generate_realistic_timestamp(days_ago=mobile_days_ago, hour_range=(7, 23))
            
            for idx, (interaction, evt_name, screen, dest, time_offset) in enumerate(session_events):
                
                # Calculate event timestamp
                event_timestamp_dt = base_timestamp_dt + timedelta(seconds=time_offset)
                event_timestamp = event_timestamp_dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                
                # Event type mapping
                event_type_map = {
                    'app_open': 'travel.mobile.appLaunch',
                    'screen_view': 'travel.mobile.screenView',
                    'search': 'travel.mobile.search',
                    'search_results_viewed': 'travel.mobile.searchResultsViewed',
                    'product_view': 'travel.mobile.productView',
                    'add_to_cart': 'travel.mobile.addToCart',
                    'booking_start': 'travel.mobile.checkoutStart',
                    'booking_complete': 'travel.mobile.purchase'
                }
                event_type = event_type_map.get(interaction, 'travel.mobile')
                
                # Search details
                search_term = f'{dest} flights' if dest else None
                cabin_class = random.choice(['economy', 'premium_economy', 'business', 'first'])
                
                # Get funnel metadata for this screen
                funnel_meta = SessionJourneyHelper.get_mobile_funnel_metadata(screen)
                
                mobile_events.append((
                    f'MOBILE{event_counter}',  # _ID
                    event_timestamp,  # TIMESTAMP
                    event_type,  # EVENTTYPE
                    profile['crmId'],  # CRMID
                    profile['ecid'],  # ECID
                    profile['email'],  # EMAIL
                    profile.get('emailIdSha256'),  # EMAILIDSHA256
                    profile.get('gaid'),  # GAID
                    profile.get('loyaltyId'),  # LOYALTYID
                    profile.get('passportId'),  # PASSPORTID
                    profile['phoneNumber'],  # PHONENUMBER
                    None,  # PUSHTOKENS
                    None,  # STACKCHATID
                    # App Details
                    app_version,  # MOBILE_APP_VERSION
                    platform,  # MOBILE_PLATFORM
                    os_version,  # MOBILE_OS_VERSION
                    device_model,  # MOBILE_DEVICE_MODEL
                    # Session Details
                    session_id,  # MOBILE_SESSION_ID
                    random.randint(180, 900),  # MOBILE_SESSION_DURATION
                    (interaction == 'app_open' and random.random() < 0.1),  # MOBILE_IS_FIRST_LAUNCH
                    True,  # MOBILE_IS_AUTHENTICATED
                    # Interaction Details
                    interaction,  # MOBILE_INTERACTION_TYPE
                    screen,  # MOBILE_SCREEN_NAME
                    'Home' if idx > 0 else None,  # MOBILE_PREVIOUS_SCREEN
                    # Search Details
                    search_term if interaction in ['search', 'search_results_viewed'] else None,
                    'flight' if interaction == 'search' else None,
                    origin if interaction == 'search' else None,
                    dest if interaction == 'search' else None,
                    (datetime.now() + timedelta(days=random.randint(7, 90))).date() if interaction == 'search' else None,
                    (datetime.now() + timedelta(days=random.randint(14, 97))).date() if interaction == 'search' else None,
                    random.randint(1, 4) if interaction == 'search' else None,
                    cabin_class if interaction == 'search' else None,
                    random.randint(10, 150) if interaction == 'search_results_viewed' else None,
                    # Product View Details
                    'flight' if interaction == 'product_view' else None,
                    f'BA{random.randint(100, 999)}' if interaction == 'product_view' else None,
                    random.choice(['British Airways', 'Emirates', 'Lufthansa', 'Singapore Airlines']) if interaction == 'product_view' else None,
                    round(random.uniform(200, 2000), 2) if interaction in ['product_view', 'add_to_cart'] else None,
                    'GBP' if interaction in ['product_view', 'add_to_cart'] else None,
                    'available' if interaction == 'product_view' else None,
                    # Cart Interaction
                    'add' if interaction == 'add_to_cart' else ('checkout' if interaction == 'booking_start' else None),
                    round(random.uniform(500, 3000), 2) if interaction in ['add_to_cart', 'booking_start', 'booking_complete'] else None,
                    random.randint(1, 3) if interaction in ['add_to_cart', 'booking_start', 'booking_complete'] else None,
                    # Push Notification
                    None, None, None,
                    # Engagement Metrics
                    random.randint(20, 100) if interaction == 'screen_view' else None,
                    random.randint(10, 300),
                    random.randint(1, 50),
                    # PHASE 1A: Marketing Attribution Fields
                    attribution['marketing_channel'],
                    attribution['marketing_channel_detail'],
                    attribution['campaign_id'],
                    attribution['campaign_name'],
                    attribution['campaign_type'],
                    attribution['utm_source'],
                    attribution['utm_medium'],
                    attribution['utm_campaign'],
                    attribution['utm_content'],
                    attribution['utm_term'],
                    attribution['referrer_domain'],
                    attribution['referrer_type'],
                    # Funnel Metadata (NEW)
                    funnel_meta['funnel'],
                    funnel_meta['step'],
                    funnel_meta['number'],
                    funnel_meta['status']
                ))
                event_counter += 1
        
        return mobile_events
    
    def insert_mobile_events(self, mobile_events):
        """Insert mobile events with explicit _RECORDCREATEDTIMESTAMP"""
        sql = """
        INSERT INTO AGENTIC_TRAVEL_EVENT_MOBILE (
            _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
            MOBILE_APP_VERSION, MOBILE_PLATFORM, MOBILE_OS_VERSION, MOBILE_DEVICE_MODEL,
            MOBILE_SESSION_ID, MOBILE_SESSION_DURATION, MOBILE_IS_FIRST_LAUNCH, MOBILE_IS_AUTHENTICATED,
            MOBILE_INTERACTION_TYPE, MOBILE_SCREEN_NAME, MOBILE_PREVIOUS_SCREEN,
            MOBILE_SEARCH_TERM, MOBILE_SEARCH_TYPE, MOBILE_SEARCH_ORIGIN, MOBILE_SEARCH_DESTINATION,
            MOBILE_SEARCH_DEPARTURE_DATE, MOBILE_SEARCH_RETURN_DATE, MOBILE_SEARCH_PASSENGERS, MOBILE_SEARCH_CABIN_CLASS, MOBILE_SEARCH_RESULTS_COUNT,
            MOBILE_PRODUCT_TYPE, MOBILE_PRODUCT_FLIGHT_NUMBER, MOBILE_PRODUCT_AIRLINE, MOBILE_PRODUCT_PRICE, MOBILE_PRODUCT_CURRENCY, MOBILE_PRODUCT_AVAILABILITY,
            MOBILE_CART_ACTION, MOBILE_CART_VALUE, MOBILE_CART_ITEM_COUNT,
            MOBILE_NOTIFICATION_ID, MOBILE_NOTIFICATION_TYPE, MOBILE_NOTIFICATION_ACTION,
            MOBILE_SCROLL_DEPTH, MOBILE_TIME_ON_SCREEN, MOBILE_INTERACTION_COUNT,
            MARKETING_CHANNEL, MARKETING_CHANNEL_DETAIL, CAMPAIGN_ID, CAMPAIGN_NAME, CAMPAIGN_TYPE,
            UTM_SOURCE, UTM_MEDIUM, UTM_CAMPAIGN, UTM_CONTENT, UTM_TERM, REFERRER_DOMAIN, REFERRER_TYPE,
            FUNNEL_NAME, FUNNEL_STEP, FUNNEL_STEP_NUMBER, FUNNEL_COMPLETION_STATUS,
            ANCILLARY_ITEM_NAME, ANCILLARY_ITEM_PRICE, ANCILLARY_ITEM_CATEGORY,
            CHANNEL,
            _RECORDCREATEDTIMESTAMP
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        
        # Add ancillary columns (NULL), CHANNEL, and _RECORDCREATEDTIMESTAMP = actual insert time (AEP incremental load)
        insert_ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        mobile_events_with_ts = [record + (None, None, None, 'mobile', insert_ts,) for record in mobile_events]
        self.cursor.executemany(sql, mobile_events_with_ts)
    
    def generate_call_centre_events(self, base_profiles, events_per_profile=1):
        """Generate call centre events with correct timezone"""
        call_events = []
        agent_names = ['Sarah Johnson', 'David Chen', 'Emma Williams', 'James Brown', 'Olivia Martinez']
        teams = ['Customer Support', 'Booking', 'Loyalty', 'Complaints']
        locations = ['London', 'Manchester', 'Dubai', 'New York']
        
        event_counter = 8001  # Start counter for CallCentre events
        for profile in base_profiles:
            # Check journey flags - only generate call centre events if customer calls
            flags = self.get_journey_flags(profile['crmId'])
            if not flags.get('calls_centre', False):
                continue  # Skip call centre events for this customer
            
            for _ in range(events_per_profile):
                reason = random.choice(['booking', 'change', 'cancellation', 'disruption', 'baggage', 'loyalty', 'general_inquiry'])
                duration = random.randint(120, 1800)  # 2-30 minutes in seconds
                resolved = random.choice([True, False])
                satisfaction = random.randint(1, 5)
                
                # Create specific eventType based on call reason
                event_type_map = {
                    'booking': 'travel.callcentre.booking',
                    'change': 'travel.callcentre.change',
                    'cancellation': 'travel.callcentre.cancellation',
                    'disruption': 'travel.callcentre.disruption',
                    'baggage': 'travel.callcentre.baggage',
                    'loyalty': 'travel.callcentre.loyalty',
                    'general_inquiry': 'travel.callcentre.inquiry'
                }
                event_type = event_type_map.get(reason, 'travel.callcentre')
                
                # Generate realistic timestamp for call (within last 1-30 days, business hours 8 AM - 6 PM)
                call_days_ago = random.randint(1, 30)
                current_ts = self.generate_realistic_timestamp(days_ago=call_days_ago, hour_range=(8, 18))
                
                call_events.append((
                    f'CALLCENTRE{event_counter}',  # _ID (structured format like BOOKING/WEBSITE)
                    current_ts,  # TIMESTAMP with realistic time variation
                    event_type,  # EVENTTYPE (descriptive based on call reason)
                    profile['crmId'],  # CRMID
                    profile['ecid'],  # ECID
                    profile['email'],  # EMAIL
                    profile.get('emailIdSha256'),  # EMAILIDSHA256
                    profile.get('gaid'),  # GAID
                    profile.get('loyaltyId'),  # LOYALTYID
                    profile.get('passportId'),  # PASSPORTID
                    profile['phoneNumber'],  # PHONENUMBER
                    None, None,  # PUSHTOKENS, STACKCHATID
                    f'CALL_{random.randint(100000, 999999)}',  # CALL_ID
                    duration,  # CALL_DURATION
                    random.randint(0, 300),  # CALL_QUEUE_TIME
                    'inbound',  # CALL_DIRECTION
                    'phone',  # CALL_CHANNEL
                    reason,  # CALL_PRIMARY_REASON
                    None,  # CALL_SECONDARY_REASON
                    random.choice(['low', 'medium', 'high']),  # CALL_URGENCY
                    f'AGENT_{random.randint(1000, 9999)}',  # CALL_AGENT_ID
                    random.choice(agent_names),  # CALL_AGENT_NAME
                    random.choice(teams),  # CALL_AGENT_TEAM
                    random.choice(locations),  # CALL_AGENT_LOCATION
                    'resolved' if resolved else 'pending',  # CALL_RESOLUTION_STATUS
                    duration // 60,  # CALL_RESOLUTION_TIME (minutes)
                    resolved,  # CALL_FIRST_CALL_RESOLUTION
                    not resolved,  # CALL_FOLLOW_UP_REQUIRED
                    satisfaction <= 2,  # CALL_COMPENSATION_OFFERED
                    round(random.uniform(0, 200), 2) if satisfaction <= 2 else None,  # CALL_COMPENSATION_AMOUNT
                    satisfaction,  # CALL_SATISFACTION_SCORE
                    random.randint(0, 10),  # CALL_NPS_SCORE
                    random.choice([True, False])  # CALL_FEEDBACK_PROVIDED
                ))
                event_counter += 1  # Increment counter for next event
        
        return call_events
    
    def insert_call_centre_events(self, call_events):
        """Insert call centre events with explicit _RECORDCREATEDTIMESTAMP"""
        sql = """
        INSERT INTO AGENTIC_TRAVEL_EVENT_CALLCENTRE (
            _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS,
            STACKCHATID, CALL_ID, CALL_DURATION, CALL_QUEUE_TIME, CALL_DIRECTION, CALL_CHANNEL,
            CALL_PRIMARY_REASON, CALL_SECONDARY_REASON, CALL_URGENCY,
            CALL_AGENT_ID, CALL_AGENT_NAME, CALL_AGENT_TEAM, CALL_AGENT_LOCATION,
            CALL_RESOLUTION_STATUS, CALL_RESOLUTION_TIME, CALL_FIRST_CALL_RESOLUTION,
            CALL_FOLLOW_UP_REQUIRED, CALL_COMPENSATION_OFFERED, CALL_COMPENSATION_AMOUNT,
            CALL_SATISFACTION_SCORE, CALL_NPS_SCORE, CALL_FEEDBACK_PROVIDED,
            CHANNEL,
            _RECORDCREATEDTIMESTAMP
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        
        # Add CHANNEL and _RECORDCREATEDTIMESTAMP = actual insert time (AEP incremental load)
        insert_ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        call_events_with_ts = [record + ('callcentre', insert_ts,) for record in call_events]
        self.cursor.executemany(sql, call_events_with_ts)
    
    def generate_checkin_events(self, base_profiles, events_per_profile=1):
        """Generate check-in events with correct timezone"""
        checkin_events = []
        event_counter = 1
        
        for profile in base_profiles:
            # Check journey flags - only generate check-in events if customer checks in
            flags = self.get_journey_flags(profile['crmId'])
            if not flags.get('does_checkin', False):
                continue  # Skip check-in events for this customer
            
            for _ in range(events_per_profile):
                method = random.choice(['online', 'mobile_app', 'kiosk', 'counter'])
                seat_type = random.choice(['window', 'aisle', 'middle'])
                seat_location = random.choice(['front', 'middle', 'back'])
                checked_bags = random.randint(0, 2)
                
                # Create specific eventType based on check-in method
                event_type_map = {
                    'online': 'travel.checkin.online',
                    'mobile_app': 'travel.checkin.digital',
                    'kiosk': 'travel.checkin.kiosk',
                    'counter': 'travel.checkin.counter'
                }
                event_type = event_type_map.get(method, 'travel.checkin')
                
                # Generate realistic timestamp for check-in (within last 1-7 days, varied hours)
                checkin_days_ago = random.randint(1, 7)
                current_ts = self.generate_realistic_timestamp(days_ago=checkin_days_ago, hour_range=(5, 23))
                
                checkin_events.append((
                    f'CHECKIN{event_counter}',  # _ID (structured format like BOOKING/WEBSITE)
                    current_ts,  # TIMESTAMP with realistic time variation
                    event_type,  # EVENTTYPE (descriptive based on method)
                    profile['crmId'],  # CRMID
                    profile['ecid'],  # ECID
                    profile['email'],  # EMAIL
                    profile.get('emailIdSha256'),  # EMAILIDSHA256
                    profile.get('gaid'),  # GAID
                    profile.get('loyaltyId'),  # LOYALTYID
                    profile.get('passportId'),  # PASSPORTID
                    profile['phoneNumber'],  # PHONENUMBER
                    None, None,  # PUSHTOKENS, STACKCHATID
                    method,  # CHECKIN_METHOD
                    current_ts,  # CHECKIN_TIME with realistic time variation
                    random.randint(2, 48),  # CHECKIN_HOURS_BEFORE_DEPARTURE
                    'Online' if method in ['online', 'mobile_app'] else 'Airport',  # CHECKIN_LOCATION
                    f'{random.randint(1, 30)}{random.choice(["A", "B", "C", "D", "E", "F"])}',  # CHECKIN_SEAT_NUMBER
                    seat_type,  # CHECKIN_SEAT_TYPE
                    seat_location,  # CHECKIN_SEAT_LOCATION
                    random.choice([True, False]),  # CHECKIN_SEAT_UPGRADED
                    random.choice([True, False]),  # CHECKIN_SEAT_CHANGED
                    seat_location == 'front' or random.random() > 0.7,  # CHECKIN_SEAT_EXTRA_LEGROOM
                    checked_bags,  # CHECKIN_CHECKED_BAGS
                    round(random.uniform(10, 25) * checked_bags, 2) if checked_bags > 0 else 0,  # CHECKIN_TOTAL_WEIGHT
                    0,  # CHECKIN_OVERWEIGHT_BAGS
                    0 if checked_bags <= 1 else round(random.uniform(0, 50), 2),  # CHECKIN_BAGGAGE_FEES
                    None,  # CHECKIN_SPECIAL_ITEMS
                    f'BP{random.randint(1000000, 9999999)}',  # CHECKIN_BOARDING_PASS_NUMBER
                    random.choice(['A', 'B', 'C', 'D', 'E']),  # CHECKIN_BOARDING_GROUP
                    random.randint(1, 50),  # CHECKIN_BOARDING_POSITION
                    f'{random.randint(1, 50)}{random.choice(["A", "B", "C"])}',  # CHECKIN_GATE_NUMBER
                    (datetime.now() + timedelta(hours=random.randint(24, 72))),  # CHECKIN_BOARDING_TIME (future datetime)
                    method in ['online', 'mobile_app'],  # CHECKIN_DIGITAL_BOARDING_PASS
                    method == 'mobile_app' and random.random() > 0.3  # CHECKIN_MOBILE_WALLET_ADDED
                ))
                event_counter += 1
        
        return checkin_events
    
    def insert_checkin_events(self, checkin_events):
        """Insert check-in events with explicit _RECORDCREATEDTIMESTAMP"""
        sql = """
        INSERT INTO AGENTIC_TRAVEL_EVENT_CHECKIN (
            _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS,
            STACKCHATID, CHECKIN_METHOD, CHECKIN_TIME, CHECKIN_HOURS_BEFORE_DEPARTURE, CHECKIN_LOCATION,
            CHECKIN_SEAT_NUMBER, CHECKIN_SEAT_TYPE, CHECKIN_SEAT_LOCATION,
            CHECKIN_SEAT_UPGRADED, CHECKIN_SEAT_CHANGED, CHECKIN_SEAT_EXTRA_LEGROOM,
            CHECKIN_CHECKED_BAGS, CHECKIN_TOTAL_WEIGHT, CHECKIN_OVERWEIGHT_BAGS, CHECKIN_BAGGAGE_FEES,
            CHECKIN_SPECIAL_ITEMS, CHECKIN_BOARDING_PASS_NUMBER, CHECKIN_BOARDING_GROUP,
            CHECKIN_BOARDING_POSITION, CHECKIN_GATE_NUMBER, CHECKIN_BOARDING_TIME,
            CHECKIN_DIGITAL_BOARDING_PASS, CHECKIN_MOBILE_WALLET_ADDED,
            FUNNEL_NAME, FUNNEL_STEP, FUNNEL_STEP_NUMBER, FUNNEL_COMPLETION_STATUS,
            ANCILLARY_ITEM_NAME, ANCILLARY_ITEM_PRICE, ANCILLARY_ITEM_CATEGORY,
            CHANNEL,
            _RECORDCREATEDTIMESTAMP
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        
        # Map check-in method to channel (cross-channel logic)
        def get_checkin_channel(method):
            channel_map = {
                'online': 'web',
                'mobile_app': 'mobile',
                'kiosk': 'kiosk',
                'counter': 'counter'
            }
            return channel_map.get(method, 'web')
        
        # Add funnel columns (NULL), ancillary columns (NULL), CHANNEL, and _RECORDCREATEDTIMESTAMP = actual insert time (AEP incremental load)
        # record[13] is CHECKIN_METHOD
        insert_ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        checkin_events_with_ts = [record + (None, None, None, None, None, None, None, get_checkin_channel(record[13]), insert_ts,) for record in checkin_events]
        self.cursor.executemany(sql, checkin_events_with_ts)
    
    def generate_and_insert_all(self, base_profiles, start_index):
        """Generate and insert all Phase 2 data"""
        # Generate loyalty profiles
        loyalty_data = self.generate_loyalty_profiles(base_profiles, start_index)
        self.insert_loyalty_profiles(loyalty_data)
        
        # Generate preferences
        pref_data = self.generate_preferences(base_profiles)
        self.insert_preferences(pref_data)
        
        # Generate mobile events (2 per profile)
        mobile_events = self.generate_mobile_events(base_profiles, events_per_profile=2)
        self.insert_mobile_events(mobile_events)
        
        # Generate call centre events (1 per profile)
        call_events = self.generate_call_centre_events(base_profiles, events_per_profile=1)
        self.insert_call_centre_events(call_events)
        
        # Generate check-in events (1 per profile)
        checkin_events = self.generate_checkin_events(base_profiles, events_per_profile=1)
        self.insert_checkin_events(checkin_events)
        
        return {
            'loyalty': len(loyalty_data),
            'preferences': len(pref_data),
            'mobile_events': len(mobile_events),
            'call_events': len(call_events),
            'checkin_events': len(checkin_events)
        }
