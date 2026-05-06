#!/usr/bin/env python3
"""
Phase 3 Data Generator Extension
Adds in-journey event data: disruption, in-flight, hotel, loyalty transactions, and POS
"""

from datetime import datetime, timedelta
import random

class Phase3DataGenerator:
    """Generate Phase 3 in-journey event data with realistic values"""
    
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
    def generate_realistic_timestamp(days_ago=0, hour_range=(0, 23)):
        """
        Generate a realistic timestamp spread throughout the day
        
        Args:
            days_ago: Number of days in the past (0 = today, 1 = yesterday, etc.)
            hour_range: Tuple of (min_hour, max_hour) for realistic business hours
        
        Returns:
            datetime object with randomized hour, minute, second
        """
        import random
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
    
    # ========================================
    # DISRUPTION EVENT GENERATION
    # ========================================
    
    def generate_disruption_events(self, base_profiles, disruption_rate=0.10, record_created_timestamp=None):
        """
        Generate flight disruption events (based on journey flags).
        _RECORDCREATEDTIMESTAMP = record_created_timestamp (insert time) so AEP incremental load picks up new rows.
        Args: base_profiles, disruption_rate (default 10%, ignored if journey_flags set), record_created_timestamp.
        """
        _rec_ts = record_created_timestamp or datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        disruption_events = []
        event_counter = 1
        
        # Filter to profiles that should have disruptions
        disrupted_profiles = []
        for profile in base_profiles:
            flags = self.get_journey_flags(profile['crmId'])
            if flags.get('has_disruption', False):
                disrupted_profiles.append(profile)
        
        # Fallback to random sampling if no journey flags
        if not disrupted_profiles and not self.journey_flags:
            disrupted_profiles = random.sample(base_profiles, int(len(base_profiles) * disruption_rate))
        
        disruption_types = ['delay', 'cancellation', 'gate_change', 'aircraft_swap', 'route_change', 'weather', 'technical']
        severities = ['minor', 'moderate', 'major', 'critical']
        reasons = ['weather', 'technical', 'crew', 'air_traffic', 'operational']
        notification_methods = ['sms', 'email', 'push', 'airport_display', 'crew_announcement', 'whatsapp']
        compensation_types = ['voucher', 'refund', 'points', 'meal_voucher', 'hotel']
        airlines = ['BA', 'VS', 'AA', 'DL', 'UA', 'AF', 'LH', 'EK']
        airports = ['LHR', 'JFK', 'LAX', 'ORD', 'DXB', 'CDG', 'AMS', 'FRA', 'SIN', 'HKG']
        
        for profile in disrupted_profiles:
            disruption_type = random.choice(disruption_types)
            severity = random.choice(severities)
            
            # Create descriptive eventType based on disruption type
            event_type_map = {
                'delay': 'travel.disruption.delay',
                'cancellation': 'travel.disruption.cancellation',
                'gate_change': 'travel.disruption.gateChange',
                'aircraft_swap': 'travel.disruption.aircraftSwap',
                'route_change': 'travel.disruption.routeChange',
                'weather': 'travel.disruption.weather',
                'technical': 'travel.disruption.technical'
            }
            event_type = event_type_map.get(disruption_type, 'travel.disruption')
            
            # Generate timestamps
            original_time = datetime.utcnow() + timedelta(hours=random.randint(2, 48))
            
            if disruption_type == 'cancellation':
                new_time = original_time + timedelta(hours=random.randint(6, 24))
                delay_minutes = 0
            else:
                delay_minutes = random.choice([30, 45, 60, 90, 120, 180, 240, 300, 360])
                new_time = original_time + timedelta(minutes=delay_minutes)
            
            # Customer impact
            missed_connection = random.choice([True, False]) if delay_minutes > 120 else False
            rebooked = disruption_type in ['cancellation', 'route_change'] or missed_connection
            compensation_offered = severity in ['major', 'critical'] or disruption_type == 'cancellation'
            compensation_amount = random.choice([50, 100, 200, 300, 500, 1000]) if compensation_offered else 0
            
            # Generate realistic timestamp for disruption (within last 1-14 days, any hour)
            disruption_days_ago = random.randint(1, 14)
            disruption_ts = self.generate_realistic_timestamp(days_ago=disruption_days_ago, hour_range=(0, 23))
            
            disruption_events.append((
                f'DISRUPTION{event_counter}',  # _ID
                disruption_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TIMESTAMP with realistic time variation
                event_type,  # EVENTTYPE (descriptive based on disruption type)
                profile['crmId'],  # CRMID
                profile['ecid'],  # ECID
                profile['email'],  # EMAIL
                None,  # EMAILIDSHA256
                None,  # GAID
                None,  # LOYALTYID  (will be populated from profile if available)
                None,  # PASSPORTID (will be populated from profile if available)
                profile.get('phoneNumber'),  # PHONENUMBER
                None,  # PUSHTOKENS (will be null for ARRAY)
                None,  # STACKCHATID
                disruption_type,  # DISRUPTION_TYPE
                severity,  # DISRUPTION_SEVERITY
                original_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # ORIGINAL_DEPARTURE_TIME
                new_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # NEW_DEPARTURE_TIME
                delay_minutes if delay_minutes > 0 else None,  # DELAY_MINUTES
                random.choice(reasons),  # DISRUPTION_REASON
                random.choice(notification_methods),  # NOTIFICATION_METHOD
                f'{random.choice(airlines)}{random.randint(100, 999)}',  # FLIGHT_NUMBER
                random.choice(airlines),  # AIRLINE
                random.choice(airports),  # ORIGIN_AIRPORT
                random.choice(airports),  # DESTINATION_AIRPORT
                f'{random.randint(1, 50)}',  # ORIGINAL_GATE
                f'{random.randint(1, 50)}' if disruption_type == 'gate_change' else None,  # NEW_GATE
                f'{random.choice(["A320", "A350", "B737", "B777", "B787"])}',  # AIRCRAFT
                missed_connection,  # MISSED_CONNECTION
                rebooked,  # REBOOKED_FLIGHT
                compensation_offered,  # COMPENSATION_OFFERED
                random.choice(compensation_types) if compensation_offered else None,  # COMPENSATION_TYPE
                compensation_amount if compensation_offered else None,  # COMPENSATION_AMOUNT
                severity in ['major', 'critical'],  # LOUNGE_ACCESS_PROVIDED
                disruption_type == 'cancellation' and severity == 'critical',  # HOTEL_ACCOMMODATION_PROVIDED
                True,  # CUSTOMER_CONTACTED
                random.choice(['sms', 'email', 'push', 'phone']),  # CONTACT_CHANNEL
                random.randint(5, 60),  # RESPONSE_TIME
                f'Alternative flight offered' if rebooked else f'Voucher provided',  # RESOLUTION_OFFERED
                random.choice([True, False]),  # CUSTOMER_ACCEPTED
                'system',  # CHANNEL
                _rec_ts  # _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load
            ))
            
            event_counter += 1
        
        return disruption_events
    
    # ========================================
    # IN-FLIGHT EVENT GENERATION
    # ========================================
    
    def generate_inflight_events(self, base_profiles, events_per_profile=2, record_created_timestamp=None):
        """Generate in-flight service and entertainment interactions. _RECORDCREATEDTIMESTAMP = insert time for AEP."""
        _rec_ts = record_created_timestamp or datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        inflight_events = []
        event_counter = 1
        
        airlines = ['BA', 'VS', 'AA', 'DL', 'UA', 'AF', 'LH', 'EK']
        cabin_classes = ['economy', 'premium_economy', 'business', 'first']
        interaction_types = ['meal_service', 'beverage_service', 'duty_free', 'call_button', 'entertainment', 'wifi_purchase']
        content_types = ['movie', 'tv_show', 'music', 'game', 'magazine']
        meal_types = ['breakfast', 'lunch', 'dinner', 'snack']
        special_meals = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free']
        wifi_packages = ['messaging', 'browsing', 'streaming']
        temperature_adjustments = ['too_hot', 'too_cold', 'comfortable']
        
        movies = ['The Matrix', 'Inception', 'Avatar', 'Top Gun: Maverick', 'Dune', 'Interstellar']
        tv_shows = ['The Crown', 'Breaking Bad', 'Succession', 'The Office', 'Friends']
        
        for profile in base_profiles:
            # Check journey flags - only generate inflight events if customer uses inflight services
            flags = self.get_journey_flags(profile['crmId'])
            if not flags.get('uses_inflight', False):
                continue  # Skip inflight events for this customer
            
            cabin_class = random.choice(cabin_classes)
            flight_number = f'{random.choice(airlines)}{random.randint(100, 999)}'
            
            # Generate multiple interactions per flight
            for _ in range(events_per_profile):
                interaction_type = random.choice(interaction_types)
                
                # Create descriptive eventType based on interaction type
                event_type_map = {
                    'meal_service': 'travel.inflight.meal',
                    'beverage_service': 'travel.inflight.beverage',
                    'duty_free': 'travel.inflight.dutyFree',
                    'call_button': 'travel.inflight.service',
                    'entertainment': 'travel.inflight.entertainment',
                    'wifi_purchase': 'travel.inflight.wifi'
                }
                event_type = event_type_map.get(interaction_type, 'travel.inflight')
                
                # Generate realistic timestamp for inflight event (within last 1-14 days, any hour)
                inflight_days_ago = random.randint(1, 14)
                inflight_ts = self.generate_realistic_timestamp(days_ago=inflight_days_ago, hour_range=(0, 23))
                
                inflight_events.append((
                    f'INFLIGHT{event_counter}',  # _ID
                    inflight_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TIMESTAMP with realistic time variation
                    event_type,  # EVENTTYPE (descriptive based on interaction type)
                    profile['crmId'],  # CRMID
                    profile['ecid'],  # ECID
                    profile['email'],  # EMAIL
                    profile.get('emailIdSha256'),  # EMAILIDSHA256
                    profile.get('gaid'),  # GAID
                    profile.get('loyaltyId', profile['crmId'].replace('CRM', 'LOYALTY')),  # LOYALTYID
                    profile.get('passportId', profile['crmId'].replace('CRM', 'PASS')),  # PASSPORTID
                    profile.get('phoneNumber'),  # PHONENUMBER
                    None, None,  # PUSHTOKENS, STACKCHATID
                    flight_number,  # FLIGHT_NUMBER
                    flight_number[:2],  # AIRLINE
                    f'{random.choice(["LHR-JFK", "LAX-LHR", "DXB-SIN", "CDG-JFK"])}',  # ROUTE
                    cabin_class,  # CABIN_CLASS
                    f'{random.randint(1, 50)}{random.choice(["A", "B", "C", "D", "E", "F"])}',  # SEAT_NUMBER
                    random.randint(360, 900),  # FLIGHT_DURATION (minutes)
                    interaction_type,  # INTERACTION_TYPE
                    f'CM{random.randint(100, 999)}',  # CREW_MEMBER_ID
                    random.randint(3, 5),  # SERVICE_RATING
                    random.choice(['Coffee', 'Tea', 'Water', 'Wine', 'Beer', 'Cocktail', None]),  # ITEM_ORDERED
                    random.choice(['Extra ice', 'No ice', 'Vegan option', None]),  # SPECIAL_REQUEST
                    random.choice([True, False]),  # REQUEST_FULFILLED
                    cabin_class in ['business', 'first'] or random.choice([True, False]),  # ENTERTAINMENT_SYSTEM_USED
                    random.choice(content_types),  # CONTENT_TYPE
                    random.choice(movies + tv_shows),  # CONTENT_TITLE
                    random.randint(30, 180),  # WATCH_TIME
                    random.randint(3, 5),  # CONTENT_RATING
                    random.choice(meal_types),  # MEAL_TYPE
                    random.choice(['Chicken', 'Beef', 'Fish', 'Pasta', 'Vegetarian']),  # MEAL_CHOICE
                    random.choice(special_meals) if random.random() < 0.2 else None,  # SPECIAL_MEAL
                    random.randint(3, 5),  # MEAL_RATING
                    None,  # EXTRA_ITEMS (ARRAY)
                    random.choice([True, False]),  # WIFI_PURCHASED
                    random.choice(wifi_packages) if random.choice([True, False]) else None,  # WIFI_PACKAGE
                    random.choice([5.99, 9.99, 19.99]) if random.choice([True, False]) else None,  # WIFI_COST
                    random.randint(50, 500) if random.choice([True, False]) else None,  # DATA_USED (MB)
                    cabin_class in ['business', 'first'],  # AMENITY_KIT_RECEIVED
                    random.choice([True, False]),  # BLANKET_REQUESTED
                    random.choice([True, False]),  # PILLOW_REQUESTED
                    random.choice(temperature_adjustments),  # TEMPERATURE_ADJUSTMENT
                    random.randint(3, 5),  # SEAT_COMFORT_RATING
                    'inflight',  # CHANNEL
                    _rec_ts  # _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load
                ))
                
                event_counter += 1
        
        return inflight_events
    
    # ========================================
    # HOTEL EVENT GENERATION
    # ========================================
    
    def generate_hotel_events(self, base_profiles, hotel_rate=0.30, record_created_timestamp=None):
        """Generate hotel stay events (30% of travelers). _RECORDCREATEDTIMESTAMP = insert time for AEP."""
        _rec_ts = record_created_timestamp or datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        hotel_events = []
        event_counter = 1
        
        # Filter to profiles that should use hotel services
        profiles_with_hotels = []
        for profile in base_profiles:
            flags = self.get_journey_flags(profile['crmId'])
            if flags.get('uses_hotel', False):
                profiles_with_hotels.append(profile)
        
        # Fallback to random sampling if no journey flags
        if not profiles_with_hotels and not self.journey_flags:
            profiles_with_hotels = random.sample(base_profiles, int(len(base_profiles) * hotel_rate))
        
        hotel_chains = ['Marriott', 'Hilton', 'Hyatt', 'IHG', 'Accor', 'Radisson']
        room_types = ['standard', 'deluxe', 'suite', 'executive']
        checkin_methods = ['front_desk', 'mobile', 'kiosk', 'express']
        interaction_types = ['food_order', 'housekeeping', 'maintenance', 'concierge', 'amenity_request']
        amenity_types = ['gym', 'pool', 'spa', 'business_center', 'lounge', 'restaurant', 'bar', 'room_service']
        
        # Cross-channel distribution for hotel bookings
        hotel_channels = ['web', 'mobile', 'callcentre', 'partner']
        hotel_channel_weights = [0.45, 0.30, 0.10, 0.15]  # 45% web, 30% mobile, 10% callcentre, 15% partner
        
        for profile in profiles_with_hotels:
            chain = random.choice(hotel_chains)
            room_type = random.choice(room_types)
            nights = random.randint(1, 5)
            checkin_date = datetime.utcnow() + timedelta(days=random.randint(1, 30))
            checkout_date = checkin_date + timedelta(days=nights)
            
            # Select channel for this hotel booking (cross-channel!)
            hotel_channel = random.choices(hotel_channels, weights=hotel_channel_weights)[0]
            
            # Determine room service interaction type for descriptive eventType
            interaction_type = random.choice(interaction_types)
            
            # Create descriptive eventType based on room service interaction
            event_type_map = {
                'food_order': 'travel.hotel.roomservice.food',
                'housekeeping': 'travel.hotel.roomservice.housekeeping',
                'maintenance': 'travel.hotel.roomservice.maintenance',
                'concierge': 'travel.hotel.roomservice.concierge',
                'amenity_request': 'travel.hotel.roomservice.amenity'
            }
            event_type = event_type_map.get(interaction_type, 'travel.hotel.roomservice')
            
            # Generate realistic timestamp for hotel event (within last 1-30 days, any hour)
            hotel_days_ago = random.randint(1, 30)
            hotel_ts = self.generate_realistic_timestamp(days_ago=hotel_days_ago, hour_range=(0, 23))
            
            hotel_events.append((
                f'HOTEL{event_counter}',  # _ID
                hotel_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TIMESTAMP with realistic time variation
                event_type,  # EVENTTYPE (descriptive based on room service interaction)
                profile['crmId'],  # CRMID
                profile['ecid'],  # ECID
                profile['email'],  # EMAIL
                None, None, None, None,  # EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID
                profile.get('phoneNumber'),  # PHONENUMBER
                None, None,  # PUSHTOKENS, STACKCHATID
                f'HTL{random.randint(10000, 99999)}',  # CONFIRMATION_NUMBER
                chain,  # HOTEL_CHAIN
                f'{chain} {random.choice(["Downtown", "Airport", "City Center", "Waterfront"])}',  # HOTEL_NAME
                random.choice(['London', 'New York', 'Dubai', 'Singapore', 'Paris']),  # HOTEL_LOCATION
                checkin_date.strftime('%Y-%m-%d'),  # CHECK_IN_DATE
                checkout_date.strftime('%Y-%m-%d'),  # CHECK_OUT_DATE
                nights,  # NIGHTS_STAY
                room_type,  # ROOM_TYPE
                f'{random.randint(100, 999)}',  # ROOM_NUMBER
                random.choice(['BAR', 'CORP', 'AAA', 'GOV']),  # RATE_CODE
                nights * random.choice([150, 200, 350, 500, 750]) if room_type != 'suite' else nights * random.choice([800, 1200]),  # TOTAL_COST
                random.choice(checkin_methods),  # CHECK_IN_METHOD
                checkin_date.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # CHECK_IN_TIME
                random.randint(0, 15),  # QUEUE_TIME
                random.choice([True, False]),  # EARLY_CHECK_IN
                random.choice([True, False]),  # ROOM_READY
                random.choice([True, False]),  # UPGRADED_ROOM
                room_type in ['suite', 'executive'],  # WELCOME_AMENITIES
                interaction_type,  # ROOM_SERVICE_INTERACTION_TYPE (use the one we set for eventType)
                (checkin_date + timedelta(hours=random.randint(1, 12))).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # ORDER_TIME
                (checkin_date + timedelta(hours=random.randint(1, 13))).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # DELIVERY_TIME
                None,  # ITEMS_ORDERED (ARRAY)
                random.choice([25, 45, 75, 120]),  # ORDER_TOTAL
                random.randint(3, 5),  # SERVICE_RATING
                random.choice(amenity_types),  # AMENITY_TYPE
                (checkin_date + timedelta(hours=random.randint(6, 20))).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # USAGE_TIME
                random.randint(30, 120),  # DURATION
                random.choice([0, 25, 50, 100]),  # ADDITIONAL_CHARGE
                random.randint(3, 5),  # SATISFACTION_RATING
                random.choice([True, False]),  # HOUSEKEEPING_SERVICE_REQUESTED
                random.choice([True, False]),  # DO_NOT_DISTURB
                random.choice([True, False]),  # EXTRA_TOWELS
                random.choice([True, False]),  # EXTRA_AMENITIES
                random.randint(4, 5),  # CLEANLINESS_RATING
                random.choice(checkin_methods),  # CHECK_OUT_METHOD
                checkout_date.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # CHECK_OUT_TIME
                random.choice([True, False]),  # LATE_CHECK_OUT
                nights * random.choice([150, 200, 350, 500, 750]) + random.randint(0, 200),  # FINAL_BILL_AMOUNT
                random.randint(0, 200),  # INCIDENTAL_CHARGES
                random.randint(4, 5),  # OVERALL_RATING
                hotel_channel,  # CHANNEL (cross-channel: web, mobile, callcentre, partner)
                _rec_ts  # _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load
            ))
            
            event_counter += 1
        
        return hotel_events
    
    # ========================================
    # LOYALTY TRANSACTION GENERATION
    # ========================================
    
    def generate_loyalty_transactions(self, base_profiles, transactions_per_profile=2, record_created_timestamp=None):
        """Generate realistic loyalty program transactions. _RECORDCREATEDTIMESTAMP = insert time for AEP."""
        _rec_ts = record_created_timestamp or datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        loyalty_events = []
        event_counter = 1
        
        # Weight transaction types to be more realistic
        transaction_types_weighted = ['earn'] * 50 + ['redeem'] * 20 + ['bonus'] * 15 + ['tier_bonus'] * 10 + ['promo'] * 5
        transaction_reasons = ['flight', 'hotel', 'car_rental', 'shopping', 'credit_card', 'promotion']
        redemption_types = ['flight', 'upgrade', 'hotel', 'car', 'merchandise', 'charity', 'transfer']
        redemption_statuses = ['confirmed', 'confirmed', 'confirmed', 'pending']  # Most are confirmed
        tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond']
        voucher_types = ['upgrade', 'lounge', 'baggage', 'seat_selection', 'companion']
        promotion_types = ['double_points', 'bonus_miles', 'status_challenge', 'triple_points', 'tier_match']
        partners = ['Hertz', 'Marriott', 'Visa', 'Mastercard', 'American Express', 'Avis', 'Budget', 'Hilton', 'Hyatt']
        campaigns = [
            'Spring Sale 2026', 'Summer Bonus', 'Holiday Special', 'Anniversary Bonus', 'Welcome Offer',
            'Status Match Challenge', 'Double Points Weekend', 'Triple Miles Promo', 'Birthday Bonus'
        ]
        
        for profile in base_profiles:
            # Skip if customer doesn't have a loyalty ID (not enrolled in program)
            if not profile.get('loyaltyId'):
                continue
            
            # Track member's tier for realistic progression
            current_tier = random.choice(tiers)
            
            for _ in range(transactions_per_profile):
                transaction_type = random.choice(transaction_types_weighted)
                
                # Calculate points based on transaction type
                if transaction_type == 'redeem':
                    is_redemption = True
                    points_redeemed = random.randint(5000, 25000)
                    points_amount = -points_redeemed
                    current_balance = random.randint(15000, 75000)
                    transaction_reason = random.choice(['flight', 'upgrade', 'hotel', 'merchandise'])
                elif transaction_type in ['bonus', 'tier_bonus', 'promo']:
                    is_redemption = False
                    points_amount = random.randint(1000, 8000)
                    current_balance = random.randint(10000, 50000) + points_amount
                    transaction_reason = 'promotion'
                else:  # earn
                    is_redemption = False
                    points_amount = random.randint(500, 5000)
                    current_balance = random.randint(10000, 50000) + points_amount
                    transaction_reason = random.choice(['flight', 'hotel', 'car_rental', 'shopping', 'credit_card'])
                
                # EARNING DETAILS (populated for non-redemption transactions)
                if not is_redemption:
                    base_points = random.randint(300, 3500)
                    bonus_points = random.randint(100, 1500) if transaction_type in ['bonus', 'tier_bonus', 'promo'] else random.randint(0, 500)
                    tier_multiplier = random.choice([1.0, 1.25, 1.5, 1.75, 2.0, 2.5])
                    # Partner points for 60% of earning transactions
                    if random.random() < 0.6:
                        partner_points = random.randint(100, 800)
                        partner_name = random.choice(partners)
                    else:
                        partner_points = 0
                        partner_name = None
                else:
                    base_points = None
                    bonus_points = None
                    tier_multiplier = None
                    partner_points = None
                    partner_name = None
                
                # REDEMPTION DETAILS (populated for redemption transactions)
                if is_redemption:
                    redemption_type = random.choice(redemption_types)
                    redemption_value = random.choice([150, 250, 500, 750, 1000, 1500, 2000])
                    booking_reference = f'BK{random.randint(10000, 99999)}'
                    redemption_status = random.choice(redemption_statuses)
                else:
                    redemption_type = None
                    redemption_value = None
                    booking_reference = None
                    redemption_status = None
                
                # TIER ACTIVITY (15% chance of tier change)
                tier_change_triggered = random.random() < 0.15
                if tier_change_triggered:
                    current_tier_index = tiers.index(current_tier)
                    # 80% upgrade, 20% downgrade
                    if random.random() < 0.8 and current_tier_index < len(tiers) - 1:
                        previous_tier = current_tier
                        new_tier = tiers[current_tier_index + 1]
                        current_tier = new_tier  # Update for next transaction
                    elif current_tier_index > 0:
                        previous_tier = current_tier
                        new_tier = tiers[current_tier_index - 1]
                        current_tier = new_tier
                    else:
                        previous_tier = current_tier
                        new_tier = current_tier
                    
                    tier_qualifying_points = random.randint(10000, 75000)
                    tier_bonus_awarded = random.randint(2000, 10000)
                else:
                    previous_tier = None
                    new_tier = None
                    tier_qualifying_points = None
                    tier_bonus_awarded = None
                
                # VOUCHERS (30% chance with earning/bonus transactions)
                if not is_redemption and random.random() < 0.30:
                    voucher_issued = True
                    voucher_type = random.choice(voucher_types)
                    voucher_code = f'VOUCH{random.randint(10000, 99999)}'
                    voucher_value = random.choice([50, 75, 100, 150, 200, 250])
                    expiry_date = (datetime.utcnow() + timedelta(days=random.randint(180, 365))).strftime('%Y-%m-%d')
                    voucher_used = False
                else:
                    voucher_issued = False
                    voucher_type = None
                    voucher_code = None
                    voucher_value = None
                    expiry_date = None
                    voucher_used = False
                
                # CAMPAIGN/PROMOTION (50% of transactions are part of a campaign)
                if random.random() < 0.50:
                    campaign_id = f'CAMP{random.randint(100, 999)}'
                    campaign_name = random.choice(campaigns)
                    promotion_type = random.choice(promotion_types)
                    promotion_points = random.randint(500, 3000) if transaction_type in ['bonus', 'promo', 'tier_bonus'] else random.randint(0, 1000)
                    promotion_code = f'PROMO{random.randint(1000, 9999)}'
                else:
                    campaign_id = None
                    campaign_name = None
                    promotion_type = None
                    promotion_points = None
                    promotion_code = None
                
                # Generate realistic timestamp for loyalty transaction (within last 1-30 days, any hour)
                loyalty_days_ago = random.randint(1, 30)
                loyalty_ts = self.generate_realistic_timestamp(days_ago=loyalty_days_ago, hour_range=(0, 23))
                
                loyalty_events.append((
                    f'LOYALTY{event_counter}',  # _ID
                    loyalty_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TIMESTAMP with realistic time variation
                    'travel.loyalty',  # EVENTTYPE
                    profile['crmId'],  # CRMID
                    profile['ecid'],  # ECID
                    profile['email'],  # EMAIL
                    profile.get('emailIdSha256'),  # EMAILIDSHA256
                    profile.get('gaid'),  # GAID
                    profile.get('loyaltyId', profile['crmId'].replace('CRM', 'LOYALTY')),  # LOYALTYID
                    profile.get('passportId', profile['crmId'].replace('CRM', 'PASS')),  # PASSPORTID
                    profile.get('phoneNumber'),  # PHONENUMBER
                    None, None,  # PUSHTOKENS, STACKCHATID
                    transaction_type,  # TRANSACTION_TYPE
                    f'TXN{random.randint(100000, 999999)}',  # TRANSACTION_ID
                    loyalty_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TRANSACTION_DATE
                    points_amount,  # POINTS_AMOUNT
                    current_balance,  # POINTS_BALANCE
                    transaction_reason,  # TRANSACTION_REASON
                    base_points,  # BASE_POINTS
                    bonus_points,  # BONUS_POINTS
                    tier_multiplier,  # TIER_MULTIPLIER
                    promotion_code,  # PROMOTION_CODE
                    partner_points,  # PARTNER_POINTS
                    partner_name,  # PARTNER_NAME
                    redemption_type,  # REDEMPTION_TYPE
                    points_redeemed if is_redemption else None,  # POINTS_REDEEMED
                    redemption_value,  # REDEMPTION_VALUE
                    booking_reference,  # BOOKING_REFERENCE
                    redemption_status,  # REDEMPTION_STATUS
                    tier_change_triggered,  # TIER_CHANGE_TRIGGERED
                    previous_tier,  # PREVIOUS_TIER
                    new_tier,  # NEW_TIER
                    tier_qualifying_points,  # TIER_QUALIFYING_POINTS
                    tier_bonus_awarded,  # TIER_BONUS_AWARDED
                    None,  # TIER_BENEFITS_UNLOCKED (ARRAY)
                    voucher_issued,  # VOUCHER_ISSUED
                    voucher_type,  # VOUCHER_TYPE
                    voucher_code,  # VOUCHER_CODE
                    voucher_value,  # VOUCHER_VALUE
                    expiry_date,  # EXPIRY_DATE
                    voucher_used,  # VOUCHER_USED
                    campaign_id,  # CAMPAIGN_ID
                    campaign_name,  # CAMPAIGN_NAME
                    promotion_type,  # PROMOTION_TYPE
                    promotion_points,  # PROMOTION_POINTS
                    'system',  # CHANNEL
                    _rec_ts  # _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load
                ))
                
                event_counter += 1
        
        return loyalty_events
    
    # ========================================
    # POS EVENT GENERATION
    # ========================================
    
    def generate_pos_events(self, base_profiles, pos_rate=0.40, record_created_timestamp=None):
        """Generate point of sale purchase events. _RECORDCREATEDTIMESTAMP = insert time for AEP."""
        _rec_ts = record_created_timestamp or datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        pos_events = []
        event_counter = 1
        
        # Filter to profiles that should make POS purchases
        profiles_with_purchases = []
        for profile in base_profiles:
            flags = self.get_journey_flags(profile['crmId'])
            if flags.get('uses_pos', False):
                profiles_with_purchases.append(profile)
        
        # Fallback to random sampling if no journey flags
        if not profiles_with_purchases and not self.journey_flags:
            profiles_with_purchases = random.sample(base_profiles, int(len(base_profiles) * pos_rate))
        
        transaction_types = ['retail', 'duty_free', 'food_beverage', 'lounge', 'parking', 'fast_track']
        locations = ['airport_terminal', 'lounge', 'in_flight', 'hotel']
        item_categories = ['alcohol', 'tobacco', 'perfume', 'electronics', 'fashion', 'food', 'beverage', 'books']
        payment_methods = ['credit_card', 'debit_card', 'points', 'voucher', 'mobile_wallet', 'cash']
        card_types = ['visa', 'mastercard', 'amex', 'other']
        pickup_locations = ['departure_gate', 'arrival', 'collection_point']
        
        for profile in profiles_with_purchases:
            transaction_type = random.choice(transaction_types)
            is_duty_free = transaction_type == 'duty_free'
            
            subtotal = random.choice([15, 25, 45, 75, 125, 250, 500])
            tax = subtotal * 0.20 if not is_duty_free else 0
            discount = random.choice([0, 5, 10, 20]) if random.random() < 0.3 else 0
            total = subtotal + tax - discount
            
            # Generate realistic timestamp for POS event (within last 1-14 days, any hour)
            pos_days_ago = random.randint(1, 14)
            pos_ts = self.generate_realistic_timestamp(days_ago=pos_days_ago, hour_range=(0, 23))
            
            pos_events.append((
                f'POS{event_counter}',  # _ID
                pos_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TIMESTAMP with realistic time variation
                'travel.pos',  # EVENTTYPE
                profile['crmId'],  # CRMID
                profile['ecid'],  # ECID
                profile['email'],  # EMAIL
                None, None, None, None,  # EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID
                profile.get('phoneNumber'),  # PHONENUMBER
                None, None,  # PUSHTOKENS, STACKCHATID
                f'TXN{random.randint(100000, 999999)}',  # TRANSACTION_ID
                transaction_type,  # TRANSACTION_TYPE
                pos_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # TRANSACTION_DATE
                random.choice(locations),  # LOCATION
                f'TERM{random.randint(1, 50)}',  # TERMINAL_ID
                random.choice(['WHSmith', 'Boots', 'Harrods', 'Costa', 'Pret', 'World Duty Free']),  # STORE_NAME
                None,  # ITEMS (ARRAY)
                None,  # ITEM_CATEGORIES (ARRAY)
                random.randint(1, 5),  # ITEM_COUNT
                subtotal,  # SUBTOTAL
                tax,  # TAX
                discount,  # DISCOUNT
                total,  # TOTAL
                random.choice(['GBP', 'USD', 'EUR']),  # CURRENCY
                random.choice(payment_methods),  # PAYMENT_METHOD
                random.choice(card_types),  # CARD_TYPE
                random.randint(0, 5000) if random.random() < 0.2 else 0,  # LOYALTY_POINTS_USED
                random.choice([True, False]) if random.random() < 0.1 else False,  # VOUCHER_USED
                f'VOUCH{random.randint(10000, 99999)}' if random.random() < 0.1 else None,  # VOUCHER_CODE
                random.choice([True, False]),  # LOYALTY_CARD_SCANNED
                profile['crmId'],  # LOYALTY_ID
                int(total * 10) if random.random() < 0.7 else 0,  # POINTS_EARNED
                random.choice([5, 10, 15, 20]) if random.random() < 0.2 else 0,  # TIER_DISCOUNT
                random.choice(['10% off next purchase', '2x points']) if random.random() < 0.15 else None,  # MEMBER_OFFER
                is_duty_free,  # IS_DUTY_FREE
                tax if is_duty_free else 0,  # TAX_SAVINGS
                random.choice(pickup_locations) if is_duty_free else None,  # PICKUP_LOCATION
                f'{random.choice(["BA", "VS", "AA"])}{random.randint(100, 999)}' if is_duty_free else None,  # FLIGHT_NUMBER
                f'STAFF{random.randint(100, 999)}',  # STAFF_ID
                random.randint(3, 5),  # STAFF_SERVICE_RATING
                random.choice([True, False]),  # UPSELL_OFFERED
                random.choice([True, False]),  # UPSELL_ACCEPTED
                None,  # FUNNEL_NAME
                None,  # FUNNEL_STEP
                None,  # FUNNEL_STEP_NUMBER
                None,  # FUNNEL_COMPLETION_STATUS
                None,  # ANCILLARY_ITEM_NAME
                None,  # ANCILLARY_ITEM_PRICE
                None,  # ANCILLARY_ITEM_CATEGORY
                'pos',  # CHANNEL
                _rec_ts  # _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load
            ))
            
            event_counter += 1
        
        return pos_events
    
    # ========================================
    # INSERT METHODS
    # ========================================
    
    def insert_disruption_events(self, events):
        """Insert disruption events into Snowflake"""
        insert_sql = """
            INSERT INTO AGENTIC_TRAVEL_EVENT_DISRUPTION (
                _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID,
                PHONENUMBER, PUSHTOKENS, STACKCHATID, DISRUPTION_TYPE, DISRUPTION_SEVERITY,
                ORIGINAL_DEPARTURE_TIME, NEW_DEPARTURE_TIME, DELAY_MINUTES, DISRUPTION_REASON, NOTIFICATION_METHOD,
                FLIGHT_NUMBER, AIRLINE, ORIGIN_AIRPORT, DESTINATION_AIRPORT, ORIGINAL_GATE, NEW_GATE, AIRCRAFT,
                MISSED_CONNECTION, REBOOKED_FLIGHT, COMPENSATION_OFFERED, COMPENSATION_TYPE, COMPENSATION_AMOUNT,
                LOUNGE_ACCESS_PROVIDED, HOTEL_ACCOMMODATION_PROVIDED, CUSTOMER_CONTACTED, CONTACT_CHANNEL,
                RESPONSE_TIME, RESOLUTION_OFFERED, CUSTOMER_ACCEPTED, CHANNEL, _RECORDCREATEDTIMESTAMP
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, events)
        return len(events)
    
    def insert_inflight_events(self, events):
        """Insert in-flight events into Snowflake"""
        insert_sql = """
            INSERT INTO AGENTIC_TRAVEL_EVENT_INFLIGHT (
                _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID,
                PHONENUMBER, PUSHTOKENS, STACKCHATID, FLIGHT_NUMBER, AIRLINE, ROUTE, CABIN_CLASS, SEAT_NUMBER,
                FLIGHT_DURATION, INTERACTION_TYPE, CREW_MEMBER_ID, SERVICE_RATING, ITEM_ORDERED, SPECIAL_REQUEST,
                REQUEST_FULFILLED, ENTERTAINMENT_SYSTEM_USED, CONTENT_TYPE, CONTENT_TITLE, WATCH_TIME, CONTENT_RATING,
                MEAL_TYPE, MEAL_CHOICE, SPECIAL_MEAL, MEAL_RATING, EXTRA_ITEMS, WIFI_PURCHASED, WIFI_PACKAGE,
                WIFI_COST, DATA_USED, AMENITY_KIT_RECEIVED, BLANKET_REQUESTED, PILLOW_REQUESTED,
                TEMPERATURE_ADJUSTMENT, SEAT_COMFORT_RATING, CHANNEL, _RECORDCREATEDTIMESTAMP
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, events)
        return len(events)
    
    def insert_hotel_events(self, events):
        """Insert hotel events into Snowflake"""
        insert_sql = """
            INSERT INTO AGENTIC_TRAVEL_EVENT_HOTEL (
                _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID,
                PHONENUMBER, PUSHTOKENS, STACKCHATID, CONFIRMATION_NUMBER, HOTEL_CHAIN, HOTEL_NAME, HOTEL_LOCATION,
                CHECK_IN_DATE, CHECK_OUT_DATE, NIGHTS_STAY, ROOM_TYPE, ROOM_NUMBER, RATE_CODE, TOTAL_COST,
                CHECK_IN_METHOD, CHECK_IN_TIME, QUEUE_TIME, EARLY_CHECK_IN, ROOM_READY, UPGRADED_ROOM,
                WELCOME_AMENITIES, ROOM_SERVICE_INTERACTION_TYPE, ORDER_TIME, DELIVERY_TIME, ITEMS_ORDERED,
                ORDER_TOTAL, SERVICE_RATING, AMENITY_TYPE, USAGE_TIME, DURATION, ADDITIONAL_CHARGE,
                SATISFACTION_RATING, HOUSEKEEPING_SERVICE_REQUESTED, DO_NOT_DISTURB, EXTRA_TOWELS, EXTRA_AMENITIES,
                CLEANLINESS_RATING, CHECK_OUT_METHOD, CHECK_OUT_TIME, LATE_CHECK_OUT, FINAL_BILL_AMOUNT,
                INCIDENTAL_CHARGES, OVERALL_RATING, CHANNEL, _RECORDCREATEDTIMESTAMP
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, events)
        return len(events)
    
    def insert_loyalty_transactions(self, events):
        """Insert loyalty transaction events into Snowflake"""
        insert_sql = """
            INSERT INTO AGENTIC_TRAVEL_EVENT_LOYALTY (
                _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID,
                PHONENUMBER, PUSHTOKENS, STACKCHATID, TRANSACTION_TYPE, TRANSACTION_ID, TRANSACTION_DATE,
                POINTS_AMOUNT, POINTS_BALANCE, TRANSACTION_REASON, BASE_POINTS, BONUS_POINTS, TIER_MULTIPLIER,
                PROMOTION_CODE, PARTNER_POINTS, PARTNER_NAME, REDEMPTION_TYPE, POINTS_REDEEMED, REDEMPTION_VALUE,
                BOOKING_REFERENCE, REDEMPTION_STATUS, TIER_CHANGE_TRIGGERED, PREVIOUS_TIER, NEW_TIER,
                TIER_QUALIFYING_POINTS, TIER_BONUS_AWARDED, TIER_BENEFITS_UNLOCKED, VOUCHER_ISSUED, VOUCHER_TYPE,
                VOUCHER_CODE, VOUCHER_VALUE, EXPIRY_DATE, VOUCHER_USED, CAMPAIGN_ID, CAMPAIGN_NAME,
                PROMOTION_TYPE, PROMOTION_POINTS, CHANNEL, _RECORDCREATEDTIMESTAMP
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, events)
        return len(events)
    
    def insert_pos_events(self, events):
        """Insert POS events into Snowflake"""
        insert_sql = """
            INSERT INTO AGENTIC_TRAVEL_EVENT_POS (
                _ID, TIMESTAMP, EVENTTYPE, CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID,
                PHONENUMBER, PUSHTOKENS, STACKCHATID, TRANSACTION_ID, TRANSACTION_TYPE, TRANSACTION_DATE,
                LOCATION, TERMINAL_ID, STORE_NAME, ITEMS, ITEM_CATEGORIES, ITEM_COUNT, SUBTOTAL, TAX, DISCOUNT,
                TOTAL, CURRENCY, PAYMENT_METHOD, CARD_TYPE, LOYALTY_POINTS_USED, VOUCHER_USED, VOUCHER_CODE,
                LOYALTY_CARD_SCANNED, LOYALTY_ID, POINTS_EARNED, TIER_DISCOUNT, MEMBER_OFFER, IS_DUTY_FREE,
                TAX_SAVINGS, PICKUP_LOCATION, FLIGHT_NUMBER, STAFF_ID, STAFF_SERVICE_RATING, UPSELL_OFFERED,
                UPSELL_ACCEPTED,
                FUNNEL_NAME, FUNNEL_STEP, FUNNEL_STEP_NUMBER, FUNNEL_COMPLETION_STATUS,
                ANCILLARY_ITEM_NAME, ANCILLARY_ITEM_PRICE, ANCILLARY_ITEM_CATEGORY,
                CHANNEL,
                _RECORDCREATEDTIMESTAMP
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        # Events already include all required columns (funnel, ancillary, channel, timestamp)
        self.cursor.executemany(insert_sql, events)
        return len(events)
    
    # ========================================
    # MAIN GENERATION METHOD
    # ========================================
    
    def generate_and_insert_all(self, base_profiles):
        """Generate and insert all Phase 3 events. _RECORDCREATEDTIMESTAMP = insert time for AEP incremental load."""
        results = {
            'success': True,
            'disruption_events': 0,
            'inflight_events': 0,
            'hotel_events': 0,
            'loyalty_transactions': 0,
            'pos_events': 0
        }
        insert_time = datetime.utcnow()
        insert_ts = insert_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        
        try:
            # Generate disruption events (10% of profiles)
            print(f"  Generating disruption events...")
            disruption_events = self.generate_disruption_events(base_profiles, disruption_rate=0.10, record_created_timestamp=insert_ts)
            results['disruption_events'] = self.insert_disruption_events(disruption_events)
            print(f"  ✓ Inserted {results['disruption_events']} disruption events")
            
            # Generate in-flight events (2 per profile)
            print(f"  Generating in-flight events...")
            inflight_events = self.generate_inflight_events(base_profiles, events_per_profile=2, record_created_timestamp=insert_ts)
            results['inflight_events'] = self.insert_inflight_events(inflight_events)
            print(f"  ✓ Inserted {results['inflight_events']} in-flight events")
            
            # Generate hotel events (30% of profiles)
            print(f"  Generating hotel events...")
            hotel_events = self.generate_hotel_events(base_profiles, hotel_rate=0.30, record_created_timestamp=insert_ts)
            results['hotel_events'] = self.insert_hotel_events(hotel_events)
            print(f"  ✓ Inserted {results['hotel_events']} hotel events")
            
            # Generate loyalty transactions (2 per profile)
            print(f"  Generating loyalty transactions...")
            loyalty_events = self.generate_loyalty_transactions(base_profiles, transactions_per_profile=2, record_created_timestamp=insert_ts)
            results['loyalty_transactions'] = self.insert_loyalty_transactions(loyalty_events)
            print(f"  ✓ Inserted {results['loyalty_transactions']} loyalty transactions")
            
            # Generate POS events (40% of profiles)
            print(f"  Generating POS events...")
            pos_events = self.generate_pos_events(base_profiles, pos_rate=0.40, record_created_timestamp=insert_ts)
            results['pos_events'] = self.insert_pos_events(pos_events)
            print(f"  ✓ Inserted {results['pos_events']} POS events")
            
        except Exception as e:
            results['success'] = False
            results['error'] = str(e)
            print(f"  ✗ Error: {e}")
        
        return results
    
    @staticmethod
    def generate_phase3_verification_sql():
        """Generate SQL verification queries for Phase 3 tables"""
        return {
            'count_phase3': """
-- Count all Phase 3 records
SELECT 'Disruption Events' as table_name, COUNT(*) as count 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_DISRUPTION
UNION ALL
SELECT 'InFlight Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_INFLIGHT
UNION ALL
SELECT 'Hotel Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_HOTEL
UNION ALL
SELECT 'Loyalty Transactions', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_LOYALTY
UNION ALL
SELECT 'POS Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_POS;
""",
            'latest_disruptions': """
-- Latest 5 disruption events
SELECT _ID, CRMID, EMAIL, DISRUPTION_TYPE, DISRUPTION_SEVERITY, AIRLINE, FLIGHT_NUMBER, COMPENSATION_OFFERED
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_DISRUPTION
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_inflight': """
-- Latest 5 in-flight events
SELECT _ID, CRMID, EMAIL, FLIGHT_NUMBER, CABIN_CLASS, INTERACTION_TYPE, SERVICE_RATING
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_INFLIGHT
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_hotels': """
-- Latest 5 hotel events
SELECT _ID, CRMID, EMAIL, HOTEL_CHAIN, ROOM_TYPE, NIGHTS_STAY, TOTAL_COST, OVERALL_RATING
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_HOTEL
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_loyalty': """
-- Latest 5 loyalty transactions
SELECT _ID, CRMID, EMAIL, TRANSACTION_TYPE, POINTS_AMOUNT, POINTS_BALANCE, TRANSACTION_REASON
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_LOYALTY
ORDER BY TIMESTAMP DESC
LIMIT 5;
""",
            'latest_pos': """
-- Latest 5 POS events
SELECT _ID, CRMID, EMAIL, TRANSACTION_TYPE, STORE_NAME, TOTAL, PAYMENT_METHOD, POINTS_EARNED
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_POS
ORDER BY TIMESTAMP DESC
LIMIT 5;
"""
        }
