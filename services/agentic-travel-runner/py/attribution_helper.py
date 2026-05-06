#!/usr/bin/env python3
"""
Attribution Helper Module
Provides realistic marketing attribution, campaign tracking, and journey data
for CJA analytics use cases
"""

import random
import json
from datetime import datetime, timedelta

class AttributionHelper:
    """Helper class for generating realistic marketing attribution data"""
    
    # Campaign Templates
    CAMPAIGNS = [
        {
            'id': 'CAMP_SUMMER2026_EUROPE',
            'name': 'Summer Sale 2026 - Europe Destinations',
            'type': 'Seasonal',
            'channels': ['Paid Search', 'Display', 'Email'],
            'utm_source': 'google',
            'utm_medium': 'cpc',
            'utm_campaign': 'summer_europe_2026'
        },
        {
            'id': 'CAMP_SPRING_GETAWAY',
            'name': 'Spring Getaway - City Breaks',
            'type': 'Seasonal',
            'channels': ['Social', 'Email', 'Paid Search'],
            'utm_source': 'facebook',
            'utm_medium': 'social',
            'utm_campaign': 'spring_citybreaks'
        },
        {
            'id': 'CAMP_FLASH_SALE_ASIA',
            'name': 'Flash Sale - Asia Pacific',
            'type': 'Promotional',
            'channels': ['Email', 'Push', 'Paid Search'],
            'utm_source': 'email',
            'utm_medium': 'email',
            'utm_campaign': 'flash_asia'
        },
        {
            'id': 'CAMP_BUSINESS_CLASS_UPGRADE',
            'name': 'Business Class Upgrade Offer',
            'type': 'Promotional',
            'channels': ['Email', 'Direct Mail'],
            'utm_source': 'newsletter',
            'utm_medium': 'email',
            'utm_campaign': 'business_upgrade'
        },
        {
            'id': 'CAMP_LOYALTY_BONUS',
            'name': 'Loyalty Members Bonus Points',
            'type': 'Retention',
            'channels': ['Email', 'Mobile App'],
            'utm_source': 'loyalty_app',
            'utm_medium': 'push',
            'utm_campaign': 'bonus_points'
        },
        {
            'id': 'CAMP_WINTER_ESCAPES',
            'name': 'Winter Escapes - Warm Destinations',
            'type': 'Seasonal',
            'channels': ['Paid Social', 'Display', 'Paid Search'],
            'utm_source': 'instagram',
            'utm_medium': 'social',
            'utm_campaign': 'winter_warm'
        },
        {
            'id': 'CAMP_EARLY_BIRD',
            'name': 'Early Bird Booking Discount',
            'type': 'Promotional',
            'channels': ['Email', 'Website', 'Paid Search'],
            'utm_source': 'google',
            'utm_medium': 'cpc',
            'utm_campaign': 'earlybird'
        },
        {
            'id': 'CAMP_NEW_CUSTOMER_WELCOME',
            'name': 'New Customer Welcome Offer',
            'type': 'Acquisition',
            'channels': ['Paid Search', 'Display', 'Social'],
            'utm_source': 'google',
            'utm_medium': 'cpc',
            'utm_campaign': 'new_customer'
        },
        {
            'id': 'CAMP_FAMILY_HOLIDAY',
            'name': 'Family Holiday Packages',
            'type': 'Promotional',
            'channels': ['Social', 'Display', 'Email'],
            'utm_source': 'facebook',
            'utm_medium': 'social',
            'utm_campaign': 'family_packages'
        },
        {
            'id': 'CAMP_LAST_MINUTE',
            'name': 'Last Minute Deals',
            'type': 'Promotional',
            'channels': ['Mobile App', 'Email', 'Paid Search'],
            'utm_source': 'app_notification',
            'utm_medium': 'push',
            'utm_campaign': 'lastminute'
        },
        # MODERN CHANNELS - 2026 Marketing
        {
            'id': 'CAMP_WHATSAPP_CHECKIN',
            'name': 'WhatsApp Check-In Reminder',
            'type': 'Retention',
            'channels': ['WhatsApp'],
            'utm_source': 'whatsapp',
            'utm_medium': 'messaging',
            'utm_campaign': 'checkin_reminder'
        },
        {
            'id': 'CAMP_WHATSAPP_BOOKING_CONFIRM',
            'name': 'WhatsApp Booking Confirmation',
            'type': 'Transactional',
            'channels': ['WhatsApp'],
            'utm_source': 'whatsapp',
            'utm_medium': 'messaging',
            'utm_campaign': 'booking_confirmation'
        },
        {
            'id': 'CAMP_INAPP_FLASH_SALE',
            'name': 'In-App Message - Flash Sale',
            'type': 'Promotional',
            'channels': ['In-App Message'],
            'utm_source': 'in_app',
            'utm_medium': 'banner',
            'utm_campaign': 'flash_sale'
        },
        {
            'id': 'CAMP_INAPP_FEATURE_DISCOVERY',
            'name': 'In-App Feature - Mobile Check-In',
            'type': 'Engagement',
            'channels': ['In-App Message'],
            'utm_source': 'in_app',
            'utm_medium': 'popup',
            'utm_campaign': 'feature_discovery'
        },
        {
            'id': 'CAMP_SMS_FLIGHT_UPDATE',
            'name': 'SMS Flight Status Update',
            'type': 'Transactional',
            'channels': ['SMS'],
            'utm_source': 'sms',
            'utm_medium': 'text',
            'utm_campaign': 'flight_status'
        },
        {
            'id': 'CAMP_SMS_GATE_CHANGE',
            'name': 'SMS Gate Change Alert',
            'type': 'Transactional',
            'channels': ['SMS'],
            'utm_source': 'sms',
            'utm_medium': 'text',
            'utm_campaign': 'gate_alert'
        },
        {
            'id': 'CAMP_TIKTOK_CREATOR',
            'name': 'TikTok Creator Campaign - Summer Destinations',
            'type': 'Acquisition',
            'channels': ['TikTok'],
            'utm_source': 'tiktok',
            'utm_medium': 'influencer',
            'utm_campaign': 'creator_summer'
        },
        {
            'id': 'CAMP_TIKTOK_ADS',
            'name': 'TikTok Ads - Gen Z Travel',
            'type': 'Acquisition',
            'channels': ['TikTok'],
            'utm_source': 'tiktok',
            'utm_medium': 'video',
            'utm_campaign': 'genz_travel'
        },
        {
            'id': 'CAMP_AFFILIATE_TRAVEL_BLOG',
            'name': 'Affiliate - Travel Blogger Network',
            'type': 'Acquisition',
            'channels': ['Affiliate'],
            'utm_source': 'affiliate_network',
            'utm_medium': 'referral',
            'utm_campaign': 'travel_bloggers'
        },
        {
            'id': 'CAMP_CTV_BRAND',
            'name': 'Connected TV - Brand Awareness',
            'type': 'Acquisition',
            'channels': ['Connected TV'],
            'utm_source': 'ctv',
            'utm_medium': 'video',
            'utm_campaign': 'brand_awareness'
        },
        {
            'id': 'CAMP_PODCAST_SPONSOR',
            'name': 'Podcast Sponsorship - Travel Shows',
            'type': 'Acquisition',
            'channels': ['Podcast'],
            'utm_source': 'podcast',
            'utm_medium': 'audio',
            'utm_campaign': 'travel_shows'
        },
        {
            'id': 'CAMP_QR_CODE_AIRPORT',
            'name': 'QR Code - Airport Lounge Promotion',
            'type': 'Promotional',
            'channels': ['QR Code'],
            'utm_source': 'qr_code',
            'utm_medium': 'offline',
            'utm_campaign': 'airport_lounge'
        }
    ]
    
    # Referrer domains and types
    REFERRERS = {
        'search_engines': ['google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com'],
        'social_media': ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'tiktok.com'],
        'travel_sites': ['booking.com', 'expedia.com', 'tripadvisor.com', 'skyscanner.com', 'kayak.com'],
        'news': ['bbc.co.uk', 'theguardian.com', 'telegraph.co.uk', 'independent.co.uk'],
        'email': ['gmail.com', 'outlook.com', 'yahoo.com']
    }
    
    @staticmethod
    def assign_marketing_channel(is_paid=None, has_referrer=True, is_mobile=False):
        """
        Assign realistic marketing channel and attribution data
        
        Returns:
            dict with channel, campaign, UTM parameters, and referrer data
        """
        
        # If paid campaign (30% of traffic)
        if is_paid is None:
            is_paid = random.random() < 0.30
        
        if is_paid:
            # Paid marketing campaigns
            campaign = random.choice(AttributionHelper.CAMPAIGNS)
            channel = random.choice(campaign['channels'])
            
            # Map channel to specific detail
            if channel == 'Paid Search':
                channel_detail = f"{campaign['utm_source'].title()} Ads"
                utm_source = campaign['utm_source']
                utm_medium = 'cpc'
                referrer_domain = f"{utm_source}.com"
                referrer_type = 'Search Engine'
            elif channel == 'Paid Social':
                channel_detail = f"{campaign['utm_source'].title()} Ads"
                utm_source = campaign['utm_source']
                utm_medium = 'social'
                referrer_domain = f"{utm_source}.com"
                referrer_type = 'Social Media'
            elif channel == 'Display':
                utm_source = random.choice(['google_display', 'programmatic', 'adroll'])
                channel_detail = f"{utm_source.replace('_', ' ').title()}"
                utm_medium = 'display'
                referrer_domain = random.choice(['doubleclick.net', 'adnxs.com', 'rubiconproject.com'])
                referrer_type = 'Display Network'
            elif channel == 'Email':
                channel_detail = 'Newsletter'
                utm_source = campaign['utm_source']
                utm_medium = 'email'
                referrer_domain = None  # Email opens don't have HTTP referrer
                referrer_type = 'Email'
            elif channel == 'Mobile App':
                channel_detail = 'App Push Notification'
                utm_source = 'app_notification'
                utm_medium = 'push'
                referrer_domain = None
                referrer_type = 'Mobile App'
            # MODERN CHANNELS
            elif channel == 'WhatsApp':
                channel_detail = campaign['name']
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = None  # Messaging apps don't have HTTP referrer
                referrer_type = 'Messaging'
            elif channel == 'In-App Message':
                channel_detail = campaign['name']
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = None  # In-app messages are internal
                referrer_type = 'In-App'
            elif channel == 'SMS':
                channel_detail = campaign['name']
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = None  # SMS doesn't have HTTP referrer
                referrer_type = 'SMS'
            elif channel == 'TikTok':
                channel_detail = f"TikTok {campaign['utm_medium'].title()}"
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = 'tiktok.com'
                referrer_type = 'Video Platform'
            elif channel == 'Affiliate':
                channel_detail = 'Affiliate Network'
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = random.choice(['awin.com', 'cj.com', 'rakuten.com', 'impact.com'])
                referrer_type = 'Affiliate Network'
            elif channel == 'Connected TV':
                channel_detail = 'CTV Brand Campaign'
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = None  # TV doesn't have HTTP referrer
                referrer_type = 'Connected TV'
            elif channel == 'Podcast':
                channel_detail = campaign['name']
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = random.choice(['spotify.com', 'apple.com/podcasts', 'overcast.fm'])
                referrer_type = 'Podcast Platform'
            elif channel == 'QR Code':
                channel_detail = campaign['name']
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = None  # QR codes are offline-to-online
                referrer_type = 'Offline to Online'
            else:
                channel_detail = channel
                utm_source = campaign['utm_source']
                utm_medium = campaign['utm_medium']
                referrer_domain = f"{utm_source}.com"
                referrer_type = 'Other'
            
            return {
                'marketing_channel': channel,
                'marketing_channel_detail': channel_detail,
                'campaign_id': campaign['id'],
                'campaign_name': campaign['name'],
                'campaign_type': campaign['type'],
                'utm_source': utm_source,
                'utm_medium': utm_medium,
                'utm_campaign': campaign['utm_campaign'],
                'utm_content': random.choice(['banner_a', 'banner_b', 'text_ad', 'carousel', 'video', 'story']),
                'utm_term': random.choice(['flights', 'cheap flights', 'holiday deals', 'business class', 'last minute', None]),
                'referrer_domain': referrer_domain,
                'referrer_type': referrer_type
            }
        
        # Organic traffic (70%)
        else:
            # Choose organic channel
            channel_types = ['Organic Search', 'Organic Social', 'Direct', 'Referral', 'Email']
            weights = [35, 15, 25, 20, 5]  # Organic search is most common
            channel = random.choices(channel_types, weights=weights)[0]
            
            if channel == 'Organic Search':
                search_engine = random.choice(AttributionHelper.REFERRERS['search_engines'])
                return {
                    'marketing_channel': 'Organic Search',
                    'marketing_channel_detail': f"{search_engine.split('.')[0].title()} Organic",
                    'campaign_id': None,
                    'campaign_name': None,
                    'campaign_type': None,
                    'utm_source': None,
                    'utm_medium': None,
                    'utm_campaign': None,
                    'utm_content': None,
                    'utm_term': None,
                    'referrer_domain': search_engine,
                    'referrer_type': 'Search Engine'
                }
            
            elif channel == 'Organic Social':
                social_site = random.choice(AttributionHelper.REFERRERS['social_media'])
                return {
                    'marketing_channel': 'Organic Social',
                    'marketing_channel_detail': f"{social_site.split('.')[0].title()} Organic",
                    'campaign_id': None,
                    'campaign_name': None,
                    'campaign_type': None,
                    'utm_source': None,
                    'utm_medium': None,
                    'utm_campaign': None,
                    'utm_content': None,
                    'utm_term': None,
                    'referrer_domain': social_site,
                    'referrer_type': 'Social Media'
                }
            
            elif channel == 'Direct':
                return {
                    'marketing_channel': 'Direct',
                    'marketing_channel_detail': 'Direct Type-in / Bookmark',
                    'campaign_id': None,
                    'campaign_name': None,
                    'campaign_type': None,
                    'utm_source': None,
                    'utm_medium': None,
                    'utm_campaign': None,
                    'utm_content': None,
                    'utm_term': None,
                    'referrer_domain': None,
                    'referrer_type': 'Direct'
                }
            
            elif channel == 'Referral':
                referrer_type = random.choice(['travel_sites', 'news'])
                referrer = random.choice(AttributionHelper.REFERRERS[referrer_type])
                return {
                    'marketing_channel': 'Referral',
                    'marketing_channel_detail': f"{referrer.split('.')[0].title()} Referral",
                    'campaign_id': None,
                    'campaign_name': None,
                    'campaign_type': None,
                    'utm_source': None,
                    'utm_medium': None,
                    'utm_campaign': None,
                    'utm_content': None,
                    'utm_term': None,
                    'referrer_domain': referrer,
                    'referrer_type': 'Travel Site' if referrer_type == 'travel_sites' else 'News Site'
                }
            
            else:  # Email (organic)
                return {
                    'marketing_channel': 'Email',
                    'marketing_channel_detail': 'Newsletter',
                    'campaign_id': None,
                    'campaign_name': None,
                    'campaign_type': None,
                    'utm_source': 'newsletter',
                    'utm_medium': 'email',
                    'utm_campaign': None,
                    'utm_content': None,
                    'utm_term': None,
                    'referrer_domain': None,
                    'referrer_type': 'Email'
                }
    
    @staticmethod
    def generate_customer_journey(customer_segment='bronze', is_first_time_customer=True):
        """
        Generate realistic customer journey with touchpoints, channels, and conversion path
        Creates realistic patterns where:
        - First Touch: Dominated by awareness channels (Organic Search, Display, Social)
        - Last Touch: Dominated by conversion channels (Direct, Email, Paid Search)
        
        Args:
            customer_segment: Customer tier (bronze, silver, gold, platinum, diamond)
            is_first_time_customer: Whether this is their first booking
            
        Returns:
            dict with journey data: touchpoints, days to convert, channel path, etc.
        """
        
        # First-time customers have longer journeys (more research)
        if is_first_time_customer:
            # New customers take longer to convert
            touchpoint_count = random.choices([2, 3, 4, 5, 6, 7, 8], weights=[10, 15, 20, 25, 15, 10, 5])[0]
            days_to_convert = int(random.expovariate(1/14))  # Average 14 days
            days_to_convert = max(0, min(days_to_convert, 60))  # Cap at 60 days
        else:
            # Returning customers convert faster
            touchpoint_count = random.choices([1, 2, 3, 4, 5], weights=[20, 30, 25, 15, 10])[0]
            days_to_convert = int(random.expovariate(1/7))  # Average 7 days
            days_to_convert = max(0, min(days_to_convert, 30))  # Cap at 30 days
        
        # Premium customers have slightly longer consideration (higher spend = more research)
        if customer_segment in ['platinum', 'diamond']:
            touchpoint_count = min(touchpoint_count + 1, 8)
            days_to_convert = int(days_to_convert * 1.3)
        
        # Build the journey path
        journey_channels = []
        
        # FIRST TOUCHPOINT - AWARENESS CHANNELS (Research/Discovery phase)
        # These channels dominate first-touch attribution
        first_touchpoint_channels = ['Organic Search', 'Organic Search', 'Organic Search',  # 42% - People start by searching
                                     'Display', 'Display',  # 18% - Display ads build awareness
                                     'Organic Social', 'Organic Social',  # 18% - Social discovery
                                     'TikTok',  # 8% - TikTok discovery (especially Gen Z)
                                     'Paid Social',  # 8% - Paid social
                                     'Podcast',  # 3% - Podcast sponsorships
                                     'Referral']  # 3% - Travel sites/affiliates
        first_channel = random.choice(first_touchpoint_channels)
        journey_channels.append(first_channel)
        
        # MIDDLE TOUCHPOINTS - CONSIDERATION/RESEARCH PHASE
        # Mix of channels as customers research and compare - NOW INCLUDING MODERN CHANNELS
        middle_touchpoint_channels = ['Organic Search', 'Paid Search', 'Email', 'Social', 'Referral', 'Display',
                                      'In-App Message', 'WhatsApp', 'SMS', 'TikTok', 'Affiliate']
        for _ in range(touchpoint_count - 2):
            middle_channel = random.choice(middle_touchpoint_channels)
            journey_channels.append(middle_channel)
        
        # LAST TOUCHPOINT - CONVERSION CHANNELS (Decision/Purchase phase)
        # These channels dominate last-touch attribution - INCLUDING MODERN CONVERSION CHANNELS
        last_touchpoint_channels = ['Direct', 'Direct', 'Direct', 'Direct',  # 36% - Direct conversion (bookmark, type-in)
                                    'Email', 'Email', 'Email',  # 27% - Email drives conversion
                                    'Paid Search', 'Paid Search',  # 18% - Paid search drives bottom-funnel
                                    'WhatsApp', 'WhatsApp',  # 9% - WhatsApp booking confirmations/reminders
                                    'In-App Message',  # 5% - In-app prompts
                                    'Organic Search']  # 5% - Organic search
        last_channel = random.choice(last_touchpoint_channels)
        journey_channels.append(last_channel)
        
        # Extract first and last
        first_touch_channel = journey_channels[0]
        last_touch_channel = journey_channels[-1]
        
        # Assist channels (everything between first and last)
        assist_channels = journey_channels[1:-1] if len(journey_channels) > 2 else []
        
        # Build channel path string
        channel_path = ' → '.join(journey_channels)
        
        # Calculate first touch timestamp
        first_touch_timestamp = datetime.utcnow() - timedelta(days=days_to_convert)
        
        # Previous booking count (0 if first time customer)
        previous_booking_count = 0 if is_first_time_customer else random.choices(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20],
            weights=[20, 18, 15, 12, 10, 8, 6, 4, 3, 2, 1, 1]
        )[0]
        
        return {
            'touchpoints_before_conversion': touchpoint_count,
            'days_to_conversion': days_to_convert,
            'first_touch_channel': first_touch_channel,
            'first_touch_timestamp': first_touch_timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
            'last_touch_channel': last_touch_channel,
            'assist_channels': json.dumps(assist_channels) if assist_channels else json.dumps([]),  # JSON string for Snowflake VARIANT
            'channel_path': channel_path,
            'is_first_time_customer': is_first_time_customer,
            'previous_booking_count': previous_booking_count
        }
    
    @staticmethod
    def generate_product_finding_method(customer_segment='bronze', cabin_class='economy'):
        """
        Generate how customer found the product (for merchandising attribution)
        
        Returns:
            dict with product finding method, search term, category, etc.
        """
        
        # Finding methods distribution
        finding_methods = ['Internal Search', 'Browse Category', 'Email Link', 'Cross-Sell', 
                          'Recommended For You', 'Recently Viewed', 'Popular Destinations', 'Deals Page']
        
        # Internal search is most common
        weights = [40, 20, 15, 10, 5, 5, 3, 2]
        finding_method = random.choices(finding_methods, weights=weights)[0]
        
        # Destinations for search terms
        destinations = ['Paris', 'Dubai', 'New York', 'Tokyo', 'Singapore', 'Barcelona', 'Rome', 'Amsterdam']
        destination = random.choice(destinations)
        
        # Search term varies by finding method and cabin class
        if finding_method == 'Internal Search':
            if cabin_class in ['business', 'first']:
                search_term_templates = ['business class {dest}', 'first class {dest}', 'premium flights {dest}', '{dest} business']
            else:
                search_term_templates = ['cheap flights {dest}', 'flights to {dest}', '{dest} holiday', '{dest} flights']
            
            search_term = random.choice(search_term_templates).format(dest=destination.lower())
            product_list = 'Search Results'
            position = random.randint(1, 15)
        
        elif finding_method == 'Browse Category':
            categories = ['Short Haul Europe', 'Long Haul Asia', 'Business Travel', 'Beach Holidays', 'City Breaks']
            product_list = random.choice(categories)
            search_term = None
            position = random.randint(1, 20)
        
        elif finding_method == 'Email Link':
            search_term = None
            product_list = 'Email Campaign - Destination Offers'
            position = random.randint(1, 5)
        
        elif finding_method == 'Cross-Sell':
            search_term = None
            product_list = 'Cross-Sell - Hotel Recommendations'
            position = random.randint(1, 3)
        
        elif finding_method == 'Recommended For You':
            search_term = None
            product_list = 'Personalized Recommendations'
            position = random.randint(1, 10)
            recommendation_algorithm = random.choice(['Collaborative Filtering', 'Similar to Past Bookings', 'Popular in Your City'])
        
        else:
            search_term = None
            product_list = finding_method
            position = random.randint(1, 10)
        
        # Product category
        if cabin_class in ['business', 'first']:
            category = 'Premium Travel'
        elif destination in ['Dubai', 'Tokyo', 'Singapore', 'New York']:
            category = 'Long Haul International'
        else:
            category = 'Short Haul Europe'
        
        result = {
            'product_finding_method': finding_method,
            'product_search_term': search_term,
            'product_category': category,
            'product_list_name': product_list,
            'product_position': position,
            'cross_sell_source': f'Hotel Booking - {destination}' if finding_method == 'Cross-Sell' else None,
            'recommendation_algorithm': recommendation_algorithm if finding_method == 'Recommended For You' else None
        }
        
        return result
    
    @staticmethod
    def get_conversion_event_type(channel_type='website'):
        """
        Get standardized conversion event types for different channels
        These are CLEAR purchase/conversion events for revenue attribution
        
        Args:
            channel_type: 'website', 'mobile', or 'pos'
            
        Returns:
            str: Event type for conversion
        """
        conversion_events = {
            'website': 'purchase.completed',  # Clear web purchase event
            'mobile': 'mobile.purchase.completed',  # Clear mobile purchase event
            'pos': 'pos.sale.completed'  # Clear POS sale event
        }
        return conversion_events.get(channel_type, 'purchase.completed')
    
    @staticmethod
    def get_checkout_start_event_type(channel_type='website'):
        """
        Get checkout initiation event types for funnel analysis
        
        Args:
            channel_type: 'website', 'mobile', or 'pos'
            
        Returns:
            str: Event type for checkout start
        """
        checkout_events = {
            'website': 'checkout.started',
            'mobile': 'mobile.checkout.started',
            'pos': 'pos.transaction.started'
        }
        return checkout_events.get(channel_type, 'checkout.started')
