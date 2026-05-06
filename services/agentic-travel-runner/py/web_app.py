#!/usr/bin/env python3
"""
Flask Web App for Agentic Travel Data Generator
Dual-panel UI: Profile enrichment + New profile generation
"""

from flask import Flask, render_template, jsonify, request
from data_generator import TravelDataGenerator
from data_generator_phase2 import Phase2DataGenerator
from data_generator_phase3 import Phase3DataGenerator
import threading
import time
import random
import snowflake.connector
from snowflake_settings import get_snowflake_connection_kwargs

app = Flask(__name__)

# Store generation status
generation_status = {
    'running': False,
    'progress': 0,
    'message': 'Ready',
    'last_result': None
}

# Store enrichment status
enrichment_status = {
    'running': False,
    'progress': 0,
    'message': 'Ready',
    'last_result': None
}

PHASE_TABLES = {
    'phase1': [
        'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE',
        'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
        'AGENTIC_TRAVEL_EVENT_WEBSITE',
        'AGENTIC_TRAVEL_EVENT_BOOKING',
    ],
    'phase2': [
        'AGENTIC_TRAVEL_PROFILE_LOYALTY',
        'AGENTIC_TRAVEL_PROFILE_PREFERENCES',
        'AGENTIC_TRAVEL_EVENT_MOBILE',
        'AGENTIC_TRAVEL_EVENT_CALLCENTRE',
        'AGENTIC_TRAVEL_EVENT_CHECKIN',
    ],
    'phase3': [
        'AGENTIC_TRAVEL_EVENT_DISRUPTION',
        'AGENTIC_TRAVEL_EVENT_INFLIGHT',
        'AGENTIC_TRAVEL_EVENT_HOTEL',
        'AGENTIC_TRAVEL_EVENT_LOYALTY',
        'AGENTIC_TRAVEL_EVENT_POS',
    ],
}

def generate_data_background(count):
    """Background task to generate data for ALL tables (Phase 1 + Phase 2 + Phase 3)"""
    global generation_status
    
    try:
        generation_status['running'] = True
        generation_status['progress'] = 5
        generation_status['message'] = f'Generating {count} profiles and events...'
        
        # Phase 1: Generate base profiles and events
        generator = TravelDataGenerator()
        
        generation_status['progress'] = 10
        generation_status['message'] = 'Phase 1: Connecting to Snowflake...'
        
        # Don't auto-close connection - we need it for Phase 2 & 3
        result = generator.generate_and_insert(count, verbose=False, auto_close=False)
        
        if not result['success']:
            generation_status['message'] = f'❌ Phase 1 Error: {result.get("error", "Unknown error")}'
            generation_status['last_result'] = result
            generator.close()  # Close on error
            return
        
        generation_status['progress'] = 35
        generation_status['message'] = 'Phase 1 complete! Starting Phase 2...'
        
        # Phase 2: Generate loyalty, preferences, and additional events
        # Pass journey flags to Phase 2 generator
        journey_flags = result.get('journey_flags', {})
        phase2_gen = Phase2DataGenerator(generator.conn, generator.cursor, journey_flags=journey_flags)
        
        # Fetch loyalty IDs from Snowflake for the profiles just created
        crm_list = "', '".join(result['crm_ids'])
        generator.cursor.execute(f"""
            SELECT CRMID, LOYALTYID
            FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER
            WHERE CRMID IN ('{crm_list}')
            ORDER BY CRMID
        """)
        loyalty_map = {row[0]: row[1] for row in generator.cursor.fetchall()}
        
        # Get the base profiles that were just created to link Phase 2 data
        base_profiles = [
            {
                'crmId': result['crm_ids'][i],  # Use actual CRM ID from Phase 1
                'ecid': result['ecids'][i],  # Use actual ECID from Phase 1
                'email': result['emails'][i],
                'phoneNumber': '+447425627462',
                'loyaltyId': loyalty_map.get(result['crm_ids'][i])  # Include loyalty ID from Snowflake
            }
            for i in range(count)
        ]
        
        generation_status['progress'] = 50
        generation_status['message'] = 'Phase 2: Generating loyalty & preferences...'
        
        phase2_result = phase2_gen.generate_and_insert_all(base_profiles, result['start_index'])
        
        generation_status['progress'] = 65
        generation_status['message'] = 'Phase 2 complete! Starting Phase 3...'
        
        # Phase 3: Generate in-journey events (disruption, in-flight, hotel, loyalty transactions, POS)
        # Pass journey flags to Phase 3 generator
        phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags=journey_flags)
        
        generation_status['progress'] = 70
        generation_status['message'] = 'Phase 3: Generating in-journey events...'
        
        phase3_result = phase3_gen.generate_and_insert_all(base_profiles)
        
        generation_status['progress'] = 90
        generation_status['message'] = 'Finalizing and generating SQL...'
        
        # Generate verification SQL queries for ALL tables
        sql_queries_phase1 = TravelDataGenerator.generate_verification_sql(
            crm_ids=result.get('crm_ids'),
            emails=result.get('emails')
        )
        sql_queries_phase2 = Phase2DataGenerator.generate_phase2_verification_sql()
        sql_queries_phase3 = Phase3DataGenerator.generate_phase3_verification_sql()

        # Avoid key collision between Phase 2 loyalty profile query and
        # Phase 3 loyalty transaction query (both originally "latest_loyalty").
        if 'latest_loyalty' in sql_queries_phase2:
            sql_queries_phase2['latest_loyalty_profiles'] = sql_queries_phase2.pop('latest_loyalty')
        if 'latest_loyalty' in sql_queries_phase3:
            sql_queries_phase3['latest_loyalty_transactions'] = sql_queries_phase3.pop('latest_loyalty')
        
        # Merge results
        result['phase2'] = phase2_result
        result['phase3'] = phase3_result
        result['sql_queries'] = {**sql_queries_phase1, **sql_queries_phase2, **sql_queries_phase3}
        
        # Commit the transaction
        generator.conn.commit()
        
        generation_status['progress'] = 100
        total_phase2 = phase2_result["loyalty"] + phase2_result["preferences"] + phase2_result["mobile_events"] + phase2_result["call_events"] + phase2_result["checkin_events"]
        total_phase3 = phase3_result["disruption_events"] + phase3_result["inflight_events"] + phase3_result["hotel_events"] + phase3_result["loyalty_transactions"] + phase3_result["pos_events"]
        generation_status['message'] = f'✅ Success! Created {result["base_profiles"]} base + {result["profiles"]} full profiles + {total_phase2} Phase 2 + {total_phase3} Phase 3 records'
        generation_status['last_result'] = result
        
        # Close connection after all inserts
        generator.close()
            
    except Exception as e:
        generation_status['message'] = f'❌ Error: {str(e)}'
        generation_status['last_result'] = {'success': False, 'error': str(e)}
        # Close connection on error
        if 'generator' in locals() and hasattr(generator, 'conn') and generator.conn:
            generator.close()
    
    finally:
        generation_status['running'] = False

@app.route('/')
def index():
    """Main page - now using enhanced dual-panel interface"""
    response = app.make_response(render_template('index_enhanced.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def get_snowflake_connection():
    """Create Snowflake connection for queries (see snowflake_settings.py)."""
    return snowflake.connector.connect(**get_snowflake_connection_kwargs())


def format_table_structure(cursor, table_name):
    """Return a readable table structure report for one Snowflake table."""
    lines = []
    upper_table = table_name.upper()
    fq_table = f"TRAVEL_DATABASE.AEP_SCHEMA.{upper_table}"

    lines.append(f"-- Table: {fq_table}")
    lines.append("-- Columns:")

    cursor.execute(
        """
        SELECT
            COLUMN_NAME,
            DATA_TYPE,
            IS_NULLABLE,
            COLUMN_DEFAULT
        FROM TRAVEL_DATABASE.INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'AEP_SCHEMA'
          AND TABLE_NAME = %s
        ORDER BY ORDINAL_POSITION
        """,
        (upper_table,),
    )
    columns = cursor.fetchall()
    if columns:
        for col_name, data_type, is_nullable, default_val in columns:
            nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
            default_text = f" DEFAULT {default_val}" if default_val is not None else ""
            lines.append(f"  - {col_name} {data_type} {nullable}{default_text}")
    else:
        lines.append("  - (No column metadata found)")

    cursor.execute(f"SHOW PRIMARY KEYS IN TABLE {fq_table}")
    pk_rows = cursor.fetchall()
    if pk_rows:
        # Snowflake SHOW PRIMARY KEYS: column_name is index 4
        pk_cols = ", ".join([row[4] for row in pk_rows if len(row) > 4 and row[4]])
        lines.append(f"-- Primary Key: {pk_cols}")
    else:
        lines.append("-- Primary Key: (none defined)")

    try:
        cursor.execute(f"SHOW IMPORTED KEYS IN TABLE {fq_table}")
        fk_rows = cursor.fetchall()
    except Exception:
        fk_rows = []

    if fk_rows:
        lines.append("-- Foreign Keys:")
        # Snowflake SHOW IMPORTED KEYS:
        # pk_table_name index 2, pk_column_name index 3, fk_column_name index 7
        for row in fk_rows:
            fk_col = row[7] if len(row) > 7 else "UNKNOWN"
            ref_table = row[2] if len(row) > 2 else "UNKNOWN"
            ref_col = row[3] if len(row) > 3 else "UNKNOWN"
            lines.append(f"  - {fk_col} -> {ref_table}.{ref_col}")
    else:
        lines.append("-- Foreign Keys: (none defined)")

    lines.append("")
    return "\n".join(lines)

@app.route('/api/query-profiles', methods=['POST'])
def query_profiles():
    """Query existing profiles from Snowflake with time filtering"""
    try:
        data = request.json
        filter_type = data.get('filter_type', 'all')
        time_period = data.get('time_period', 'all_time')
        limit = data.get('limit', 50)
        
        conn = get_snowflake_connection()
        cursor = conn.cursor()
        
        # Build time filter based on period
        time_filter = ""
        if time_period == 'today':
            time_filter = "AND DATE(_RECORDCREATEDTIMESTAMP) = CURRENT_DATE()"
        elif time_period == 'yesterday':
            time_filter = "AND DATE(_RECORDCREATEDTIMESTAMP) = DATEADD(day, -1, CURRENT_DATE())"
        elif time_period == 'last_7_days':
            time_filter = "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -7, CURRENT_TIMESTAMP())"
        elif time_period == 'this_week':
            time_filter = "AND DATE_TRUNC('week', _RECORDCREATEDTIMESTAMP) = DATE_TRUNC('week', CURRENT_DATE())"
        elif time_period == 'last_week':
            time_filter = "AND DATE_TRUNC('week', _RECORDCREATEDTIMESTAMP) = DATEADD(week, -1, DATE_TRUNC('week', CURRENT_DATE()))"
        elif time_period == 'last_30_days':
            time_filter = "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -30, CURRENT_TIMESTAMP())"
        elif time_period == 'this_month':
            time_filter = "AND DATE_TRUNC('month', _RECORDCREATEDTIMESTAMP) = DATE_TRUNC('month', CURRENT_DATE())"
        elif time_period == 'last_month':
            time_filter = "AND DATE_TRUNC('month', _RECORDCREATEDTIMESTAMP) = DATEADD(month, -1, DATE_TRUNC('month', CURRENT_DATE()))"
        elif time_period == 'last_90_days':
            time_filter = "AND _RECORDCREATEDTIMESTAMP >= DATEADD(day, -90, CURRENT_TIMESTAMP())"
        # else: all_time - no filter
        
        # Build query based on filter type
        if filter_type == 'loyalty':
            query = f"""
            SELECT CRMID, EMAIL, ECID, LOYALTYID, PHONENUMBER, _RECORDCREATEDTIMESTAMP
            FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER
            WHERE LOYALTYID IS NOT NULL
            {time_filter}
            ORDER BY _RECORDCREATEDTIMESTAMP DESC
            LIMIT {limit}
            """
        elif filter_type == 'non_loyalty':
            query = f"""
            SELECT CRMID, EMAIL, ECID, LOYALTYID, PHONENUMBER, _RECORDCREATEDTIMESTAMP
            FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER
            WHERE LOYALTYID IS NULL
            {time_filter}
            ORDER BY _RECORDCREATEDTIMESTAMP DESC
            LIMIT {limit}
            """
        else:
            query = f"""
            SELECT CRMID, EMAIL, ECID, LOYALTYID, PHONENUMBER, _RECORDCREATEDTIMESTAMP
            FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER
            WHERE 1=1
            {time_filter}
            ORDER BY _RECORDCREATEDTIMESTAMP DESC
            LIMIT {limit}
            """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        profiles = []
        for row in results:
            profiles.append({
                'crmId': row[0],
                'email': row[1],
                'ecid': row[2],
                'loyaltyId': row[3],
                'phoneNumber': row[4],
                'createdAt': str(row[5]) if len(row) > 5 else None
            })
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'success': True,
            'profiles': profiles,
            'count': len(profiles),
            'time_period': time_period
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/table-structure', methods=['POST'])
def table_structure():
    """Return table structure details (columns, PK, FK) for a phase."""
    conn = None
    cursor = None
    try:
        data = request.json or {}
        phase = (data.get('phase') or '').strip().lower()

        if phase not in PHASE_TABLES:
            return jsonify({
                'success': False,
                'error': f"Invalid phase '{phase}'. Expected one of: {', '.join(PHASE_TABLES.keys())}"
            }), 400

        conn = get_snowflake_connection()
        cursor = conn.cursor()

        blocks = []
        for table_name in PHASE_TABLES[phase]:
            blocks.append(format_table_structure(cursor, table_name))

        return jsonify({
            'success': True,
            'phase': phase,
            'table_count': len(PHASE_TABLES[phase]),
            'structure_text': "\n".join(blocks)
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@app.route('/api/enrich-profiles', methods=['POST'])
def enrich_profiles():
    """Start enrichment process in background"""
    if enrichment_status['running']:
        return jsonify({
            'success': False,
            'error': 'Enrichment already in progress'
        }), 400
    
    try:
        data = request.json
        profiles = data.get('profiles', [])
        event_types = data.get('event_types', [])
        
        if not profiles:
            return jsonify({
                'success': False,
                'error': 'No profiles provided'
            }), 400
        
        if not event_types:
            return jsonify({
                'success': False,
                'error': 'No event types selected'
            }), 400
        
        # Reset status
        enrichment_status['progress'] = 0
        enrichment_status['message'] = 'Starting enrichment...'
        enrichment_status['last_result'] = None
        
        # Start background thread
        thread = threading.Thread(target=enrich_profiles_background, args=(profiles, event_types))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Enrichment started'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/enrichment-status')
def enrichment_status_api():
    """API endpoint to check enrichment status"""
    return jsonify(enrichment_status)

def enrich_profiles_background(profiles, event_types):
    """Background task to enrich existing profiles with new events"""
    global enrichment_status
    
    generator = None
    
    try:
        enrichment_status['running'] = True
        enrichment_status['progress'] = 5
        enrichment_status['message'] = f'Enriching {len(profiles)} profiles...'
        
        # Connect to Snowflake - use same connection method as data generator
        generator = TravelDataGenerator()
        generator.connect()
        
        if not generator.conn:
            raise Exception("Failed to connect to Snowflake")
        
        enrichment_status['progress'] = 10
        enrichment_status['message'] = 'Connected to Snowflake...'
        
        # Initialize result counters
        result = {
            'success': True,
            'profiles_enriched': len(profiles),
            'website_events': 0,
            'mobile_events': 0,
            'booking_events': 0,
            'checkin_events': 0,
            'call_events': 0,
            'disruption_events': 0
        }
        
        # Format profiles for generator methods
        base_profiles = []
        for profile in profiles:
            base_profiles.append({
                'crmId': profile['crmId'],
                'ecid': profile['ecid'],
                'email': profile['email'],
                'phoneNumber': profile.get('phoneNumber', '+447425627462'),
                'loyaltyId': profile.get('loyaltyId')
            })
        
        progress_per_type = 80 / len(event_types) if event_types else 80
        current_progress = 10
        
        # Generate Mobile Events
        if 'mobile' in event_types:
            enrichment_status['message'] = f'Adding mobile events to {len(profiles)} profiles...'
            try:
                # Realistic mobile usage: only ~50% of customers use mobile app
                # Of those who do, they generate a full session (8-10 events)
                mobile_users = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * 0.5)))
                
                phase2_gen = Phase2DataGenerator(generator.conn, generator.cursor)
                
                # Set journey flags to indicate these users have mobile app
                temp_flags = {p['crmId']: {'uses_mobile': True} for p in mobile_users}
                phase2_gen.set_journey_flags(temp_flags)
                
                phase2_gen.generate_mobile_events(mobile_users, events_per_profile=1)
                # Each mobile user gets ~8-10 events per session, 50% of profiles
                result['mobile_events'] = len(mobile_users) * 9  # Approximate count
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding mobile events: {e}")
                import traceback
                traceback.print_exc()
                result['mobile_events'] = 0
        
        # Generate Website Events (use session journey helper)
        if 'website' in event_types:
            enrichment_status['message'] = f'Adding website events to {len(profiles)} profiles...'
            try:
                import uuid
                from datetime import datetime, timedelta
                
                # Use actual insert time for _recordCreatedTimestamp so AEP incremental load picks up new rows
                insert_ts_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                
                # Realistic website traffic: varied events per profile
                # 60% get 1 event (quick look), 30% get 2-3 (browsing), 10% get 4-6 (research)
                website_events = []
                
                search_terms = [
                    "cheap flights to paris", "barcelona weekend break", "new york city hotels", 
                    "dubai luxury hotels", "flights to tokyo", "rome vacation packages"
                ]
                origins = ["LHR", "LGW", "MAN", "EDI"]
                destinations = ["CDG", "JFK", "DXB", "BCN", "AMS", "FCO", "MAD"]
                devices = ["desktop", "mobile", "tablet"]
                browsers = ["Chrome", "Safari", "Firefox", "Edge"]
                page_types = ["home", "search", "results", "details", "deals"]
                
                for profile in base_profiles:
                    # Realistic distribution: most users browse 1-2 pages, some research heavily
                    rand = random.random()
                    if rand < 0.60:  # 60% are quick browsers
                        events_per_profile = 1
                    elif rand < 0.90:  # 30% browse a bit
                        events_per_profile = random.randint(2, 3)
                    else:  # 10% are heavy researchers
                        events_per_profile = random.randint(4, 6)
                    
                    session_id = str(uuid.uuid4())
                    
                    for event_num in range(events_per_profile):
                        # Vary event types
                        if event_num == 0:
                            event_type = "web.searchResults"
                            page_name = "Search Results"
                            page_type_val = "search"
                            action = "search"
                        elif event_num == 1:
                            event_type = "web.flightView"
                            page_name = "Flight Details"
                            page_type_val = "product_details"
                            action = "view"
                        else:
                            event_type = "web.pageView"
                            page_name = random.choice(["Home", "Deals", "Destinations", "Account"])
                            page_type_val = random.choice(["home", "search", "results", "account"])
                            action = random.choice(["view", "click", "scroll"])
                        
                        # Generate realistic timestamp in past 1-14 days
                        event_ts = generator.generate_realistic_timestamp(
                            days_ago=random.randint(1, 14),
                            hour_range=(7, 23)
                        )
                        event_ts_str = event_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                        
                        origin_airport = random.choice(origins)
                        dest_airport = random.choice(destinations)
                        device = random.choice(devices)
                        browser_name = random.choice(browsers)
                        os_name = random.choice(["Windows 10", "macOS", "iOS", "Android"])
                        
                        # Match actual schema: 59 columns total
                        website_event = (
                            profile['crmId'],  # crmId
                            profile['ecid'],  # ecid
                            profile['email'],  # email
                            f"sha256_{profile['crmId']}",  # emailIdSha256
                            f"GAID_{profile['crmId']}",  # gaid
                            profile.get('loyaltyId'),  # loyaltyId
                            None,  # passportId
                            profile.get('phoneNumber'),  # phoneNumber
                            None,  # pushTokens
                            None,  # stackchatId
                            f"WEB_{profile['crmId']}_{event_ts_str}_{event_num}",  # _id
                            event_ts_str,  # timestamp
                            event_type,  # eventType
                            f"https://travel.example.com/{page_type_val}",  # pageURL
                            page_name,  # pageName
                            page_type_val,  # pageType
                            "https://www.google.com" if event_num == 0 else f"https://travel.example.com/home",  # referrer
                            random.choice(search_terms),  # searchTerm
                            origin_airport,  # originAirport
                            dest_airport,  # destinationAirport
                            None,  # departureDate
                            None,  # returnDate
                            random.randint(1, 3),  # passengerCount
                            random.choice(["economy", "premium_economy", "business"]),  # cabinClass
                            random.randint(5, 30),  # resultsCount
                            None,  # flightNumber
                            origin_airport,  # flightOrigin
                            dest_airport,  # flightDestination
                            None,  # flightDepartureTime
                            round(random.uniform(199, 999), 2),  # flightPrice
                            "GBP",  # flightCurrency
                            action,  # action
                            None,  # elementClicked
                            random.randint(10, 180),  # timeOnPage
                            session_id,  # sessionID
                            device,  # deviceType
                            browser_name,  # browser
                            os_name,  # operatingSystem
                            insert_ts_str,  # _recordCreatedTimestamp = insert time for AEP incremental load
                            "direct",  # MARKETING_CHANNEL
                            "organic",  # MARKETING_CHANNEL_DETAIL
                            None,  # CAMPAIGN_ID
                            None,  # CAMPAIGN_NAME
                            None,  # CAMPAIGN_TYPE
                            None,  # UTM_SOURCE
                            "organic",  # UTM_MEDIUM
                            None,  # UTM_CAMPAIGN
                            None,  # UTM_CONTENT
                            None,  # UTM_TERM
                            "google.com" if event_num == 0 else "internal",  # REFERRER_DOMAIN
                            "search" if event_num == 0 else "internal",  # REFERRER_TYPE
                            "website_browsing",  # FUNNEL_NAME
                            page_name,  # FUNNEL_STEP
                            event_num + 1,  # FUNNEL_STEP_NUMBER
                            "in_progress",  # FUNNEL_COMPLETION_STATUS
                            None,  # ANCILLARY_ITEM_NAME
                            None,  # ANCILLARY_ITEM_PRICE
                            None,  # ANCILLARY_ITEM_CATEGORY
                            "website"  # CHANNEL
                        )
                        website_events.append(website_event)
                
                # Insert website events
                if website_events:
                    insert_query = """
                        INSERT INTO AGENTIC_TRAVEL_EVENT_WEBSITE (
                            crmId, ecid, email, emailIdSha256, gaid, loyaltyId, passportId, phoneNumber, pushTokens, stackchatId,
                            _id, timestamp, eventType,
                            pageURL, pageName, pageType, referrer,
                            searchTerm, originAirport, destinationAirport, departureDate, returnDate, passengerCount, cabinClass, resultsCount,
                            flightNumber, flightOrigin, flightDestination, flightDepartureTime, flightPrice, flightCurrency,
                            action, elementClicked, timeOnPage,
                            sessionID, deviceType, browser, operatingSystem,
                            _recordCreatedTimestamp,
                            MARKETING_CHANNEL, MARKETING_CHANNEL_DETAIL, CAMPAIGN_ID, CAMPAIGN_NAME, CAMPAIGN_TYPE,
                            UTM_SOURCE, UTM_MEDIUM, UTM_CAMPAIGN, UTM_CONTENT, UTM_TERM, REFERRER_DOMAIN, REFERRER_TYPE,
                            FUNNEL_NAME, FUNNEL_STEP, FUNNEL_STEP_NUMBER, FUNNEL_COMPLETION_STATUS,
                            ANCILLARY_ITEM_NAME, ANCILLARY_ITEM_PRICE, ANCILLARY_ITEM_CATEGORY,
                            CHANNEL
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    generator.cursor.executemany(insert_query, website_events)
                    generator.conn.commit()
                    result['website_events'] = len(website_events)
                    print(f"Inserted {len(website_events)} website events successfully")
                else:
                    result['website_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding website events: {e}")
                import traceback
                traceback.print_exc()
                result['website_events'] = 0
        
        # Generate Booking Events
        if 'booking' in event_types:
            enrichment_status['message'] = f'Adding booking events to {len(profiles)} profiles...'
            try:
                # Realistic booking rate: only ~40-50% of browsers actually book
                booking_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.4, 0.5))))
                
                if booking_profiles and len(booking_profiles) > 0:
                    # Fetch full profile data WITH ALL COLUMNS in correct order (uppercase for Snowflake)
                    crm_list = "', '".join([p['crmId'] for p in booking_profiles])
                    query = f"""
                        SELECT 
                            CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
                            FIRSTNAME, LASTNAME, DATEOFBIRTH, GENDER, NATIONALITY,
                            PRIMARYEMAIL, PRIMARYPHONE, ADDRESSSTREET, ADDRESSCITY, ADDRESSPOSTALCODE, ADDRESSCOUNTRY,
                            LASTHOLIDAYDATE, LASTHOLIDAYDESTINATION, UPCOMINGHOLIDAYDATE, UPCOMINGHOLIDAYDESTINATION,
                            TOTALFLIGHTSTAKEN, TOTALDISTANCEFLOWN, FAVORITEDESTINATIONS,
                            PREFERREDCABINCLASS, PREFERREDSEATTYPE, MEALPREFERENCE, SPECIALASSISTANCE,
                            LIFETIMEVALUE, AVERAGEBOOKINGVALUE, TOTALBOOKINGS, CUSTOMERSEGMENT,
                            TESTPROFILE,
                            _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP
                        FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER
                        WHERE CRMID IN ('{crm_list}')
                        ORDER BY CRMID
                    """
                    print(f"Fetching {len(booking_profiles)} profiles (40-50% of total) for booking generation...")
                    generator.cursor.execute(query)
                    full_profiles = generator.cursor.fetchall()
                    
                    print(f"Found {len(full_profiles)} full profiles for booking generation")
                    
                    if full_profiles and len(full_profiles) > 0:
                        # Generate bookings using existing method
                        bookings = generator.generate_personalized_booking_events(full_profiles, 0)
                        print(f"Generated {len(bookings)} booking events")
                        
                        if bookings and len(bookings) > 0:
                            generator.insert_booking_events(bookings)
                            result['booking_events'] = len(bookings)
                            print(f"Inserted {len(bookings)} booking events successfully")
                        else:
                            print("No bookings were generated")
                            result['booking_events'] = 0
                    else:
                        print("No full profiles found - cannot generate bookings")
                        result['booking_events'] = 0
                else:
                    print("No booking profiles selected")
                    result['booking_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding booking events: {e}")
                import traceback
                traceback.print_exc()
                result['booking_events'] = 0
        
        # Generate Check-in Events (skip journey flag check for enrichment)
        if 'checkin' in event_types:
            enrichment_status['message'] = f'Adding check-in events to {len(profiles)} profiles...'
            try:
                # Realistic check-in: only customers who booked can check in (~50% of profiles)
                checkin_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * 0.5)))
                
                # Create a phase2 generator WITHOUT journey flags so selected profiles get events
                phase2_gen = Phase2DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have checkin flag
                temp_flags = {p['crmId']: {'does_checkin': True} for p in checkin_profiles}
                phase2_gen.set_journey_flags(temp_flags)
                
                phase2_gen.generate_checkin_events(checkin_profiles, events_per_profile=1)
                result['checkin_events'] = len(checkin_profiles)  # 1 per profile
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding check-in events: {e}")
                import traceback
                traceback.print_exc()
                result['checkin_events'] = 0
        
        # Generate Call Centre Events (skip journey flag check for enrichment)
        if 'call' in event_types:
            enrichment_status['message'] = f'Adding call centre events to {len(profiles)} profiles...'
            try:
                # Realistic call rate: only ~30-40% call customer service
                call_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.3, 0.4))))
                
                phase2_gen = Phase2DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have call flag
                temp_flags = {p['crmId']: {'calls_centre': True} for p in call_profiles}
                phase2_gen.set_journey_flags(temp_flags)
                
                phase2_gen.generate_call_centre_events(call_profiles, events_per_profile=1)
                result['call_events'] = len(call_profiles)  # 1 per profile
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding call events: {e}")
                import traceback
                traceback.print_exc()
                result['call_events'] = 0
        
        # Generate Disruption Events (skip journey flag check for enrichment)
        if 'disruption' in event_types:
            enrichment_status['message'] = f'Adding disruption events to {len(profiles)} profiles...'
            try:
                # Realistic disruption: only ~10-20% of travelers experience disruptions
                disruption_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.1, 0.2))))
                
                phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have disruption flag
                temp_flags = {p['crmId']: {'has_disruption': True} for p in disruption_profiles}
                phase3_gen.set_journey_flags(temp_flags)
                
                disruption_events = phase3_gen.generate_disruption_events(disruption_profiles, disruption_rate=1.0)  # 100% of selected profiles
                
                if disruption_events:
                    result['disruption_events'] = len(disruption_events)
                else:
                    result['disruption_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding disruption events: {e}")
                import traceback
                traceback.print_exc()
                result['disruption_events'] = 0
        
        # Generate In-flight Events
        if 'inflight' in event_types:
            enrichment_status['message'] = f'Adding in-flight events to {len(profiles)} profiles...'
            try:
                # Realistic in-flight: only customers who booked and flew (~30-40%)
                inflight_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.3, 0.4))))
                
                phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have inflight flag
                temp_flags = {p['crmId']: {'uses_inflight': True} for p in inflight_profiles}
                phase3_gen.set_journey_flags(temp_flags)
                
                inflight_events = phase3_gen.generate_inflight_events(inflight_profiles)
                
                if inflight_events and len(inflight_events) > 0:
                    phase3_gen.insert_inflight_events(inflight_events)
                    generator.conn.commit()
                    result['inflight_events'] = len(inflight_events)
                    print(f"Inserted {len(inflight_events)} in-flight events successfully")
                else:
                    result['inflight_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding in-flight events: {e}")
                import traceback
                traceback.print_exc()
                result['inflight_events'] = 0
        
        # Generate Hotel Events
        if 'hotel' in event_types:
            enrichment_status['message'] = f'Adding hotel events to {len(profiles)} profiles...'
            try:
                # Realistic hotel: ~30-40% of travelers book hotels
                hotel_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.3, 0.4))))
                
                phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have hotel flag
                temp_flags = {p['crmId']: {'uses_hotel': True} for p in hotel_profiles}
                phase3_gen.set_journey_flags(temp_flags)
                
                hotel_events = phase3_gen.generate_hotel_events(hotel_profiles)
                
                if hotel_events and len(hotel_events) > 0:
                    phase3_gen.insert_hotel_events(hotel_events)
                    generator.conn.commit()
                    result['hotel_events'] = len(hotel_events)
                    print(f"Inserted {len(hotel_events)} hotel events successfully")
                else:
                    result['hotel_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding hotel events: {e}")
                import traceback
                traceback.print_exc()
                result['hotel_events'] = 0
        
        # Generate Loyalty Transaction Events
        if 'loyalty' in event_types:
            enrichment_status['message'] = f'Adding loyalty transactions to {len(profiles)} profiles...'
            try:
                # Realistic loyalty: only profiles with loyalty IDs can have transactions
                loyalty_profiles = [p for p in base_profiles if p.get('loyaltyId') and p.get('loyaltyId') != 'None']
                
                if loyalty_profiles:
                    phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags={})
                    
                    # Set selected profiles to have loyalty flag
                    temp_flags = {p['crmId']: {'has_loyalty': True} for p in loyalty_profiles}
                    phase3_gen.set_journey_flags(temp_flags)
                    
                    loyalty_events = phase3_gen.generate_loyalty_transactions(loyalty_profiles)
                    
                    if loyalty_events and len(loyalty_events) > 0:
                        phase3_gen.insert_loyalty_transactions(loyalty_events)
                        generator.conn.commit()
                        result['loyalty_events'] = len(loyalty_events)
                        print(f"Inserted {len(loyalty_events)} loyalty transactions successfully")
                    else:
                        result['loyalty_events'] = 0
                else:
                    print("No loyalty members found in selected profiles")
                    result['loyalty_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding loyalty transactions: {e}")
                import traceback
                traceback.print_exc()
                result['loyalty_events'] = 0
        
        # Generate POS Events
        if 'pos' in event_types:
            enrichment_status['message'] = f'Adding POS events to {len(profiles)} profiles...'
            try:
                # Realistic POS: ~20-30% of travelers make airport purchases
                pos_profiles = random.sample(base_profiles, min(len(base_profiles), int(len(base_profiles) * random.uniform(0.2, 0.3))))
                
                phase3_gen = Phase3DataGenerator(generator.conn, generator.cursor, journey_flags={})
                
                # Set selected profiles to have POS flag
                temp_flags = {p['crmId']: {'uses_pos': True} for p in pos_profiles}
                phase3_gen.set_journey_flags(temp_flags)
                
                pos_events = phase3_gen.generate_pos_events(pos_profiles)
                
                if pos_events and len(pos_events) > 0:
                    phase3_gen.insert_pos_events(pos_events)
                    generator.conn.commit()
                    result['pos_events'] = len(pos_events)
                    print(f"Inserted {len(pos_events)} POS events successfully")
                else:
                    result['pos_events'] = 0
                    
                current_progress += progress_per_type
                enrichment_status['progress'] = int(current_progress)
            except Exception as e:
                print(f"Error adding POS events: {e}")
                import traceback
                traceback.print_exc()
                result['pos_events'] = 0
        
        # Commit transaction
        enrichment_status['progress'] = 95
        enrichment_status['message'] = 'Committing changes...'
        
        if generator and generator.conn:
            generator.conn.commit()
            print("Transaction committed successfully")
        
        # Close connection
        if generator:
            generator.close()
            print("Connection closed")
        
        enrichment_status['progress'] = 100
        total_events = sum([result.get(k, 0) for k in result.keys() if k.endswith('_events')])
        enrichment_status['message'] = f'✅ Success! Added {total_events} events to {len(profiles)} profiles'
        enrichment_status['last_result'] = result
        
        print(f"Enrichment complete: {result}")
        
    except Exception as e:
        error_msg = f'❌ Error: {str(e)}'
        print(error_msg)
        import traceback
        traceback.print_exc()
        
        enrichment_status['message'] = error_msg
        enrichment_status['last_result'] = {'success': False, 'error': str(e)}
        
        if generator and hasattr(generator, 'conn') and generator.conn:
            try:
                generator.close()
            except:
                pass
    
    finally:
        enrichment_status['running'] = False

@app.route('/api/generate', methods=['POST'])
def generate():
    """API endpoint to trigger data generation"""
    if generation_status['running']:
        return jsonify({
            'success': False,
            'error': 'Generation already in progress'
        }), 400
    
    data = request.json
    count = data.get('count', 1)
    
    if count < 1 or count > 1000:
        return jsonify({
            'success': False,
            'error': 'Count must be between 1 and 1000'
        }), 400
    
    # Reset status
    generation_status['progress'] = 0
    generation_status['message'] = 'Starting...'
    generation_status['last_result'] = None
    
    # Start background thread
    thread = threading.Thread(target=generate_data_background, args=(count,))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Generation started'
    })

@app.route('/api/status')
def status():
    """API endpoint to check generation status"""
    return jsonify(generation_status)

if __name__ == '__main__':
    print("=" * 80)
    print("🌐 AGENTIC TRAVEL DATA GENERATOR - WEB INTERFACE")
    print("=" * 80)
    print()
    print("🚀 Starting server...")
    print("📍 Open your browser to: http://localhost:5001")
    print()
    print("Press Ctrl+C to stop")
    print("=" * 80)
    print()
    
    app.run(host='127.0.0.1', port=5001, debug=False)
