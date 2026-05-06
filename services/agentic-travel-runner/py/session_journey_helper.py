#!/usr/bin/env python3
"""
Session Journey Helper Module
Generates realistic multi-session customer journeys with proper funnels
"""

import random
from datetime import datetime, timedelta

class SessionJourneyHelper:
    """Helper class for generating realistic session patterns and journeys"""
    
    # Session types with weights
    SESSION_TYPES = {
        'browse_only': 0.30,          # 30% - Just browsing
        'search_research': 0.25,      # 25% - Search but don't book
        'booking_incomplete': 0.20,   # 20% - Start booking, abandon
        'booking_complete': 0.15,     # 15% - Complete booking
        'account_management': 0.05,   # 5% - Check account
        'change_incomplete': 0.03,    # 3% - Start change, abandon
        'change_complete': 0.02       # 2% - Complete flight change
    }
    
    # Funnel definitions for CJA Fallout analysis
    # Web page name to funnel mapping
    FUNNEL_METADATA = {
        'home': {'funnel': 'flight_booking', 'step': 'homepage_entry', 'number': 0, 'status': 'started'},
        'flight-search': {'funnel': 'flight_booking', 'step': 'search', 'number': 1, 'status': 'in_progress'},
        'flight-search-results': {'funnel': 'flight_booking', 'step': 'results_view', 'number': 2, 'status': 'in_progress'},
        'flight-details': {'funnel': 'flight_booking', 'step': 'select_flight', 'number': 3, 'status': 'in_progress'},
        'flight-booking-step-1': {'funnel': 'flight_booking', 'step': 'passenger_details', 'number': 4, 'status': 'in_progress'},
        'flight-booking-step-2': {'funnel': 'flight_booking', 'step': 'payment', 'number': 5, 'status': 'in_progress'},
        'flight-booking-complete': {'funnel': 'flight_booking', 'step': 'confirmation', 'number': 6, 'status': 'completed'},
        'my-account': {'funnel': 'account_management', 'step': 'view_account', 'number': 1, 'status': 'in_progress'},
        'flight-change-options': {'funnel': 'flight_change', 'step': 'view_options', 'number': 1, 'status': 'in_progress'},
        'date-change': {'funnel': 'flight_change', 'step': 'date_change', 'number': 2, 'status': 'in_progress'},
        'seat-upgrade': {'funnel': 'flight_change', 'step': 'seat_upgrade', 'number': 3, 'status': 'in_progress'},
        'luggage-upgrade': {'funnel': 'flight_change', 'step': 'luggage_upgrade', 'number': 4, 'status': 'in_progress'},
        'change-complete': {'funnel': 'flight_change', 'step': 'change_confirmed', 'number': 5, 'status': 'completed'},
        'login': {'funnel': 'authentication', 'step': 'login', 'number': 1, 'status': 'completed'},
        'destinations': {'funnel': 'inspiration', 'step': 'browse_destinations', 'number': 1, 'status': 'in_progress'},
        'offers': {'funnel': 'inspiration', 'step': 'browse_offers', 'number': 1, 'status': 'in_progress'}
    }
    
    # Mobile screen name to funnel mapping
    MOBILE_FUNNEL_METADATA = {
        'Home': {'funnel': 'mobile_flight_booking', 'step': 'app_opened', 'number': 0, 'status': 'started'},
        'Search': {'funnel': 'mobile_flight_booking', 'step': 'search', 'number': 1, 'status': 'in_progress'},
        'Results': {'funnel': 'mobile_flight_booking', 'step': 'results_view', 'number': 2, 'status': 'in_progress'},
        'Flight Details': {'funnel': 'mobile_flight_booking', 'step': 'product_view', 'number': 3, 'status': 'in_progress'},
        'Checkout': {'funnel': 'mobile_flight_booking', 'step': 'checkout', 'number': 4, 'status': 'in_progress'},
        'Confirmation': {'funnel': 'mobile_flight_booking', 'step': 'purchase_complete', 'number': 5, 'status': 'completed'},
        'My Bookings': {'funnel': 'mobile_account', 'step': 'view_bookings', 'number': 1, 'status': 'in_progress'},
        'Profile': {'funnel': 'mobile_account', 'step': 'view_profile', 'number': 1, 'status': 'in_progress'},
        'Destinations': {'funnel': 'mobile_inspiration', 'step': 'browse_destinations', 'number': 1, 'status': 'in_progress'},
        'Offers': {'funnel': 'mobile_inspiration', 'step': 'browse_offers', 'number': 1, 'status': 'in_progress'}
    }
    
    # Ancillary product funnel definitions (Web & Mobile)
    ANCILLARY_FUNNELS = {
        'cabin_upgrade': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'options_browsed', 'number': 1, 'status': 'in_progress'},
                {'step': 'pricing_viewed', 'number': 2, 'status': 'in_progress'},
                {'step': 'cabin_selected', 'number': 3, 'status': 'in_progress'},
                {'step': 'details_confirmed', 'number': 4, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 5, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 6, 'status': 'completed'}
            ],
            'categories': ['economy_to_premium', 'economy_to_business', 'premium_to_business', 'business_to_first'],
            'prices': {'economy_to_premium': (80, 150), 'economy_to_business': (200, 400), 
                      'premium_to_business': (150, 300), 'business_to_first': (400, 800)}
        },
        'seat_selection': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'seat_map_viewed', 'number': 1, 'status': 'in_progress'},
                {'step': 'seat_options_browsed', 'number': 2, 'status': 'in_progress'},
                {'step': 'seat_selected', 'number': 3, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 4, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 5, 'status': 'completed'}
            ],
            'categories': ['extra_legroom', 'exit_row', 'premium_seat', 'front_row'],
            'prices': {'extra_legroom': (25, 50), 'exit_row': (35, 65), 
                      'premium_seat': (50, 100), 'front_row': (30, 60)}
        },
        'baggage_addon': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'baggage_options_viewed', 'number': 1, 'status': 'in_progress'},
                {'step': 'quantity_selected', 'number': 2, 'status': 'in_progress'},
                {'step': 'pricing_viewed', 'number': 3, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 4, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 5, 'status': 'completed'}
            ],
            'categories': ['extra_bag_1', 'extra_bag_2', 'extra_bag_3', 'oversized_sports'],
            'prices': {'extra_bag_1': (40, 70), 'extra_bag_2': (70, 120), 
                      'extra_bag_3': (100, 160), 'oversized_sports': (80, 150)}
        },
        'lounge_purchase': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'lounges_browsed', 'number': 1, 'status': 'in_progress'},
                {'step': 'lounge_details_viewed', 'number': 2, 'status': 'in_progress'},
                {'step': 'lounge_selected', 'number': 3, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 4, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 5, 'status': 'completed'}
            ],
            'categories': ['departure_lounge', 'arrival_lounge', 'both_lounges', 'partner_lounge'],
            'prices': {'departure_lounge': (35, 55), 'arrival_lounge': (35, 55), 
                      'both_lounges': (60, 95), 'partner_lounge': (40, 70)}
        },
        'fast_track_purchase': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'benefits_viewed', 'number': 1, 'status': 'in_progress'},
                {'step': 'option_selected', 'number': 2, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 3, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 4, 'status': 'completed'}
            ],
            'categories': ['fast_track_solo', 'fast_track_family', 'fast_track_priority'],
            'prices': {'fast_track_solo': (15, 25), 'fast_track_family': (40, 65), 
                      'fast_track_priority': (25, 40)}
        },
        'meal_preorder': {
            'steps': [
                {'step': 'offer_viewed', 'number': 0, 'status': 'started'},
                {'step': 'menu_browsed', 'number': 1, 'status': 'in_progress'},
                {'step': 'meal_selected', 'number': 2, 'status': 'in_progress'},
                {'step': 'payment_initiated', 'number': 3, 'status': 'in_progress'},
                {'step': 'purchase_completed', 'number': 4, 'status': 'completed'}
            ],
            'categories': ['premium_meal', 'special_dietary', 'kids_meal', 'beverage_package'],
            'prices': {'premium_meal': (15, 30), 'special_dietary': (18, 35), 
                      'kids_meal': (10, 18), 'beverage_package': (12, 25)}
        }
    }
    
    @staticmethod
    def get_funnel_metadata(page_name):
        """Get funnel metadata for a given page name (web)"""
        return SessionJourneyHelper.FUNNEL_METADATA.get(page_name, {
            'funnel': None,
            'step': None,
            'number': None,
            'status': None
        })
    
    @staticmethod
    def get_mobile_funnel_metadata(screen_name):
        """Get funnel metadata for a given mobile screen name"""
        return SessionJourneyHelper.MOBILE_FUNNEL_METADATA.get(screen_name, {
            'funnel': None,
            'step': None,
            'number': None,
            'status': None
        })
    
    @staticmethod
    def get_ancillary_funnel_step(funnel_type, step_index):
        """
        Get ancillary funnel step metadata
        
        Args:
            funnel_type: One of the ANCILLARY_FUNNELS keys
            step_index: Index in the steps array (0-6)
            
        Returns:
            dict with step, number, status
        """
        if funnel_type in SessionJourneyHelper.ANCILLARY_FUNNELS:
            funnel = SessionJourneyHelper.ANCILLARY_FUNNELS[funnel_type]
            if 0 <= step_index < len(funnel['steps']):
                return funnel['steps'][step_index]
        return {'step': None, 'number': None, 'status': None}
    
    @staticmethod
    def get_ancillary_item_details(funnel_type, category=None):
        """
        Get ancillary item name and price
        
        Args:
            funnel_type: One of the ANCILLARY_FUNNELS keys
            category: Specific category (optional, random if not provided)
            
        Returns:
            dict with item_name, price, category
        """
        if funnel_type not in SessionJourneyHelper.ANCILLARY_FUNNELS:
            return {'item_name': None, 'price': None, 'category': None}
        
        funnel = SessionJourneyHelper.ANCILLARY_FUNNELS[funnel_type]
        
        # Select category
        if category is None or category not in funnel['categories']:
            category = random.choice(funnel['categories'])
        
        # Get price range
        price_range = funnel['prices'].get(category, (0, 0))
        price = round(random.uniform(price_range[0], price_range[1]), 2)
        
        # Format item name
        item_name = category.replace('_', ' ').title()
        
        return {
            'item_name': item_name,
            'price': price,
            'category': category
        }
    
    @staticmethod
    def should_generate_ancillary_funnel(channel='web'):
        """
        Determine if an ancillary funnel should be generated for this session
        
        Args:
            channel: 'web', 'mobile', 'pos', or 'checkin'
            
        Returns:
            tuple: (should_generate, funnel_type, conversion_rate)
        """
        # Ancillary offer rates by channel
        ancillary_rates = {
            'web': 0.25,        # 25% of web sessions see ancillary offers
            'mobile': 0.20,     # 20% of mobile sessions
            'pos': 0.40,        # 40% of POS interactions (check-in desk, gate)
            'checkin': 0.35,    # 35% of check-in events
            'callcentre': 0.30  # 30% of call centre interactions
        }
        
        rate = ancillary_rates.get(channel, 0.20)
        
        if random.random() > rate:
            return (False, None, 0)
        
        # Select ancillary type (weighted by popularity)
        ancillary_weights = {
            'seat_selection': 0.35,      # 35% - Most common
            'baggage_addon': 0.25,       # 25%
            'cabin_upgrade': 0.15,       # 15%
            'lounge_purchase': 0.10,     # 10%
            'fast_track_purchase': 0.08, # 8%
            'meal_preorder': 0.07        # 7%
        }
        
        funnel_type = random.choices(
            list(ancillary_weights.keys()),
            weights=list(ancillary_weights.values())
        )[0]
        
        # Conversion rates by funnel type
        conversion_rates = {
            'seat_selection': 0.45,      # 45% conversion
            'baggage_addon': 0.35,       # 35%
            'cabin_upgrade': 0.15,       # 15% (expensive)
            'lounge_purchase': 0.25,     # 25%
            'fast_track_purchase': 0.40, # 40%
            'meal_preorder': 0.30        # 30%
        }
        
        conversion_rate = conversion_rates.get(funnel_type, 0.25)
        
        return (True, funnel_type, conversion_rate)
    
    # Customer session patterns
    CUSTOMER_PATTERNS = {
        'single_session': 0.40,       # 40% - One visit only
        'multiple_sessions': 0.40,    # 40% - 2-3 visits
        'power_user': 0.20            # 20% - 4-5+ visits
    }
    
    # Channel preference
    CHANNEL_PREFERENCE = {
        'web_only': 0.20,             # 20% - Web only
        'mobile_only': 0.20,          # 20% - Mobile only
        'both': 0.60                  # 60% - Mix of both
    }
    
    @staticmethod
    def get_customer_session_plan(customer_segment='bronze'):
        """
        Determine how many sessions and which channels for a customer
        
        Returns:
            dict with session_count, channel_preference, session_types
        """
        # Premium customers have more sessions
        # Weights adjusted to account for "both" channel filtering (some sessions go to mobile)
        if customer_segment in ['platinum', 'diamond']:
            pattern_weights = [0.15, 0.50, 0.35]  # More likely to be multi-session
        elif customer_segment in ['gold', 'silver']:
            pattern_weights = [0.25, 0.50, 0.25]
        else:
            pattern_weights = [0.30, 0.45, 0.25]  # Bronze/new customers - increased multi-session
        
        pattern = random.choices(
            ['single_session', 'multiple_sessions', 'power_user'],
            weights=pattern_weights
        )[0]
        
        # Determine session count
        if pattern == 'single_session':
            session_count = 1
        elif pattern == 'multiple_sessions':
            session_count = random.randint(2, 3)
        else:  # power_user
            session_count = random.randint(4, 5)
        
        # Channel preference
        channel_pref = random.choices(
            ['web_only', 'mobile_only', 'both'],
            weights=[0.20, 0.20, 0.60]
        )[0]
        
        # Generate session types for this customer's journey
        session_types = SessionJourneyHelper._generate_session_sequence(session_count, customer_segment)
        
        return {
            'session_count': session_count,
            'channel_preference': channel_pref,
            'session_types': session_types,
            'pattern': pattern
        }
    
    @staticmethod
    def _generate_session_sequence(session_count, customer_segment):
        """Generate realistic sequence of session types"""
        sessions = []
        has_booked = False
        
        for i in range(session_count):
            if i == 0:
                # First session - usually browse or search
                session_type = random.choices(
                    ['browse_only', 'search_research', 'booking_incomplete', 'booking_complete'],
                    weights=[0.40, 0.35, 0.15, 0.10]
                )[0]
            elif not has_booked and i == session_count - 1:
                # Last session and haven't booked - higher chance of conversion
                session_type = random.choices(
                    ['search_research', 'booking_incomplete', 'booking_complete', 'browse_only'],
                    weights=[0.25, 0.25, 0.40, 0.10]
                )[0]
            elif has_booked:
                # After booking - account management or changes
                session_type = random.choices(
                    ['account_management', 'change_incomplete', 'change_complete', 'browse_only'],
                    weights=[0.50, 0.20, 0.20, 0.10]
                )[0]
            else:
                # Middle sessions - varied
                session_type = random.choices(
                    ['browse_only', 'search_research', 'booking_incomplete', 'booking_complete'],
                    weights=[0.25, 0.35, 0.25, 0.15]
                )[0]
            
            if session_type == 'booking_complete':
                has_booked = True
            
            sessions.append(session_type)
        
        return sessions
    
    @staticmethod
    def generate_web_booking_journey_complete(origin, destination, origin_airport, dest_airport, 
                                              departure_date, return_date, passengers, cabin_class):
        """Generate COMPLETE booking journey for web"""
        events = []
        time_offset = 0
        
        # 1. Home page
        events.append({
            'event_type': 'pageView',
            'page_type': 'home',
            'page_name': 'home',
            'page_url': 'travel.example.com/',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(2, 5)
        
        # 2. Flight search results page
        search_url = f'travel.example.com/search?from={origin_airport}&to={dest_airport}'
        events.append({
            'event_type': 'pageView',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        
        # 3. Flight search event (METRIC)
        events.append({
            'event_type': 'flight.search',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': 'flight.search'
        })
        time_offset += random.randint(5, 10)
        
        # 4. View flight details
        flight_num = f"BA{random.randint(100, 999)}"
        flight_url = f'travel.example.com/flights/{flight_num}/{origin_airport}-{dest_airport}'
        events.append({
            'event_type': 'pageView',
            'page_type': 'details',
            'page_name': 'flight-details',
            'page_url': flight_url,
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(15, 30)
        
        # 5. Booking Step 1 page
        events.append({
            'event_type': 'pageView',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-1',
            'page_url': 'travel.example.com/booking/step-1',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 2
        
        # 6. Booking Step 1 event (METRIC)
        events.append({
            'event_type': 'flight.booking.step1',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-1',
            'page_url': 'travel.example.com/booking/step-1',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': 'flight.booking.step1'
        })
        time_offset += random.randint(20, 40)
        
        # 7. Booking Step 2 page
        events.append({
            'event_type': 'pageView',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-2',
            'page_url': 'travel.example.com/booking/step-2',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 2
        
        # 8. Booking Step 2 event (METRIC)
        events.append({
            'event_type': 'flight.booking.step2',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-2',
            'page_url': 'travel.example.com/booking/step-2',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': 'flight.booking.step2'
        })
        time_offset += random.randint(30, 60)
        
        # 9. Booking complete page
        events.append({
            'event_type': 'pageView',
            'page_type': 'confirmation',
            'page_name': 'flight-booking-complete',
            'page_url': 'travel.example.com/booking/complete',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        
        # 10. Booking complete event (METRIC)
        events.append({
            'event_type': 'flight.booking.complete',
            'page_type': 'confirmation',
            'page_name': 'flight-booking-complete',
            'page_url': 'travel.example.com/booking/complete',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': 'flight.booking.complete'
        })
        
        return events
    
    @staticmethod
    def generate_web_booking_journey_incomplete(origin, destination, origin_airport, dest_airport,
                                                departure_date, return_date, passengers, cabin_class):
        """Generate INCOMPLETE booking journey - abandon at step 1 or 2"""
        events = []
        time_offset = 0
        
        # 1. Home
        events.append({
            'event_type': 'pageView',
            'page_type': 'home',
            'page_name': 'home',
            'page_url': 'travel.example.com/',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(2, 5)
        
        # 2-3. Search
        search_url = f'travel.example.com/search?from={origin_airport}&to={dest_airport}'
        events.append({
            'event_type': 'pageView',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        events.append({
            'event_type': 'flight.search',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': 'flight.search'
        })
        time_offset += random.randint(5, 10)
        
        # 4. Flight details
        flight_num = f"BA{random.randint(100, 999)}"
        flight_url = f'travel.example.com/flights/{flight_num}/{origin_airport}-{dest_airport}'
        events.append({
            'event_type': 'pageView',
            'page_type': 'details',
            'page_name': 'flight-details',
            'page_url': flight_url,
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(10, 20)
        
        # 5-6. Step 1
        events.append({
            'event_type': 'pageView',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-1',
            'page_url': 'travel.example.com/booking/step-1',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 2
        events.append({
            'event_type': 'flight.booking.step1',
            'page_type': 'booking',
            'page_name': 'flight-booking-step-1',
            'page_url': 'travel.example.com/booking/step-1',
            'search_term': None,
            'flight_number': flight_num,
            'time_offset': time_offset,
            'metric_event': 'flight.booking.step1'
        })
        time_offset += random.randint(10, 30)
        
        # 50% chance to reach step 2 before abandoning
        if random.random() < 0.5:
            events.append({
                'event_type': 'pageView',
                'page_type': 'booking',
                'page_name': 'flight-booking-step-2',
                'page_url': 'travel.example.com/booking/step-2',
                'search_term': None,
                'flight_number': flight_num,
                'time_offset': time_offset,
                'metric_event': None
            })
            time_offset += 2
            events.append({
                'event_type': 'flight.booking.step2',
                'page_type': 'booking',
                'page_name': 'flight-booking-step-2',
                'page_url': 'travel.example.com/booking/step-2',
                'search_term': None,
                'flight_number': flight_num,
                'time_offset': time_offset,
                'metric_event': 'flight.booking.step2'
            })
        
        # Abandon (no complete event)
        return events
    
    @staticmethod
    def generate_web_search_research_journey(origin, destination, origin_airport, dest_airport,
                                            departure_date, return_date, passengers, cabin_class):
        """Generate search & research journey - no booking attempt"""
        events = []
        time_offset = 0
        
        # 1. Home
        events.append({
            'event_type': 'pageView',
            'page_type': 'home',
            'page_name': 'home',
            'page_url': 'travel.example.com/',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(2, 5)
        
        # 2-3. Search
        search_url = f'travel.example.com/search?from={origin_airport}&to={dest_airport}'
        events.append({
            'event_type': 'pageView',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        events.append({
            'event_type': 'flight.search',
            'page_type': 'search',
            'page_name': 'flight-search-results',
            'page_url': search_url,
            'search_term': f'{destination} flights',
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': 'flight.search'
        })
        time_offset += random.randint(5, 10)
        
        # 4-6. View 1-3 flight details
        num_flights = random.randint(1, 3)
        for i in range(num_flights):
            flight_num = f"BA{random.randint(100, 999)}"
            flight_url = f'travel.example.com/flights/{flight_num}/{origin_airport}-{dest_airport}'
            events.append({
                'event_type': 'pageView',
                'page_type': 'details',
                'page_name': 'flight-details',
                'page_url': flight_url,
                'search_term': None,
                'flight_number': flight_num,
                'time_offset': time_offset,
                'metric_event': None
            })
            time_offset += random.randint(10, 20)
        
        # Exit without booking
        return events
    
    @staticmethod
    def generate_web_browse_only_journey():
        """Generate browse only journey - content pages"""
        events = []
        time_offset = 0
        
        # 1. Home
        events.append({
            'event_type': 'pageView',
            'page_type': 'home',
            'page_name': 'home',
            'page_url': 'travel.example.com/',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(3, 8)
        
        # 2-4. Random content pages
        content_pages = [
            ('destinations', 'travel.example.com/destinations'),
            ('offers', 'travel.example.com/offers'),
            ('destinations', 'travel.example.com/destinations/europe'),
            ('destinations', 'travel.example.com/destinations/asia'),
            ('offers', 'travel.example.com/offers/summer-sale')
        ]
        
        num_pages = random.randint(2, 4)
        for page_name, page_url in random.sample(content_pages, min(num_pages, len(content_pages))):
            events.append({
                'event_type': 'pageView',
                'page_type': 'content',
                'page_name': page_name,
                'page_url': page_url,
                'search_term': None,
                'flight_number': None,
                'time_offset': time_offset,
                'metric_event': None
            })
            time_offset += random.randint(5, 15)
        
        return events
    
    @staticmethod
    def generate_web_account_journey():
        """Generate account management journey"""
        events = []
        time_offset = 0
        
        # 1. Home
        events.append({
            'event_type': 'pageView',
            'page_type': 'home',
            'page_name': 'home',
            'page_url': 'travel.example.com/',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(2, 5)
        
        # 2-3. Login
        events.append({
            'event_type': 'pageView',
            'page_type': 'login',
            'page_name': 'login',
            'page_url': 'travel.example.com/login',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        events.append({
            'event_type': 'login',
            'page_type': 'login',
            'page_name': 'login',
            'page_url': 'travel.example.com/login',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': 'login'
        })
        time_offset += random.randint(5, 10)
        
        # 4. My Account
        events.append({
            'event_type': 'pageView',
            'page_type': 'account',
            'page_name': 'my-account',
            'page_url': 'travel.example.com/account',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        
        return events
    
    @staticmethod
    def generate_web_change_journey_complete():
        """Generate complete flight change journey"""
        events = []
        time_offset = 0
        
        # Start with login
        events.extend(SessionJourneyHelper.generate_web_account_journey())
        time_offset = events[-1]['time_offset'] + random.randint(10, 20)
        
        # Flight change options
        events.append({
            'event_type': 'pageView',
            'page_type': 'change',
            'page_name': 'flight-change-options',
            'page_url': 'travel.example.com/manage/change-options',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(5, 10)
        
        # Select upgrade type
        upgrade_types = [
            ('date-change', 'upgrade.date', 'date'),
            ('seat-upgrade', 'upgrade.seat', 'seat'),
            ('luggage-upgrade', 'upgrade.luggage', 'luggage')
        ]
        upgrade = random.choice(upgrade_types)
        
        events.append({
            'event_type': 'pageView',
            'page_type': 'change',
            'page_name': upgrade[0],
            'page_url': f'travel.example.com/manage/{upgrade[0]}',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None,
            'upgrade_type': upgrade[2]
        })
        time_offset += 1
        events.append({
            'event_type': upgrade[1],
            'page_type': 'change',
            'page_name': upgrade[0],
            'page_url': f'travel.example.com/manage/{upgrade[0]}',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': upgrade[1],
            'upgrade_type': upgrade[2]
        })
        time_offset += random.randint(15, 30)
        
        # Change complete
        events.append({
            'event_type': 'pageView',
            'page_type': 'change',
            'page_name': 'change-complete',
            'page_url': 'travel.example.com/manage/complete',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += 1
        events.append({
            'event_type': 'change.complete',
            'page_type': 'change',
            'page_name': 'change-complete',
            'page_url': 'travel.example.com/manage/complete',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': 'change.complete'
        })
        
        return events
    
    @staticmethod
    def generate_web_change_journey_incomplete():
        """Generate incomplete flight change journey - abandon before completing"""
        events = []
        time_offset = 0
        
        # Start with login
        events.extend(SessionJourneyHelper.generate_web_account_journey())
        time_offset = events[-1]['time_offset'] + random.randint(10, 20)
        
        # Flight change options
        events.append({
            'event_type': 'pageView',
            'page_type': 'change',
            'page_name': 'flight-change-options',
            'page_url': 'travel.example.com/manage/change-options',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None
        })
        time_offset += random.randint(5, 10)
        
        # View one upgrade option but don't complete
        upgrade_types = [
            ('date-change', 'upgrade.date', 'date'),
            ('seat-upgrade', 'upgrade.seat', 'seat'),
            ('luggage-upgrade', 'upgrade.luggage', 'luggage')
        ]
        upgrade = random.choice(upgrade_types)
        
        events.append({
            'event_type': 'pageView',
            'page_type': 'change',
            'page_name': upgrade[0],
            'page_url': f'travel.example.com/manage/{upgrade[0]}',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': None,
            'upgrade_type': upgrade[2]
        })
        time_offset += 1
        events.append({
            'event_type': upgrade[1],
            'page_type': 'change',
            'page_name': upgrade[0],
            'page_url': f'travel.example.com/manage/{upgrade[0]}',
            'search_term': None,
            'flight_number': None,
            'time_offset': time_offset,
            'metric_event': upgrade[1],
            'upgrade_type': upgrade[2]
        })
        
        # Abandon (no complete event)
        return events
