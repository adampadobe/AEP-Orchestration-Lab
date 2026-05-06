#!/usr/bin/env python3
"""
Reusable Data Generator for Agentic Travel Platform
Generates realistic profile, website event, and booking event data
"""

import snowflake.connector
from datetime import datetime, timedelta
import random
import sys
import uuid
from attribution_helper import AttributionHelper
from session_journey_helper import SessionJourneyHelper
from snowflake_settings import get_snowflake_connection_kwargs

class TravelDataGenerator:
    """Generate realistic travel data for AEP demos"""
    
    def __init__(self):
        """Initialize with Snowflake connection"""
        self.conn = None
        self.cursor = None
        self._journey_flags = {}  # Store customer journey flags
        self._last_ancillary_count = 0

    @staticmethod
    def standardize_event_type(old_event_type):
        """Map old event types to new standardized types"""
        event_mapping = {
            # Search
            'flight.search': 'search.initiated',
            'web.searchInitiated': 'search.initiated',
            'search.initiated': 'search.initiated',
            
            # Search Results
            'web.searchResults': 'search.resultsViewed',
            'search.resultsViewed': 'search.resultsViewed',
            
            # Product View
            'web.flightView': 'product.viewed',
            'product.viewed': 'product.viewed',
            
            # Cart
            'flight.booking.step1': 'cart.add',
            'cart.add': 'cart.add',
            
            # Checkout
            'flight.booking.step2': 'checkout.started',
            'checkout.started': 'checkout.started',
            
            # Purchase
            'flight.booking.complete': 'purchase.completed',
            'purchase.completed': 'purchase.completed',
            
            # Booking Management
            'change.complete': 'booking.modified',
            'booking.modified': 'booking.modified',
            
            # Ancillary
            'upgrade.seat': 'seat.upgraded',
            'upgrade.luggage': 'baggage.added',
            'upgrade.date': 'booking.dateChanged',
            
            # Keep unchanged
            'pageView': 'pageView',
            'login': 'login',
            'web.pageView': 'pageView',
        }
        
        return event_mapping.get(old_event_type, old_event_type)
    
    
    @staticmethod
    def generate_verification_sql(crm_ids=None, emails=None):
        """
        Generate SQL queries to verify data ingestion
        
        Args:
            crm_ids: List of CRM IDs that were inserted
            emails: List of email addresses that were inserted
            
        Returns:
            dict with SQL queries
        """
        queries = {
            'count_all': """
-- Count all records in each table
SELECT 'Base Profiles' as table_name, COUNT(*) as count 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE
UNION ALL
SELECT 'Full Profiles', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER
UNION ALL
SELECT 'Website Events', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_WEBSITE
UNION ALL
SELECT 'Bookings', COUNT(*) 
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_BOOKING;
""",
            'latest_base_profiles': """
-- View latest 10 base profiles
SELECT 
    CRMID, 
    PERSON_NAME_COURTESYTITLE,
    FIRSTNAME, 
    LASTNAME, 
    PERSON_NAME_SUFFIX,
    PERSON_NAME_FULLNAME,
    EMAIL, 
    GENDER,
    BIRTHDATE,
    PERSON_BIRTHDAY,
    PERSON_BIRTHMONTH,
    PERSON_BIRTHYEAR,
    PERSON_BIRTHDAYANDMONTH,
    MOBILEPHONE_NUMBER,
    HOMEADDRESS_CITY,
    HOMEADDRESS_COUNTRY,
    TESTPROFILE,
    _RECORDCREATEDTIMESTAMP
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE
ORDER BY _RECORDCREATEDTIMESTAMP DESC
LIMIT 10;
""",
            'latest_profiles': """
-- View latest 10 full profiles
SELECT 
    crmId, firstName, lastName, email, gender, 
    customerSegment, lifetimeValue, testProfile, _recordCreatedTimestamp
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER
ORDER BY _recordCreatedTimestamp DESC
LIMIT 10;
""",
            'latest_events': """
-- View latest 10 website events
SELECT 
    crmId, eventType, searchTerm, originAirport, destinationAirport,
    deviceType, _recordCreatedTimestamp
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_WEBSITE
ORDER BY _recordCreatedTimestamp DESC
LIMIT 10;
""",
            'latest_bookings': """
-- View latest 10 bookings
SELECT 
    crmId, pnr, bookingStatus, totalPrice, currency,
    outboundFlightNumber, outboundOrigin, outboundDestination,
    _recordCreatedTimestamp
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_BOOKING
ORDER BY _recordCreatedTimestamp DESC
LIMIT 10;
"""
        }
        
        # Add specific queries if IDs/emails provided
        if crm_ids and len(crm_ids) > 0:
            crm_list = "', '".join(crm_ids)
            queries['inserted_base_profiles'] = f"""
-- Base Profiles just inserted
SELECT 
    CRMID,
    PERSON_NAME_COURTESYTITLE,
    FIRSTNAME, 
    LASTNAME,
    PERSON_NAME_SUFFIX,
    PERSON_NAME_FULLNAME,
    EMAIL,
    GENDER,
    BIRTHDATE,
    PERSON_BIRTHDAY,
    PERSON_BIRTHMONTH,
    PERSON_BIRTHYEAR,
    PERSON_BIRTHDAYANDMONTH,
    MOBILEPHONE_NUMBER,
    MOBILEPHONE_STATUS,
    HOMEADDRESS_CITY,
    HOMEADDRESS_COUNTRY,
    PERSONALEMAIL_STATUS,
    TESTPROFILE
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE
WHERE CRMID IN ('{crm_list}')
ORDER BY CRMID;
"""
            
            queries['inserted_profiles'] = f"""
-- Full Profiles just inserted
SELECT 
    crmId, ecid, firstName, lastName, email, gender, dateOfBirth,
    lastHolidayDestination, upcomingHolidayDestination,
    totalFlightsTaken, preferredCabinClass, lifetimeValue, customerSegment
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER
WHERE crmId IN ('{crm_list}')
ORDER BY crmId;
"""
            
            queries['inserted_events'] = f"""
-- Events for profiles just inserted
SELECT 
    crmId, eventType, pageType, searchTerm, 
    originAirport, destinationAirport, deviceType
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_WEBSITE
WHERE crmId IN ('{crm_list}')
ORDER BY crmId, _recordCreatedTimestamp;
"""
            
            queries['inserted_bookings'] = f"""
-- Bookings for profiles just inserted
SELECT 
    crmId, pnr, bookingStatus, totalPrice, currency,
    outboundFlightNumber, outboundOrigin, outboundDestination,
    totalPassengers, paymentMethod, paymentStatus
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_BOOKING
WHERE crmId IN ('{crm_list}')
ORDER BY crmId;
"""
        
        if emails and len(emails) > 0:
            email_list = "', '".join(emails)
            queries['by_email'] = f"""
-- Find profiles by email
SELECT crmId, firstName, lastName, email, customerSegment
FROM TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER
WHERE email IN ('{email_list}')
ORDER BY email;
"""
        
        return queries
        
    def connect(self):
        """Connect to Snowflake"""
        self.conn = snowflake.connector.connect(**get_snowflake_connection_kwargs())
        
        self.cursor = self.conn.cursor()
        
        # Set session timezone to match Snowflake warehouse (fixes 8-hour offset bug)
        self.cursor.execute("ALTER SESSION SET TIMEZONE = 'America/Los_Angeles'")

        
    def disconnect(self):
        """Close Snowflake connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
    
    def get_journey_flags(self, crm_id):
        """Get journey flags for a specific customer"""
        return self._journey_flags.get(crm_id, {})
    
    def set_journey_flags(self, journey_flags_dict):
        """Set journey flags for batch of customers"""
        self._journey_flags = journey_flags_dict
    
    @staticmethod
    def generate_timestamp_utc():
        """Generate UTC timestamp in AEP-compatible format"""
        return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    
    @staticmethod
    def generate_realistic_timestamp(days_ago=0, hour_range=(0, 23)):
        """
        Generate a realistic timestamp spread throughout the day
        
        Args:
            days_ago: Number of days in the past (0 = today, 1 = yesterday, etc.)
            hour_range: Tuple of (min_hour, max_hour) for realistic business hours
                       Default (0, 23) = full 24 hours
                       Use (6, 22) for typical waking hours
                       Use (8, 18) for business hours
        
        Returns:
            datetime object with randomized hour, minute, second
        """
        now = datetime.utcnow()
        # Go back the specified number of days
        base_date = now - timedelta(days=days_ago)
        # Randomize hour within the specified range
        random_hour = random.randint(hour_range[0], hour_range[1])
        # Randomize minute and second for realistic distribution
        random_minute = random.randint(0, 59)
        random_second = random.randint(0, 59)
        random_microsecond = random.randint(0, 999999)
        
        # Create new datetime with randomized time
        realistic_timestamp = base_date.replace(
            hour=random_hour,
            minute=random_minute,
            second=random_second,
            microsecond=random_microsecond
        )
        
        return realistic_timestamp
    
    @staticmethod
    def generate_email(index):
        """Generate test email following standards"""
        date_str = datetime.now().strftime("%d%m%Y")
        return f"adamp.adobedemo+{date_str}+{index}@gmail.com"
    
    @staticmethod
    def generate_phone():
        """Generate mobile phone number following standards - same for all profiles"""
        return "+447425627462"
    
    @staticmethod
    def generate_landline(idx):
        """
        Generate unique UK landline number per customer
        Format: +44 {AREA_CODE} {XXXX} {XXXX}
        """
        area_codes = ["20", "121", "131", "161"]  # London, Birmingham, Edinburgh, Manchester
        
        # Use idx to determine area code and generate unique number
        area_code = area_codes[idx % len(area_codes)]
        
        # Generate unique 8-digit number based on index
        # Format: XXXX XXXX
        base_number = 10000000 + (idx % 90000000)  # Ensures 8 digits
        number_str = str(base_number)
        
        # Format as: +44 {area} {first4} {last4}
        first_four = number_str[:4]
        last_four = number_str[4:]
        
        return f"+44 {area_code} {first_four} {last_four}"
    
    def get_next_customer_id(self):
        """Get the next available customer ID"""
        try:
            self.cursor.execute("SELECT MAX(CAST(SUBSTRING(crmId, 4) AS INTEGER)) FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER")
            result = self.cursor.fetchone()
            if result and result[0]:
                return result[0] + 1
            return 1000
        except:
            return 1000
    
    def get_daily_email_counter(self):
        """
        Get the next email counter for today's date.
        Counters reset to 1 each day.
        Returns 1 if no emails exist for today.
        """
        try:
            today = datetime.now().strftime("%d%m%Y")
            # Query for emails that match today's date pattern
            query = f"""
            SELECT PRIMARYEMAIL 
            FROM AGENTIC_TRAVEL_PROFILE_CUSTOMER
            WHERE PRIMARYEMAIL LIKE '%+{today}+%'
            ORDER BY _RECORDCREATEDTIMESTAMP DESC
            """
            self.cursor.execute(query)
            results = self.cursor.fetchall()
            
            if not results:
                return 1  # First email for today
            
            # Extract counters from all emails for today
            max_counter = 0
            for row in results:
                email = row[0]
                try:
                    # Extract counter from email format: adamp.adobedemo+DDMMYYYY+N@gmail.com
                    parts = email.split('+')
                    if len(parts) >= 3:
                        counter = int(parts[2].split('@')[0])
                        max_counter = max(max_counter, counter)
                except:
                    continue
            
            return max_counter + 1
        except Exception as e:
            print(f"Warning: Could not get daily email counter: {e}")
            return 1
    
    def generate_base_profiles(self, count=1, start_index=None, email_start_counter=None):
        """
        Generate BASE customer profile data (simplified foundational profiles)
        Populates AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE table
        
        Args:
            count: Number of base profiles to generate
            start_index: Starting index for CRM IDs
            email_start_counter: Starting counter for daily email addresses
        
        Returns:
            List of tuples containing base profile data
        """
        if start_index is None:
            start_index = self.get_next_customer_id()
        
        if email_start_counter is None:
            email_start_counter = self.get_daily_email_counter()
        
        # Name lists for variety
        first_names_male = [
            "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Christopher",
            "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Andrew", "Paul", "Joshua", "Kenneth"
        ]
        first_names_female = [
            "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan", "Jessica", "Sarah", "Karen",
            "Lisa", "Nancy", "Betty", "Margaret", "Sandra", "Ashley", "Kimberly", "Emily", "Donna", "Michelle"
        ]
        last_names = [
            "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
            "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"
        ]
        cities = ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Edinburgh", "Bristol"]
        countries = ["United Kingdom", "United States", "Canada", "Australia", "Germany", "France", "Spain", "Italy"]
        
        base_profiles = []
        journey_flags_list = []  # Store journey flags separately
        for i in range(count):
            idx = start_index + i
            email_counter = email_start_counter + i
            
            # Determine gender
            gender = random.choice(["male", "female"])
            first_name = random.choice(first_names_male if gender == "male" else first_names_female)
            last_name = random.choice(last_names)
            
            # Generate courtesy title based on gender
            if gender == "male":
                # Mr (80%), Dr (10%), Prof (10%)
                courtesy_title = random.choices(
                    ["Mr", "Dr", "Prof"],
                    weights=[80, 10, 10],
                    k=1
                )[0]
            else:  # female
                # Mrs (40%), Ms (30%), Miss (20%), Dr (5%), Prof (5%)
                courtesy_title = random.choices(
                    ["Mrs", "Ms", "Miss", "Dr", "Prof"],
                    weights=[40, 30, 20, 5, 5],
                    k=1
                )[0]
            
            # Generate suffix (7% have suffixes)
            suffix = None
            if random.random() < 0.07:
                suffix = random.choice(["Jr", "Sr", "III", "IV", "PhD", "MD"])
            
            # Generate birthdate and extract components
            age = random.randint(21, 75)
            birthdate = datetime.now() - timedelta(days=age * 365 + random.randint(0, 365))
            birth_day = birthdate.day
            birth_month = birthdate.month
            birth_year = birthdate.year
            
            # Generate birthDayAndMonth in MM-DD format (e.g., "06-15") for AEP compliance
            birth_day_and_month = f"{birth_month:02d}-{birth_day:02d}"
            
            # Generate full name (with suffix if applicable)
            if suffix:
                full_name = f"{first_name} {last_name} {suffix}"
            else:
                full_name = f"{first_name} {last_name}"
            
            # Generate email
            email = self.generate_email(email_counter)
            
            # Generate home address
            city = random.choice(cities)
            country = random.choice(countries)
            
            # Import customer journey configuration (force reload to get latest loyalty rate)
            import importlib
            if 'customer_journey_probabilities' in sys.modules:
                import customer_journey_probabilities
                importlib.reload(customer_journey_probabilities)
                CustomerJourneyConfig = customer_journey_probabilities.CustomerJourneyConfig
            else:
                from customer_journey_probabilities import CustomerJourneyConfig
            
            # Get customer journey flags (realistic engagement funnel)
            journey_flags = CustomerJourneyConfig.get_customer_profile_flags()
            
            # Set loyalty ID based on journey flags
            loyalty_id = f"LOYALTY{idx + 2000}" if journey_flags['has_loyalty'] else None
            
            profile = (
                # Identity Fields (10 fields)
                f"CRM{idx}",                           # CRMID (required)
                str(uuid.uuid4()),                     # ECID
                email,                                 # EMAIL (required)
                f"sha256_{idx}",                       # EMAILIDSHA256
                f"GAID{idx}",                          # GAID
                loyalty_id,                            # LOYALTYID (None for 5% of customers)
                f"PASS{idx}",                          # PASSPORTID
                self.generate_phone(),                 # PHONENUMBER
                None,                                  # PUSHTOKENS (array)
                f"STACK{idx}",                         # STACKCHATID
                
                # Person Details (4 fields)
                first_name,                            # FIRSTNAME
                last_name,                             # LASTNAME
                birthdate.strftime('%Y-%m-%d'),        # BIRTHDATE
                gender,                                # GENDER
                
                # Home Address (5 fields)
                f"{idx} High Street",                  # HOMEADDRESS_STREET1
                city,                                  # HOMEADDRESS_CITY
                random.choice(["England", "Scotland", "Wales", "California", "Ontario"]),  # HOMEADDRESS_STATEPROVINCE
                f"SW{idx % 10}A 1AA",                  # HOMEADDRESS_POSTALCODE
                country,                               # HOMEADDRESS_COUNTRY
                
                # Personal Email (6 fields)
                email,                                 # PERSONALEMAIL_ADDRESS
                "Personal",                            # PERSONALEMAIL_LABEL
                True,                                  # PERSONALEMAIL_PRIMARY
                "Active",                              # PERSONALEMAIL_STATUS
                "Verified",                            # PERSONALEMAIL_STATUSREASON
                "Personal",                            # PERSONALEMAIL_TYPE
                
                # Mobile Phone (3 fields)
                "+447425627462",                       # MOBILEPHONE_NUMBER (static number)
                "Active",                              # MOBILEPHONE_STATUS
                True,                                  # MOBILEPHONE_PRIMARY
                
                # Test Profile Flag (1 field)
                True,                                  # TESTPROFILE
                
                # Metadata (2 fields)
                self.generate_timestamp_utc(),         # _RECORDCREATEDTIMESTAMP
                self.generate_timestamp_utc(),         # _RECORDUPDATEDTIMESTAMP
                
                # NEW Person Name Fields (3 fields)
                courtesy_title,                        # PERSON_NAME_COURTESYTITLE
                suffix,                                # PERSON_NAME_SUFFIX
                full_name,                             # PERSON_NAME_FULLNAME
                
                # NEW Birth Component Fields (4 fields)
                birth_day,                             # PERSON_BIRTHDAY
                birth_month,                           # PERSON_BIRTHMONTH
                birth_year,                            # PERSON_BIRTHYEAR
                birth_day_and_month                    # PERSON_BIRTHDAYANDMONTH
            )
            base_profiles.append(profile)
            journey_flags_list.append(journey_flags)  # Store journey flags
        
        # Store journey flags as instance variable for later use
        self._journey_flags = dict(zip([f"CRM{start_index + i}" for i in range(count)], journey_flags_list))
        
        return base_profiles
    
    def generate_profiles(self, count=1, start_index=None, email_start_counter=None, base_profiles=None):
        """
        Generate customer profile data with ALL fields populated
        
        Args:
            count: Number of profiles to generate
            start_index: Starting index for CRM IDs
            email_start_counter: Starting counter for daily email addresses
            base_profiles: Optional base profiles to match names/data from
        """
        if start_index is None:
            start_index = self.get_next_customer_id()
        
        if email_start_counter is None:
            email_start_counter = self.get_daily_email_counter()
        
        # Expanded lists for maximum variety
        first_names_male = [
            "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Christopher",
            "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Andrew", "Paul", "Joshua", "Kenneth",
            "George", "Kevin", "Brian", "Edward", "Ronald", "Timothy", "Jason", "Jeffrey", "Ryan", "Jacob",
            "Gary", "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott", "Brandon", "Benjamin",
            "Samuel", "Raymond", "Gregory", "Frank", "Alexander", "Patrick", "Jack", "Dennis", "Jerry", "Tyler",
            "Aaron", "Henry", "Douglas", "Peter", "Adam", "Nathan", "Zachary", "Walter", "Kyle", "Harold"
        ]
        first_names_female = [
            "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan", "Jessica", "Sarah", "Karen",
            "Lisa", "Nancy", "Betty", "Margaret", "Sandra", "Ashley", "Kimberly", "Emily", "Donna", "Michelle",
            "Carol", "Amanda", "Dorothy", "Melissa", "Deborah", "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia",
            "Kathleen", "Amy", "Angela", "Shirley", "Anna", "Brenda", "Pamela", "Emma", "Nicole", "Helen",
            "Samantha", "Katherine", "Christine", "Debra", "Rachel", "Carolyn", "Janet", "Catherine", "Maria", "Heather",
            "Diane", "Ruth", "Julie", "Olivia", "Joyce", "Virginia", "Victoria", "Kelly", "Lauren", "Christina"
        ]
        last_names = [
            "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
            "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
            "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
            "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
            "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
            "Phillips", "Evans", "Turner", "Parker", "Collins", "Edwards", "Stewart", "Morris", "Murphy", "Cook"
        ]
        cities = [
            "London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Edinburgh", "Bristol", 
            "Cardiff", "Belfast", "Newcastle", "Sheffield", "Nottingham", "Leicester", "Southampton",
            "Portsmouth", "Brighton", "Oxford", "Cambridge", "York", "Bath", "Aberdeen", "Dundee",
            "Inverness", "Plymouth", "Exeter", "Norwich", "Derby", "Coventry", "Bradford"
        ]
        destinations = [
            # Europe
            "Paris", "Barcelona", "Amsterdam", "Rome", "Berlin", "Madrid", "Lisbon", "Vienna", "Prague", "Budapest",
            "Athens", "Copenhagen", "Stockholm", "Oslo", "Helsinki", "Dublin", "Brussels", "Zurich", "Venice", "Florence",
            # Americas
            "New York", "Los Angeles", "Miami", "Toronto", "Vancouver", "Cancun", "Mexico City", "Buenos Aires", "Rio de Janeiro",
            # Asia Pacific
            "Dubai", "Abu Dhabi", "Singapore", "Hong Kong", "Tokyo", "Bangkok", "Bali", "Sydney", "Melbourne", "Auckland",
            # Africa & Middle East
            "Cape Town", "Marrakech", "Cairo", "Tel Aviv", "Doha"
        ]
        cabin_classes = ["economy", "premium_economy", "business", "first"]
        seat_types = ["window", "aisle", "middle"]
        meal_prefs = ["standard", "vegetarian", "vegan", "gluten_free", "halal", "kosher", "diabetic", "low_sodium"]
        segments = ["bronze", "silver", "gold", "platinum", "diamond"]
        
        profiles = []
        for i in range(count):
            idx = start_index + i
            email_counter = email_start_counter + i  # Daily email counter
            
            # If base_profiles provided, reuse the SAME identity row as base (ECID, email, etc.)
            # so full profile + website + booking + Phase 2/3 all stitch to one device/profile id.
            if base_profiles and i < len(base_profiles):
                bp = base_profiles[i]
                # Base tuple: CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER,
                # PUSHTOKENS, STACKCHATID, FIRSTNAME, LASTNAME, BIRTHDATE, GENDER, ...
                crm_val = bp[0]
                ecid_val = bp[1]
                email_val = bp[2]
                email_sha_val = bp[3]
                gaid_val = bp[4]
                loyalty_id_from_base = bp[5]
                passport_val = bp[6]
                phone_val = bp[7]
                push_tokens_val = bp[8]
                stack_val = bp[9]
                first_name = bp[10]
                last_name = bp[11]
                dob_str = bp[12]
                gender = bp[13]
                dob = datetime.strptime(dob_str, '%Y-%m-%d') if isinstance(dob_str, str) else dob_str
            else:
                crm_val = f"CRM{idx}"
                ecid_val = str(uuid.uuid4())
                email_val = self.generate_email(email_counter)
                email_sha_val = f"sha256_{idx}"
                gaid_val = f"GAID{idx}"
                loyalty_id_from_base = None
                passport_val = f"PASS{idx}"
                phone_val = self.generate_phone()
                push_tokens_val = None
                stack_val = f"STACK{idx}"
                gender = random.choice(["male", "female"])
                first_name = random.choice(first_names_male if gender == "male" else first_names_female)
                last_name = random.choice(last_names)
                age = random.randint(21, 75)
                dob = datetime.now() - timedelta(days=age * 365 + random.randint(0, 365))
            last_holiday = datetime.now() - timedelta(days=random.randint(14, 730))  # Up to 2 years ago
            upcoming_holiday = datetime.now() + timedelta(days=random.randint(14, 365))  # Up to 1 year ahead
            
            # Travel history with more variety
            total_flights = random.randint(1, 100)  # From new travelers to frequent flyers
            total_distance = round(total_flights * random.uniform(400, 5000), 2)  # Varied distances
            
            # Customer value with realistic segmentation
            # Different customer tiers have different booking patterns
            segment = random.choice(segments)
            if segment == "diamond":
                avg_booking = round(random.uniform(1200, 3500), 2)
                total_bookings = random.randint(15, 50)
            elif segment == "platinum":
                avg_booking = round(random.uniform(800, 2000), 2)
                total_bookings = random.randint(10, 30)
            elif segment == "gold":
                avg_booking = round(random.uniform(500, 1200), 2)
                total_bookings = random.randint(6, 20)
            elif segment == "silver":
                avg_booking = round(random.uniform(350, 800), 2)
                total_bookings = random.randint(3, 12)
            else:  # bronze
                avg_booking = round(random.uniform(250, 600), 2)
                total_bookings = random.randint(1, 8)
            
            lifetime_value = round(avg_booking * total_bookings, 2)
            
            # Use loyalty ID from base profile if available, otherwise generate with journey config
            if loyalty_id_from_base is not None:
                # Base profile explicitly set loyalty status (using journey config)
                loyalty_id = loyalty_id_from_base
            else:
                # Fallback for standalone usage (no base profile)
                import importlib
                if 'customer_journey_probabilities' in sys.modules:
                    import customer_journey_probabilities
                    importlib.reload(customer_journey_probabilities)
                    CustomerJourneyConfig = customer_journey_probabilities.CustomerJourneyConfig
                else:
                    from customer_journey_probabilities import CustomerJourneyConfig
                has_loyalty = random.random() < CustomerJourneyConfig.LOYALTY_ENROLLMENT_RATE
                loyalty_id = f"LOYALTY{idx + 2000}" if has_loyalty else None
            
            profile = (
                # Identity Fields (must match base profile when base_profiles provided)
                crm_val,
                ecid_val,
                email_val,
                email_sha_val,
                gaid_val,
                loyalty_id,
                passport_val,
                phone_val,
                push_tokens_val,
                stack_val,
                
                # Personal Details
                first_name,
                last_name,
                dob.strftime('%Y-%m-%d'),
                gender,
                "GB",
                
                # Contact Details
                email_val,
                self.generate_landline(idx),  # Unique landline per customer
                f"{idx} High Street",
                random.choice(cities),
                f"SW{idx % 10}A 1AA",
                "United Kingdom",
                
                # Travel History
                last_holiday.strftime('%Y-%m-%d'),
                random.choice(destinations),
                upcoming_holiday.strftime('%Y-%m-%d'),
                random.choice(destinations),
                total_flights,
                total_distance,
                None,  # favoriteDestinations array
                
                # Travel Preferences
                random.choice(cabin_classes),
                random.choice(seat_types),
                random.choice(meal_prefs),
                None,  # specialAssistance array
                
                # Customer Value
                lifetime_value,
                avg_booking,
                total_bookings,
                segment,
                
                # Test Profile Flag (CRITICAL for AEP governance)
                True,  # testProfile - ALL generated profiles are test profiles
                
                # Metadata
                self.generate_timestamp_utc(),
                self.generate_timestamp_utc()
            )
            profiles.append(profile)
        
        return profiles
    
    def generate_website_events(self, count=1, start_index=None, email_start_counter=None):
        """
        Generate website event data with ALL fields populated
        
        Args:
            count: Number of events to generate
            start_index: Starting index for CRM IDs
            email_start_counter: Starting counter for daily email addresses
        """
        if start_index is None:
            start_index = self.get_next_customer_id()
        
        if email_start_counter is None:
            email_start_counter = self.get_daily_email_counter()
        
        # Expanded variety for realistic web behavior
        search_terms = [
            # Destination searches
            "cheap flights to paris", "barcelona weekend break", "new york city hotels", "dubai luxury hotels",
            "flights to tokyo", "rome vacation packages", "amsterdam city break", "singapore business class",
            "sydney flights", "bali beach resort", "maldives honeymoon", "iceland northern lights",
            # Style-based searches
            "beach holidays", "ski resorts", "city breaks", "adventure travel", "luxury getaways",
            "family vacation packages", "romantic weekend", "solo travel deals", "group tours",
            # Deal-based searches
            "last minute flights", "cheap holiday deals", "business class deals", "flight sale",
            "hotel discounts", "all inclusive packages", "early booking offers", "weekend getaways",
            # Specific needs
            "direct flights", "red eye flights", "premium economy", "first class tickets",
            "pet friendly hotels", "accessible travel", "long haul flights", "connecting flights"
        ]
        origins = ["LHR", "LGW", "LTN", "STN", "MAN", "EDI", "BHX", "GLA", "BRS", "NCL", "LBA", "EMA"]
        destinations = [
            "CDG", "ORY", "JFK", "EWR", "DXB", "DWC", "BCN", "AMS", "FCO", "CIA", "MAD", "BER",
            "CPH", "ARN", "OSL", "HEL", "DUB", "BRU", "ZRH", "GVA", "VCE", "FLR", "ATH", "IST",
            "YYZ", "YVR", "MEX", "EZE", "GRU", "SYD", "MEL", "AKL", "HKG", "NRT", "BKK", "SIN"
        ]
        devices = ["desktop", "mobile", "tablet"]
        browsers = ["Chrome", "Safari", "Firefox", "Edge", "Opera"]
        os_list = ["Windows 10", "Windows 11", "macOS", "iOS", "Android", "iPadOS"]
        cabin_classes = ["economy", "premium_economy", "business", "first"]
        actions = ["search", "view", "click", "scroll", "filter", "sort", "compare", "save"]
        page_types = ["home", "search", "results", "details", "checkout", "account", "deals", "destinations"]
        
        events = []
        for i in range(count):
            idx = start_index + (i // 2)  # Each profile gets 2 events
            email_counter = email_start_counter + (i // 2)  # Daily email counter matches profile
            
            # Mix of event types
            if i % 3 == 0:
                event_type = "web.flightView"
                page_type = "details"
                action = "view"
            elif i % 3 == 1:
                event_type = "web.searchResults"
                page_type = "results"
                action = "search"
            else:
                event_type = "web.pageView"
                page_type = random.choice(page_types)
                action = random.choice(actions)
            
            # Generate flight details
            origin = random.choice(origins)
            destination = random.choice(destinations)
            departure_date = datetime.now() + timedelta(days=random.randint(14, 90))
            return_date = departure_date + timedelta(days=random.randint(3, 14))
            passengers = random.randint(1, 4)
            results = random.randint(10, 50)
            
            # Flight details (for flight view events)
            flight_num = f"BA{random.randint(100, 999)}"
            flight_price = round(random.uniform(199, 1499), 2)
            departure_time = departure_date + timedelta(hours=random.randint(6, 22))
            
            # PHASE 1A: Add marketing attribution data
            attribution = AttributionHelper.assign_marketing_channel(is_mobile=False)
            
            event = (
                # Identity
                f"CRM{idx}",
                str(uuid.uuid4()),  # ECID as random UUID
                self.generate_email(email_counter),
                f"sha256_{idx}",
                f"GAID{idx}",
                f"LOYALTY{idx + 2000}",
                f"PASS{idx}",
                self.generate_phone(),
                None,  # pushTokens
                f"STACK{idx}",
                
                # Event Metadata
                f"WEBSITE{4000 + start_index + i}",
                self.generate_timestamp_utc(),
                event_type,
                
                # Page Details
                f"https://travel.example.com/{page_type}",
                f"Flight {page_type.title()}",
                page_type,
                "https://google.com" if i % 5 == 0 else "https://travel.example.com",
                
                # Search Details
                random.choice(search_terms),
                origin,
                destination,
                departure_date.strftime('%Y-%m-%d'),
                return_date.strftime('%Y-%m-%d'),
                passengers,
                random.choice(cabin_classes),
                results,
                
                # Flight Viewed
                flight_num if event_type == "web.flightView" else None,
                origin if event_type == "web.flightView" else None,
                destination if event_type == "web.flightView" else None,
                departure_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3] if event_type == "web.flightView" else None,
                flight_price if event_type == "web.flightView" else None,
                "GBP",
                
                # Interaction Details
                action,
                f"btn_{action}",
                random.randint(30, 300),
                
                # Session Details
                f"SESSION{idx + 4000}",
                random.choice(devices),
                random.choice(browsers),
                random.choice(os_list),
                
                # Metadata
                self.generate_timestamp_utc(),
                
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
                
                # Funnel Fields (NULL for simple events)
                None,  # FUNNEL_NAME
                None,  # FUNNEL_STEP
                None,  # FUNNEL_STEP_NUMBER
                None,  # FUNNEL_COMPLETION_STATUS
                
                # Ancillary Fields (NULL for simple events)
                None,  # ANCILLARY_ITEM_NAME
                None,  # ANCILLARY_ITEM_PRICE
                None,  # ANCILLARY_ITEM_CATEGORY
                
                # Channel
                'web'  # CHANNEL
            )
            events.append(event)
        
        return events
    
    def generate_booking_events(self, count=1, start_index=None, email_start_counter=None):
        """
        Generate booking event data with ALL fields populated
        
        Args:
            count: Number of events to generate
            start_index: Starting index for CRM IDs
            email_start_counter: Starting counter for daily email addresses
        """
        if start_index is None:
            start_index = self.get_next_customer_id()
        
        if email_start_counter is None:
            email_start_counter = self.get_daily_email_counter()
        
        # Expanded booking variety
        origins = ["LHR", "LGW", "LTN", "STN", "MAN", "EDI", "BHX", "GLA", "BRS", "NCL", "LBA", "EMA", "ABZ"]
        destinations = [
            # Europe
            "CDG", "ORY", "BCN", "MAD", "FCO", "CIA", "AMS", "BER", "VIE", "PRG", "BUD", "ATH",
            "CPH", "ARN", "OSL", "HEL", "DUB", "BRU", "ZRH", "GVA", "LIS", "OPO", "VCE", "NAP",
            # Americas
            "JFK", "EWR", "LAX", "MIA", "ORD", "YYZ", "YVR", "CUN", "MEX", "PTY", "BOG", "LIM",
            # Middle East & Africa
            "DXB", "DWC", "AUH", "DOH", "CAI", "JNB", "CPT", "NBO", "ADD",
            # Asia Pacific
            "SIN", "HKG", "BKK", "KUL", "DPS", "NRT", "HND", "ICN", "PEK", "SYD", "MEL", "AKL"
        ]
        cabin_classes = ["economy", "premium_economy", "business", "first"]
        channels = ["website", "mobile_app", "call_center", "travel_agent", "email", "chat"]
        trip_types = ["round_trip", "one_way", "multi_city"]
        card_types = ["visa", "mastercard", "amex", "discover", "diners"]
        
        bookings = []
        for i in range(count):
            idx = start_index + i
            email_counter = email_start_counter + i  # Daily email counter
            
            # Generate flight dates
            booking_time = datetime.now() - timedelta(hours=random.randint(1, 48))
            outbound_dep = datetime.now() + timedelta(days=random.randint(14, 90))
            outbound_arr = outbound_dep + timedelta(hours=random.randint(2, 12))
            return_dep = outbound_dep + timedelta(days=random.randint(3, 14))
            return_arr = return_dep + timedelta(hours=random.randint(2, 12))
            
            # Passenger details with realistic variations
            # Flight numbers and routing (needed for pricing)
            origin = random.choice(origins)
            destination = random.choice(destinations)
            cabin = random.choice(cabin_classes)
            
            # Passenger details with realistic variations
            passenger_mix = random.choice([
                (1, 0, 0),  # Solo traveler (most common)
                (2, 0, 0),  # Couple
                (2, 1, 0),  # Family with one child
                (2, 2, 0),  # Family with two children
                (2, 1, 1),  # Family with child and infant
                (1, 1, 0),  # Single parent
                (3, 0, 0),  # Group of friends
                (4, 0, 0),  # Larger group
            ])
            adults, children, infants = passenger_mix
            total_pax = adults + children + infants
            
            # Realistic pricing based on cabin class and destination
            # Estimate distance for pricing (rough grouping)
            if destination in ["CDG", "ORY", "BCN", "MAD", "AMS", "BRU", "DUB"]:  # Short haul Europe
                distance_multiplier = 1.0
            elif destination in ["FCO", "ATH", "CPH", "ARN", "VIE", "PRG"]:  # Medium Europe
                distance_multiplier = 1.3
            elif destination in ["DXB", "DOH", "CAI", "JNB"]:  # Middle East/Africa
                distance_multiplier = 2.5
            else:  # Long haul (Americas, Asia Pacific)
                distance_multiplier = 3.5
            
            # Base fare by cabin class
            if cabin == "first":
                base_fare = round(random.uniform(1500, 4000) * distance_multiplier, 2)
            elif cabin == "business":
                base_fare = round(random.uniform(800, 2500) * distance_multiplier, 2)
            elif cabin == "premium_economy":
                base_fare = round(random.uniform(400, 900) * distance_multiplier, 2)
            else:  # economy
                base_fare = round(random.uniform(150, 600) * distance_multiplier, 2)
            
            taxes = round(base_fare * random.uniform(0.12, 0.28), 2)
            fees = round(random.uniform(15, 75), 2)
            
            # Discounts (more likely for economy, less for premium)
            discount_chance = 0.3 if cabin in ["economy", "premium_economy"] else 0.15
            discount = round(random.uniform(0, base_fare * 0.25), 2) if random.random() < discount_chance else 0
            
            total_price = round((base_fare + taxes + fees - discount) * total_pax, 2)
            
            # Loyalty points
            points_used = random.randint(0, 5000) if random.random() > 0.8 else 0
            points_earned = int(total_price * random.uniform(0.5, 2.0))
            
            # Ancillary services (varies by cabin class - premium cabins include more)
            if cabin == "first":
                has_baggage = random.random() > 0.1  # Usually included
                has_seat_sel = random.random() > 0.1
                has_meal = True  # Always included
                has_insurance = random.random() > 0.4
                has_fast_track = random.random() > 0.2
                has_lounge = random.random() > 0.3
            elif cabin == "business":
                has_baggage = random.random() > 0.2
                has_seat_sel = random.random() > 0.2
                has_meal = random.random() > 0.15
                has_insurance = random.random() > 0.5
                has_fast_track = random.random() > 0.4
                has_lounge = random.random() > 0.5
            elif cabin == "premium_economy":
                has_baggage = random.random() > 0.35
                has_seat_sel = random.random() > 0.3
                has_meal = random.random() > 0.4
                has_insurance = random.random() > 0.6
                has_fast_track = random.random() > 0.75
                has_lounge = random.random() > 0.85
            else:  # economy
                has_baggage = random.random() > 0.5  # 50% purchase baggage
                has_seat_sel = random.random() > 0.6  # 40% purchase seats
                has_meal = random.random() > 0.7     # 30% purchase meals
                has_insurance = random.random() > 0.65
                has_fast_track = random.random() > 0.9
                has_lounge = random.random() > 0.95
            
            # Flight numbers
            outbound_flight = f"BA{random.randint(100, 999)}"
            return_flight = f"BA{random.randint(100, 999)}"
            
            booking = (
                # Identity
                f"CRM{idx}",
                str(uuid.uuid4()),  # ECID as random UUID
                self.generate_email(email_counter),
                f"sha256_{idx}",
                f"GAID{idx}",
                f"LOYALTY{idx + 2000}",
                f"PASS{idx}",
                self.generate_phone(),
                None,  # pushTokens
                f"STACK{idx}",
                
                # Event Metadata
                f"BOOKING{idx + 5000}",
                self.generate_timestamp_utc(),
                "booking.completed",
                
                # Booking Details
                f"PNR{idx + 6000}",
                "confirmed",
                booking_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                random.choice(channels),
                random.choice(trip_types),
                
                # Outbound Flight
                outbound_flight,
                origin,
                destination,
                outbound_dep.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                outbound_arr.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                cabin,
                
                # Return Flight
                return_flight,
                destination,
                origin,
                return_dep.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                return_arr.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                cabin,
                
                # Passenger Details
                total_pax,
                adults,
                children,
                infants,
                
                # Pricing
                total_price,
                base_fare,
                taxes,
                fees,
                "GBP",
                discount,
                points_used,
                points_earned,
                
                # Payment
                "credit_card",
                random.choice(card_types),
                f"TXN{idx + 7000}",
                "completed",
                
                # Ancillary Services
                random.randint(1, 3) if has_baggage else 0,
                has_seat_sel,
                has_meal,
                has_insurance,
                has_fast_track,
                has_lounge,
                
                # Metadata
                self.generate_timestamp_utc()
            )
            bookings.append(booking)
        
        return bookings
    
    def insert_base_profiles(self, base_profiles):
        """Insert base profile data into Snowflake"""
        insert_sql = """
        INSERT INTO AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE (
            CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
            FIRSTNAME, LASTNAME, BIRTHDATE, GENDER,
            HOMEADDRESS_STREET1, HOMEADDRESS_CITY, HOMEADDRESS_STATEPROVINCE, HOMEADDRESS_POSTALCODE, HOMEADDRESS_COUNTRY,
            PERSONALEMAIL_ADDRESS, PERSONALEMAIL_LABEL, PERSONALEMAIL_PRIMARY, PERSONALEMAIL_STATUS, 
            PERSONALEMAIL_STATUSREASON, PERSONALEMAIL_TYPE,
            MOBILEPHONE_NUMBER, MOBILEPHONE_STATUS, MOBILEPHONE_PRIMARY,
            TESTPROFILE,
            _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP,
            PERSON_NAME_COURTESYTITLE, PERSON_NAME_SUFFIX, PERSON_NAME_FULLNAME,
            PERSON_BIRTHDAY, PERSON_BIRTHMONTH, PERSON_BIRTHYEAR, PERSON_BIRTHDAYANDMONTH
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, base_profiles)
    
    def insert_profiles(self, profiles):
        """Insert profile data into Snowflake"""
        insert_sql = """
        INSERT INTO AGENTIC_TRAVEL_PROFILE_CUSTOMER (
            crmId, ecid, email, emailIdSha256, gaid, loyaltyId, passportId, phoneNumber, pushTokens, stackchatId,
            firstName, lastName, dateOfBirth, gender, nationality,
            primaryEmail, primaryPhone, addressStreet, addressCity, addressPostalCode, addressCountry,
            lastHolidayDate, lastHolidayDestination, upcomingHolidayDate, upcomingHolidayDestination,
            totalFlightsTaken, totalDistanceFlown, favoriteDestinations,
            preferredCabinClass, preferredSeatType, mealPreference, specialAssistance,
            lifetimeValue, averageBookingValue, totalBookings, customerSegment,
            testProfile,
            _recordCreatedTimestamp, _recordUpdatedTimestamp
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self.cursor.executemany(insert_sql, profiles)
        
    def insert_website_events(self, events):
        """Insert website event data into Snowflake"""
        insert_sql = """
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
        self.cursor.executemany(insert_sql, events)
    
    def insert_booking_events(self, bookings):
        """Insert booking event data into Snowflake"""
        # Using exact column names from Snowflake (all 81 columns)
        insert_sql = """
        INSERT INTO AGENTIC_TRAVEL_EVENT_BOOKING (
            CRMID, ECID, EMAIL, EMAILIDSHA256, GAID, LOYALTYID, PASSPORTID, PHONENUMBER, PUSHTOKENS, STACKCHATID,
            _ID, TIMESTAMP, EVENTTYPE,
            PNR, BOOKINGSTATUS, BOOKINGDATE, BOOKINGCHANNEL, TRIPTYPE,
            OUTBOUNDFLIGHTNUMBER, OUTBOUNDORIGIN, OUTBOUNDDESTINATION, OUTBOUNDDEPARTUREDATE, OUTBOUNDARRIVALDATE, OUTBOUNDCABINCLASS,
            RETURNFLIGHTNUMBER, RETURNORIGIN, RETURNDESTINATION, RETURNDEPARTUREDATE, RETURNARRIVALDATE, RETURNCABINCLASS,
            TOTALPASSENGERS, ADULTCOUNT, CHILDCOUNT, INFANTCOUNT,
            TOTALPRICE, BASEFARE, TAXES, FEES, CURRENCY, DISCOUNTAPPLIED, LOYALTYPOINTSUSED, LOYALTYPOINTSEARNED,
            PAYMENTMETHOD, CARDTYPE, TRANSACTIONID, PAYMENTSTATUS,
            BAGGAGECOUNT, SEATSELECTION, MEALSELECTION, INSURANCE, FASTTRACK, LOUNGEACCESS,
            _RECORDCREATEDTIMESTAMP,
            MARKETING_CHANNEL, MARKETING_CHANNEL_DETAIL, CAMPAIGN_ID, CAMPAIGN_NAME, CAMPAIGN_TYPE,
            UTM_SOURCE, UTM_MEDIUM, UTM_CAMPAIGN, UTM_CONTENT, UTM_TERM, REFERRER_DOMAIN, REFERRER_TYPE,
            PRODUCT_FINDING_METHOD, PRODUCT_SEARCH_TERM, PRODUCT_CATEGORY, PRODUCT_LIST_NAME, PRODUCT_POSITION,
            CROSS_SELL_SOURCE, RECOMMENDATION_ALGORITHM,
            TOUCHPOINTS_BEFORE_CONVERSION, DAYS_TO_CONVERSION, FIRST_TOUCH_CHANNEL, FIRST_TOUCH_TIMESTAMP,
            LAST_TOUCH_CHANNEL, ASSIST_CHANNELS, CHANNEL_PATH, IS_FIRST_TIME_CUSTOMER, PREVIOUS_BOOKING_COUNT,
            CHANNEL
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """
        self.cursor.executemany(insert_sql, bookings)
        self.insert_booking_segments(bookings)
        self._last_ancillary_count = self.insert_booking_ancillaries(bookings)

    def ensure_booking_segments_table(self):
        """Create AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS table if it does not exist."""
        create_sql = """
        CREATE TABLE IF NOT EXISTS TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS (
            SEGMENT_ID VARCHAR(100) NOT NULL,
            BOOKING_ID VARCHAR(50) NOT NULL,
            EMAIL VARCHAR(320),
            SEGMENT_NUMBER NUMBER(10,0) NOT NULL,
            SEGMENT_STATUS VARCHAR(50),
            ORIGIN VARCHAR(10),
            DESTINATION VARCHAR(10),
            DEPARTURE_DATETIME TIMESTAMP_NTZ,
            ARRIVAL_DATETIME TIMESTAMP_NTZ,
            FLIGHT_NUMBER VARCHAR(20),
            AIRLINE_CODE VARCHAR(10),
            CABIN_CLASS VARCHAR(30),
            FARE_CLASS VARCHAR(20),
            IS_RETURN_SEGMENT BOOLEAN DEFAULT FALSE,
            LASTMODIFIED TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
            _RECORDCREATEDTIMESTAMP TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            _RECORDUPDATEDTIMESTAMP TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            CONSTRAINT PK_TRAVEL_BOOKING_SEGMENTS PRIMARY KEY (SEGMENT_ID)
        )
        """
        self.cursor.execute(create_sql)

    @staticmethod
    def build_segments_from_bookings(bookings):
        """Build outbound and return segment rows from booking event tuples."""
        segments = []
        for booking in bookings:
            booking_id = booking[13]
            booking_status = booking[14]
            email = booking[2]
            outbound_flight = booking[18]
            outbound_origin = booking[19]
            outbound_destination = booking[20]
            outbound_departure = booking[21]
            outbound_arrival = booking[22]
            outbound_cabin = booking[23]
            return_flight = booking[24]
            return_origin = booking[25]
            return_destination = booking[26]
            return_departure = booking[27]
            return_arrival = booking[28]
            return_cabin = booking[29]
            # Booking tuple index 52 = _RECORDCREATEDTIMESTAMP
            lastmodified = booking[52]

            # Outbound segment
            if outbound_flight and outbound_origin and outbound_destination:
                segments.append((
                    f"{booking_id}_SEG_1",
                    booking_id,
                    email,
                    1,
                    booking_status,
                    outbound_origin,
                    outbound_destination,
                    outbound_departure,
                    outbound_arrival,
                    outbound_flight,
                    str(outbound_flight)[:2] if outbound_flight else None,
                    outbound_cabin,
                    str(outbound_cabin).upper()[:1] if outbound_cabin else None,
                    False,
                    lastmodified,
                    lastmodified,
                    lastmodified
                ))

            # Return segment
            if return_flight and return_origin and return_destination:
                segments.append((
                    f"{booking_id}_SEG_2",
                    booking_id,
                    email,
                    2,
                    booking_status,
                    return_origin,
                    return_destination,
                    return_departure,
                    return_arrival,
                    return_flight,
                    str(return_flight)[:2] if return_flight else None,
                    return_cabin,
                    str(return_cabin).upper()[:1] if return_cabin else None,
                    True,
                    lastmodified,
                    lastmodified,
                    lastmodified
                ))
        return segments

    def insert_booking_segments(self, bookings):
        """Insert segment-level travel legs derived from bookings."""
        if not bookings:
            return

        self.ensure_booking_segments_table()
        segments = self.build_segments_from_bookings(bookings)
        if not segments:
            return

        merge_sql = """
        MERGE INTO TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS t
        USING (
            SELECT
                column1 AS SEGMENT_ID,
                column2 AS BOOKING_ID,
                column3 AS EMAIL,
                column4 AS SEGMENT_NUMBER,
                column5 AS SEGMENT_STATUS,
                column6 AS ORIGIN,
                column7 AS DESTINATION,
                column8 AS DEPARTURE_DATETIME,
                column9 AS ARRIVAL_DATETIME,
                column10 AS FLIGHT_NUMBER,
                column11 AS AIRLINE_CODE,
                column12 AS CABIN_CLASS,
                column13 AS FARE_CLASS,
                column14 AS IS_RETURN_SEGMENT,
                column15 AS LASTMODIFIED,
                column16 AS _RECORDCREATEDTIMESTAMP,
                column17 AS _RECORDUPDATEDTIMESTAMP
            FROM VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ) s
        ON t.SEGMENT_ID = s.SEGMENT_ID
        WHEN MATCHED THEN UPDATE SET
            BOOKING_ID = s.BOOKING_ID,
            EMAIL = s.EMAIL,
            SEGMENT_NUMBER = s.SEGMENT_NUMBER,
            SEGMENT_STATUS = s.SEGMENT_STATUS,
            ORIGIN = s.ORIGIN,
            DESTINATION = s.DESTINATION,
            DEPARTURE_DATETIME = s.DEPARTURE_DATETIME,
            ARRIVAL_DATETIME = s.ARRIVAL_DATETIME,
            FLIGHT_NUMBER = s.FLIGHT_NUMBER,
            AIRLINE_CODE = s.AIRLINE_CODE,
            CABIN_CLASS = s.CABIN_CLASS,
            FARE_CLASS = s.FARE_CLASS,
            IS_RETURN_SEGMENT = s.IS_RETURN_SEGMENT,
            LASTMODIFIED = s.LASTMODIFIED,
            _RECORDUPDATEDTIMESTAMP = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
            SEGMENT_ID, BOOKING_ID, EMAIL, SEGMENT_NUMBER, SEGMENT_STATUS, ORIGIN, DESTINATION,
            DEPARTURE_DATETIME, ARRIVAL_DATETIME, FLIGHT_NUMBER, AIRLINE_CODE, CABIN_CLASS, FARE_CLASS,
            IS_RETURN_SEGMENT, LASTMODIFIED, _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP
        ) VALUES (
            s.SEGMENT_ID, s.BOOKING_ID, s.EMAIL, s.SEGMENT_NUMBER, s.SEGMENT_STATUS, s.ORIGIN, s.DESTINATION,
            s.DEPARTURE_DATETIME, s.ARRIVAL_DATETIME, s.FLIGHT_NUMBER, s.AIRLINE_CODE, s.CABIN_CLASS, s.FARE_CLASS,
            s.IS_RETURN_SEGMENT, s.LASTMODIFIED, s._RECORDCREATEDTIMESTAMP, s._RECORDUPDATEDTIMESTAMP
        )
        """

        # Run merge one segment at a time (simple and explicit for generated batches).
        for segment in segments:
            self.cursor.execute(merge_sql, segment)

    def ensure_ancillaries_table(self):
        """Create AGENTIC_TRAVEL_EVENT_ANCILLARIES table if it does not exist."""
        create_sql = """
        CREATE TABLE IF NOT EXISTS TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_ANCILLARIES (
            ANCILLARY_ID VARCHAR(100) NOT NULL,
            BOOKING_ID VARCHAR(50) NOT NULL,
            SEGMENT_ID VARCHAR(100),
            ANCILLARY_TYPE VARCHAR(100) NOT NULL,
            ANCILLARY_STATUS VARCHAR(50) NOT NULL,
            ANCILLARY_CATEGORY VARCHAR(100),
            ANCILLARY_DESCRIPTION VARCHAR(500),
            AMOUNT NUMBER(18,2) NOT NULL,
            CURRENCY VARCHAR(10) NOT NULL,
            CHANNEL VARCHAR(50),
            IS_REFUNDABLE BOOLEAN,
            PURCHASE_DATE TIMESTAMP_NTZ NOT NULL,
            LASTMODIFIED TIMESTAMP_NTZ NOT NULL,
            _RECORDCREATEDTIMESTAMP TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            _RECORDUPDATEDTIMESTAMP TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            CONSTRAINT PK_AGENTIC_TRAVEL_EVENT_ANCILLARIES PRIMARY KEY (ANCILLARY_ID)
        )
        """
        self.cursor.execute(create_sql)

    @staticmethod
    def _parse_ts_or_now(ts_str):
        try:
            return datetime.strptime(str(ts_str), '%Y-%m-%d %H:%M:%S.%f')
        except Exception:
            return datetime.utcnow()

    def build_ancillaries_from_bookings(self, bookings):
        """
        Build realistic ancillaries from booking events.
        Ancillaries are only created when bookings exist.
        """
        ancillaries = []

        for booking in bookings:
            booking_id = booking[13]
            booking_status = (booking[14] or "confirmed").lower()
            booking_channel = booking[16]
            booking_ts = self._parse_ts_or_now(booking[15])
            outbound_dep_ts = self._parse_ts_or_now(booking[21])
            currency = booking[38] or "GBP"
            baggage_count = int(booking[46] or 0)
            seat_selection = bool(booking[47])
            meal_selection = bool(booking[48])
            insurance = bool(booking[49])
            fast_track = bool(booking[50])
            lounge_access = bool(booking[51])
            lastmodified = booking[52]

            # For cancelled/abandoned/expired bookings, skip new ancillary purchases.
            if booking_status in ["cancelled", "abandoned", "expired"]:
                continue

            # Deterministic segment references based on generator segment IDs.
            seg_outbound = f"{booking_id}_SEG_1"
            seg_return = f"{booking_id}_SEG_2"

            candidate_items = []

            if baggage_count > 0:
                candidate_items.append({
                    "type": "checked_baggage",
                    "category": "baggage",
                    "description": f"{baggage_count} checked bag(s)",
                    "amount": round(35.0 * baggage_count, 2),
                    "segment_id": seg_outbound,
                    "refundable": False
                })
            if seat_selection:
                candidate_items.append({
                    "type": "seat_selection",
                    "category": "seat",
                    "description": "Preferred seat selection",
                    "amount": round(random.uniform(12, 55), 2),
                    "segment_id": random.choice([seg_outbound, seg_return]),
                    "refundable": True
                })
            if meal_selection:
                candidate_items.append({
                    "type": "meal_upgrade",
                    "category": "meal",
                    "description": "Premium meal selection",
                    "amount": round(random.uniform(10, 28), 2),
                    "segment_id": seg_outbound,
                    "refundable": False
                })
            if insurance:
                candidate_items.append({
                    "type": "travel_insurance",
                    "category": "insurance",
                    "description": "Travel insurance add-on",
                    "amount": round(random.uniform(18, 45), 2),
                    "segment_id": None,
                    "refundable": True
                })
            if fast_track:
                candidate_items.append({
                    "type": "fast_track_security",
                    "category": "airport_service",
                    "description": "Fast track security access",
                    "amount": round(random.uniform(15, 35), 2),
                    "segment_id": seg_outbound,
                    "refundable": False
                })
            if lounge_access:
                candidate_items.append({
                    "type": "lounge_access",
                    "category": "airport_service",
                    "description": "Airport lounge access",
                    "amount": round(random.uniform(35, 80), 2),
                    "segment_id": random.choice([seg_outbound, seg_return]),
                    "refundable": False
                })

            # Keep realistic sparsity: not every eligible ancillary is purchased.
            for idx, item in enumerate(candidate_items, start=1):
                if random.random() > 0.75:
                    continue

                purchase_ts = booking_ts + timedelta(hours=random.randint(0, 72))
                if purchase_ts > outbound_dep_ts:
                    purchase_ts = outbound_dep_ts - timedelta(hours=random.randint(2, 24))

                ancillary_id = f"ANC_{booking_id}_{idx}"
                ancillaries.append((
                    ancillary_id,
                    booking_id,
                    item["segment_id"],
                    item["type"],
                    "active",
                    item["category"],
                    item["description"],
                    item["amount"],
                    currency,
                    booking_channel,
                    item["refundable"],
                    purchase_ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                    lastmodified,
                    lastmodified,
                    lastmodified
                ))

        return ancillaries

    def insert_booking_ancillaries(self, bookings):
        """Insert ancillaries related to generated booking events."""
        if not bookings:
            return 0

        self.ensure_ancillaries_table()
        ancillaries = self.build_ancillaries_from_bookings(bookings)
        if not ancillaries:
            return 0

        merge_sql = """
        MERGE INTO TRAVEL_DATABASE.AEP_SCHEMA.AGENTIC_TRAVEL_EVENT_ANCILLARIES t
        USING (
            SELECT
                column1 AS ANCILLARY_ID,
                column2 AS BOOKING_ID,
                column3 AS SEGMENT_ID,
                column4 AS ANCILLARY_TYPE,
                column5 AS ANCILLARY_STATUS,
                column6 AS ANCILLARY_CATEGORY,
                column7 AS ANCILLARY_DESCRIPTION,
                column8 AS AMOUNT,
                column9 AS CURRENCY,
                column10 AS CHANNEL,
                column11 AS IS_REFUNDABLE,
                column12 AS PURCHASE_DATE,
                column13 AS LASTMODIFIED,
                column14 AS _RECORDCREATEDTIMESTAMP,
                column15 AS _RECORDUPDATEDTIMESTAMP
            FROM VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ) s
        ON t.ANCILLARY_ID = s.ANCILLARY_ID
        WHEN MATCHED THEN UPDATE SET
            BOOKING_ID = s.BOOKING_ID,
            SEGMENT_ID = s.SEGMENT_ID,
            ANCILLARY_TYPE = s.ANCILLARY_TYPE,
            ANCILLARY_STATUS = s.ANCILLARY_STATUS,
            ANCILLARY_CATEGORY = s.ANCILLARY_CATEGORY,
            ANCILLARY_DESCRIPTION = s.ANCILLARY_DESCRIPTION,
            AMOUNT = s.AMOUNT,
            CURRENCY = s.CURRENCY,
            CHANNEL = s.CHANNEL,
            IS_REFUNDABLE = s.IS_REFUNDABLE,
            PURCHASE_DATE = s.PURCHASE_DATE,
            LASTMODIFIED = s.LASTMODIFIED,
            _RECORDUPDATEDTIMESTAMP = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
            ANCILLARY_ID, BOOKING_ID, SEGMENT_ID, ANCILLARY_TYPE, ANCILLARY_STATUS,
            ANCILLARY_CATEGORY, ANCILLARY_DESCRIPTION, AMOUNT, CURRENCY, CHANNEL, IS_REFUNDABLE,
            PURCHASE_DATE, LASTMODIFIED, _RECORDCREATEDTIMESTAMP, _RECORDUPDATEDTIMESTAMP
        ) VALUES (
            s.ANCILLARY_ID, s.BOOKING_ID, s.SEGMENT_ID, s.ANCILLARY_TYPE, s.ANCILLARY_STATUS,
            s.ANCILLARY_CATEGORY, s.ANCILLARY_DESCRIPTION, s.AMOUNT, s.CURRENCY, s.CHANNEL, s.IS_REFUNDABLE,
            s.PURCHASE_DATE, s.LASTMODIFIED, s._RECORDCREATEDTIMESTAMP, s._RECORDUPDATEDTIMESTAMP
        )
        """

        for ancillary in ancillaries:
            self.cursor.execute(merge_sql, ancillary)

        return len(ancillaries)
    
    def generate_personalized_website_events(self, profiles, start_idx, record_created_timestamp_utc=None):
        """
        Generate MULTI-SESSION website events with realistic journey patterns
        Creates complete/incomplete booking journeys, change journeys, browsing sessions.
        _recordCreatedTimestamp is set to record_created_timestamp_utc (or now) so AEP incremental load picks up new rows.
        """
        ts = record_created_timestamp_utc if record_created_timestamp_utc is not None else datetime.utcnow()
        insert_ts = ts.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        # Airport lookup for common destinations
        dest_to_airport = {
            "Paris": "CDG", "Barcelona": "BCN", "Amsterdam": "AMS", "Rome": "FCO", "Berlin": "BER",
            "Madrid": "MAD", "Lisbon": "LIS", "Vienna": "VIE", "Prague": "PRG", "Budapest": "BUD",
            "Athens": "ATH", "Copenhagen": "CPH", "Stockholm": "ARN", "Oslo": "OSL", "Helsinki": "HEL",
            "Dublin": "DUB", "Brussels": "BRU", "Zurich": "ZRH", "Venice": "VCE", "Florence": "FLR",
            "New York": "JFK", "Los Angeles": "LAX", "Miami": "MIA", "Toronto": "YYZ", "Vancouver": "YVR",
            "Cancun": "CUN", "Mexico City": "MEX", "Buenos Aires": "EZE", "Rio de Janeiro": "GRU",
            "Dubai": "DXB", "Abu Dhabi": "AUH", "Singapore": "SIN", "Hong Kong": "HKG", "Tokyo": "NRT",
            "Bangkok": "BKK", "Bali": "DPS", "Sydney": "SYD", "Melbourne": "MEL", "Auckland": "AKL",
            "Cape Town": "CPT", "Marrakech": "RAK", "Cairo": "CAI", "Tel Aviv": "TLV", "Doha": "DOH"
        }
        
        uk_origins = ["LHR", "LGW", "LTN", "STN", "MAN", "EDI", "BHX", "GLA", "BRS", "NCL"]
        devices = ["desktop", "tablet"]
        browsers = ["Chrome", "Safari", "Firefox", "Edge"]
        os_list = ["Windows 10", "Windows 11", "macOS"]
        
        events = []
        event_id_counter = start_idx
        
        for profile in profiles:
            # Extract profile data
            crm_id = profile[0]
            ecid = profile[1]
            email = profile[2]
            email_sha = profile[3]
            gaid = profile[4]
            loyalty_id = profile[5]
            passport_id = profile[6]
            phone = profile[7]
            push_tokens = profile[8]
            stack_id = profile[9]
            upcoming_dest = profile[23]
            preferred_cabin = profile[28]
            customer_segment = profile[36]
            
            # Determine multi-session plan for this customer
            session_plan = SessionJourneyHelper.get_customer_session_plan(customer_segment)
            
            # Skip if mobile-only (handled by mobile generator)
            if session_plan['channel_preference'] == 'mobile_only':
                continue
            
            # Map destination to airport
            dest_airport = dest_to_airport.get(upcoming_dest, "CDG")
            origin_airport = random.choice(uk_origins)
            origin = upcoming_dest
            destination = upcoming_dest
            
            # Flight dates
            departure_date = datetime.now() + timedelta(days=random.randint(14, 60))
            return_date = departure_date + timedelta(days=random.randint(3, 14))
            passengers = random.randint(1, 3)
            
            # Flight price based on cabin class
            if preferred_cabin == "first":
                flight_price = round(random.uniform(1500, 4000), 2)
            elif preferred_cabin == "business":
                flight_price = round(random.uniform(800, 2500), 2)
            elif preferred_cabin == "premium_economy":
                flight_price = round(random.uniform(400, 900), 2)
            else:
                flight_price = round(random.uniform(150, 600), 2)
            
            # Generate each session for this customer
            # For 'both' channel preference, assign some sessions to web, some to mobile
            if session_plan['channel_preference'] == 'both':
                # Determine which sessions are web (use rounding to preserve multi-session patterns)
                # For small session counts, ensure we keep at least half as web
                total_sessions = len(session_plan['session_types'])
                if total_sessions == 1:
                    num_web_sessions = 1  # Single session = web
                elif total_sessions == 2:
                    num_web_sessions = 1  # 2 sessions: 1 web, 1 mobile
                elif total_sessions == 3:
                    num_web_sessions = 2  # 3 sessions: 2 web, 1 mobile (preserve multi-session)
                else:
                    num_web_sessions = max(2, round(total_sessions * 0.6))  # 4+ sessions: 60% web, min 2
                web_session_indices = set(random.sample(range(total_sessions), num_web_sessions))
            else:
                # All sessions are web for web_only customers
                web_session_indices = set(range(len(session_plan['session_types'])))
            
            for session_num, session_type in enumerate(session_plan['session_types']):
                
                # Skip if this session was assigned to mobile channel
                if session_num not in web_session_indices:
                    continue
                
                # Session metadata
                session_id = f"WEB_SESSION_{crm_id[3:]}_{session_num}"
                device = random.choice(devices)
                browser = random.choice(browsers)
                os = random.choice(os_list)
                
                # Base timestamp - spread sessions over days AND hours throughout each day
                days_offset = session_num * random.randint(1, 5)  # 1-5 days between sessions
                # Use realistic timestamp with varied hours (6 AM to 11 PM for web activity)
                base_timestamp_dt = self.generate_realistic_timestamp(days_ago=days_offset, hour_range=(6, 23))
                
                # Marketing attribution per session
                attribution = AttributionHelper.assign_marketing_channel(is_mobile=False)
                
                # Generate journey based on session type
                if session_type == 'booking_complete':
                    journey_events = SessionJourneyHelper.generate_web_booking_journey_complete(
                        origin, destination, origin_airport, dest_airport,
                        departure_date, return_date, passengers, preferred_cabin
                    )
                elif session_type == 'booking_incomplete':
                    journey_events = SessionJourneyHelper.generate_web_booking_journey_incomplete(
                        origin, destination, origin_airport, dest_airport,
                        departure_date, return_date, passengers, preferred_cabin
                    )
                elif session_type == 'search_research':
                    journey_events = SessionJourneyHelper.generate_web_search_research_journey(
                        origin, destination, origin_airport, dest_airport,
                        departure_date, return_date, passengers, preferred_cabin
                    )
                elif session_type == 'browse_only':
                    journey_events = SessionJourneyHelper.generate_web_browse_only_journey()
                elif session_type == 'account_management':
                    journey_events = SessionJourneyHelper.generate_web_account_journey()
                elif session_type == 'change_complete':
                    journey_events = SessionJourneyHelper.generate_web_change_journey_complete()
                elif session_type == 'change_incomplete':
                    journey_events = SessionJourneyHelper.generate_web_change_journey_incomplete()
                else:
                    journey_events = SessionJourneyHelper.generate_web_browse_only_journey()
                
                # Convert journey events to database event tuples
                for event_data in journey_events:
                    event_timestamp_dt = base_timestamp_dt + timedelta(seconds=event_data['time_offset'])
                    event_timestamp = event_timestamp_dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                    
                    # Determine action
                    if 'pageView' in event_data['event_type']:
                        action = 'view'
                    elif 'search' in event_data['event_type']:
                        action = 'search'
                    elif 'booking' in event_data['event_type']:
                        action = 'booking'
                    elif 'login' in event_data['event_type']:
                        action = 'login'
                    elif 'change' in event_data['event_type'] or 'upgrade' in event_data['event_type']:
                        action = 'change'
                    else:
                        action = 'click'
                    
                    # Get funnel metadata for this page
                    funnel_meta = SessionJourneyHelper.get_funnel_metadata(event_data['page_name'])
                    
                    # Determine if ancillary funnel should be generated for this event
                    # Only generate ancillary funnels during booking/change flows
                    ancillary_item_name = None
                    ancillary_item_price = None
                    ancillary_item_category = None
                    
                    if session_type in ['booking_complete', 'booking_incomplete', 'change_complete', 'change_incomplete']:
                        should_gen_ancillary, anc_funnel_type, anc_conv_rate = SessionJourneyHelper.should_generate_ancillary_funnel('web')
                        
                        if should_gen_ancillary:
                            # Override main funnel with ancillary funnel
                            # Determine which step in the ancillary funnel based on page type
                            if 'booking-step-1' in event_data['page_name'] or 'change-options' in event_data['page_name']:
                                # Offer viewed
                                anc_step = SessionJourneyHelper.get_ancillary_funnel_step(anc_funnel_type, 0)
                                anc_item = SessionJourneyHelper.get_ancillary_item_details(anc_funnel_type)
                                funnel_meta = {'funnel': anc_funnel_type, 'step': anc_step['step'], 
                                             'number': anc_step['number'], 'status': anc_step['status']}
                                ancillary_item_name = anc_item['item_name']
                                ancillary_item_price = anc_item['price']
                                ancillary_item_category = anc_item['category']
                            elif 'booking-step-2' in event_data['page_name']:
                                # Item selected / payment
                                anc_step = SessionJourneyHelper.get_ancillary_funnel_step(anc_funnel_type, 5)
                                anc_item = SessionJourneyHelper.get_ancillary_item_details(anc_funnel_type)
                                funnel_meta = {'funnel': anc_funnel_type, 'step': anc_step['step'], 
                                             'number': anc_step['number'], 'status': anc_step['status']}
                                ancillary_item_name = anc_item['item_name']
                                ancillary_item_price = anc_item['price']
                                ancillary_item_category = anc_item['category']
                            elif 'complete' in event_data['page_name']:
                                # Purchase completed (if conversion succeeds)
                                if random.random() < anc_conv_rate:
                                    anc_step = SessionJourneyHelper.get_ancillary_funnel_step(anc_funnel_type, 6)
                                    anc_item = SessionJourneyHelper.get_ancillary_item_details(anc_funnel_type)
                                    funnel_meta = {'funnel': anc_funnel_type, 'step': anc_step['step'], 
                                                 'number': anc_step['number'], 'status': 'completed'}
                                    ancillary_item_name = anc_item['item_name']
                                    ancillary_item_price = anc_item['price']
                                    ancillary_item_category = anc_item['category']
                    
                    event = (
                        # Identity
                        crm_id, ecid, email, email_sha, gaid, loyalty_id, passport_id, phone, push_tokens, stack_id,
                        
                        # Event Metadata
                        f"WEB{event_id_counter}",
                        event_timestamp,
                        event_data['event_type'],
                        
                        # Page Details
                        f"https://{event_data['page_url']}",
                        event_data['page_name'],
                        event_data['page_type'],
                        "https://google.com" if len(events) == 0 else f"https://{event_data['page_url']}",
                        
                        # Search Details
                        event_data.get('search_term'),
                        origin_airport if event_data.get('search_term') else None,
                        dest_airport if event_data.get('search_term') else None,
                        departure_date.strftime('%Y-%m-%d') if event_data.get('search_term') else None,
                        return_date.strftime('%Y-%m-%d') if event_data.get('search_term') else None,
                        passengers if event_data.get('search_term') else None,
                        preferred_cabin if event_data.get('search_term') else None,
                        random.randint(10, 50) if event_data['event_type'] == 'flight.search' else None,
                        
                        # Flight Viewed
                        event_data.get('flight_number'),
                        origin_airport if event_data.get('flight_number') else None,
                        dest_airport if event_data.get('flight_number') else None,
                        (departure_date + timedelta(hours=random.randint(6, 22))).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3] if event_data.get('flight_number') else None,
                        flight_price if event_data.get('flight_number') else None,
                        "GBP" if event_data.get('flight_number') else None,
                        
                        # Interaction Details
                        action,
                        f"btn_{action}",
                        random.randint(45, 300) if customer_segment in ["diamond", "platinum"] else random.randint(20, 120),
                        
                        # Session Details
                        session_id,
                        device,
                        browser,
                        os,
                        
                        # Metadata: _recordCreatedTimestamp = insert time so AEP incremental load picks up new rows
                        insert_ts,
                        
                        # Marketing Attribution
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
                        funnel_meta['status'],
                        
                        # Ancillary Product Data (NEW)
                        ancillary_item_name,
                        ancillary_item_price,
                        ancillary_item_category,
                        
                        # Channel
                        'web'  # CHANNEL
                    )
                    
                    events.append(event)
                    event_id_counter += 1
        
        return events
    
    def generate_personalized_booking_events(self, profiles, start_idx, use_current_time_for_ingestion=False):
        """
        Generate booking events that match each customer's profile and website searches
        Creates realistic bookings based on preferences, segment, and browsing behavior.

        use_current_time_for_ingestion: If True (e.g. when generating NEW profiles), event
        timestamp and bookingDate are set to current time so AEP incremental load (by
        _RECORDCREATEDTIMESTAMP) picks up the data. _RECORDCREATEDTIMESTAMP is always set
        to actual insert time so new rows are never skipped.
        """
        # Airport lookup
        dest_to_airport = {
            "Paris": "CDG", "Barcelona": "BCN", "Amsterdam": "AMS", "Rome": "FCO", "Berlin": "BER",
            "Madrid": "MAD", "Lisbon": "LIS", "Vienna": "VIE", "Prague": "PRG", "Budapest": "BUD",
            "Athens": "ATH", "Copenhagen": "CPH", "Stockholm": "ARN", "Oslo": "OSL", "Helsinki": "HEL",
            "Dublin": "DUB", "Brussels": "BRU", "Zurich": "ZRH", "Venice": "VCE", "Florence": "FLR",
            "New York": "JFK", "Los Angeles": "LAX", "Miami": "MIA", "Toronto": "YYZ", "Vancouver": "YVR",
            "Cancun": "CUN", "Mexico City": "MEX", "Buenos Aires": "EZE", "Rio de Janeiro": "GRU",
            "Dubai": "DXB", "Abu Dhabi": "AUH", "Singapore": "SIN", "Hong Kong": "HKG", "Tokyo": "NRT",
            "Bangkok": "BKK", "Bali": "DPS", "Sydney": "SYD", "Melbourne": "MEL", "Auckland": "AKL",
            "Cape Town": "CPT", "Marrakech": "RAK", "Cairo": "CAI", "Tel Aviv": "TLV", "Doha": "DOH"
        }
        
        uk_origins = ["LHR", "LGW", "LTN", "STN", "MAN", "EDI", "BHX", "GLA"]
        # Payment methods and card types are now determined dynamically based on customer segment and channel
        
        bookings = []
        for profile in profiles:
            # Extract profile data
            crm_id = profile[0]
            ecid = profile[1]
            email = profile[2]
            email_sha = profile[3]
            gaid = profile[4]
            loyalty_id = profile[5]
            passport_id = profile[6]
            phone = profile[7]
            push_tokens = profile[8]
            stack_id = profile[9]
            
            # Get their travel details (indices: 24=upcomingHolidayDestination, 28=preferredCabinClass, 33=avgBookingValue, 35=customerSegment)
            upcoming_dest = profile[24] if len(profile) > 24 else profile[23]
            preferred_cabin = profile[28] if len(profile) > 28 and profile[28] is not None else 'economy'
            meal_pref = profile[30] if len(profile) > 30 else None
            avg_booking_value = profile[33] if len(profile) > 33 else (profile[34] if len(profile) > 34 else None)
            if avg_booking_value is None or (isinstance(avg_booking_value, (int, float)) and float(avg_booking_value) <= 0):
                avg_booking_value = round(random.uniform(350, 1200), 2)  # default for enrich when NULL in DB
            else:
                avg_booking_value = float(avg_booking_value)  # Snowflake returns Decimal; need float for * with random
            customer_segment = profile[35] if len(profile) > 35 else (profile[36] if len(profile) > 36 else 'silver')
            if customer_segment is None:
                customer_segment = 'silver'
            # If upcoming_dest is a date (wrong column), use default; otherwise map city to airport
            if upcoming_dest is None or (hasattr(upcoming_dest, 'strftime') and callable(getattr(upcoming_dest, 'strftime', None))):
                destination_airport = "CDG"
            else:
                destination_airport = dest_to_airport.get(str(upcoming_dest).strip(), "CDG") or "CDG"
            origin_airport = random.choice(uk_origins)
            
            # Booking timing (premium customers book earlier)
            if customer_segment in ["diamond", "platinum"]:
                booking_offset_days = random.randint(30, 90)
            else:
                booking_offset_days = random.randint(14, 60)
            
            # Actual insert time (used for _RECORDCREATEDTIMESTAMP so AEP incremental load always picks up new rows)
            insert_time = datetime.utcnow()
            # Event/booking time: either "now" (for new-profile runs so AEP sees today's data) or variable (enrich)
            if use_current_time_for_ingestion:
                booking_time = insert_time
            else:
                booking_days_ago = random.randint(0, 30)
                booking_time = self.generate_realistic_timestamp(days_ago=booking_days_ago, hour_range=(8, 22))
            outbound_dep = datetime.now() + timedelta(days=booking_offset_days)
            outbound_arr = outbound_dep + timedelta(hours=random.randint(2, 12))
            return_dep = outbound_dep + timedelta(days=random.randint(5, 14))
            return_arr = return_dep + timedelta(hours=random.randint(2, 12))
            
            # Passenger count based on segment
            if customer_segment in ["diamond", "platinum"]:
                passenger_mix = random.choice([(1, 0, 0), (2, 0, 0), (2, 1, 0)])  # Solo, couple, or small family
            else:
                passenger_mix = random.choice([(1, 0, 0), (2, 0, 0), (2, 1, 0), (2, 2, 0)])  # More variety
            
            adults, children, infants = passenger_mix
            total_pax = adults + children + infants
            
            # Pricing based on THEIR preferred cabin and segment
            # Use their average booking value as a base
            base_fare = round(avg_booking_value * random.uniform(0.7, 0.95), 2)  # Base fare is ~80% of total
            taxes = round(base_fare * random.uniform(0.15, 0.25), 2)
            fees = round(random.uniform(20, 60), 2)
            
            # Discounts (budget travelers get more discounts)
            if customer_segment in ["bronze", "silver"]:
                discount = round(random.uniform(0, base_fare * 0.20), 2) if random.random() < 0.4 else 0
            else:
                discount = 0  # Premium customers pay full price for premium service
            
            total_price = round((base_fare + taxes + fees - discount) * total_pax, 2)
            
            # Loyalty points (higher tiers use and earn more)
            if customer_segment in ["diamond", "platinum"]:
                points_used = random.randint(0, 10000) if random.random() > 0.6 else 0
                points_earned = int(total_price * random.uniform(1.5, 3.0))
            elif customer_segment == "gold":
                points_used = random.randint(0, 5000) if random.random() > 0.7 else 0
                points_earned = int(total_price * random.uniform(1.0, 2.0))
            else:
                points_used = 0
                points_earned = int(total_price * random.uniform(0.5, 1.0))
            
            # Ancillary services (premium cabins and segments get more)
            if preferred_cabin in ["first", "business"]:
                has_baggage = True  # Included
                has_seat_sel = True  # Included
                has_meal = True  # Included
                has_insurance = random.random() > 0.3
                has_fast_track = random.random() > 0.2
                has_lounge = random.random() > 0.2
            elif preferred_cabin == "premium_economy":
                has_baggage = random.random() > 0.2
                has_seat_sel = random.random() > 0.3
                has_meal = random.random() > 0.4
                has_insurance = random.random() > 0.5
                has_fast_track = random.random() > 0.7
                has_lounge = random.random() > 0.8
            else:  # economy
                has_baggage = random.random() > 0.5
                has_seat_sel = random.random() > 0.6
                has_meal = random.random() > 0.7
                has_insurance = random.random() > 0.7
                has_fast_track = random.random() > 0.9
                has_lounge = random.random() > 0.95
            
            # Flight numbers
            outbound_flight = f"BA{random.randint(100, 999)}"
            return_flight = f"BA{random.randint(100, 999)}"
            
            # Channel (premium customers use different channels)
            if customer_segment in ["diamond", "platinum"]:
                channel = random.choice(["website", "mobile_app", "call_center"])  # May call for premium service
            else:
                channel = random.choice(["website", "mobile_app"])  # Self-service
            
            # REALISTIC PAYMENT METHOD & STATUS SELECTION
            # Payment method varies by channel, segment, and demographics
            
            # Mobile app users more likely to use digital wallets
            if channel == "mobile_app":
                # Younger travelers (age 21-40) prefer digital wallets
                # Older travelers (age 40+) prefer cards
                # Handle both string and datetime.date formats
                dob = profile[12]
                if isinstance(dob, str):
                    age = datetime.now().year - int(dob.split('-')[0])
                else:  # datetime.date object
                    age = datetime.now().year - dob.year
                
                if age < 35:  # Younger = digital native
                    payment_method = random.choices(
                        ["credit_card", "debit_card", "apple_pay", "google_pay", "paypal"],
                        weights=[20, 25, 30, 20, 5]  # High digital wallet usage
                    )[0]
                elif age < 50:  # Middle age = mixed
                    payment_method = random.choices(
                        ["credit_card", "debit_card", "apple_pay", "google_pay", "paypal"],
                        weights=[35, 30, 15, 10, 10]  # Balanced
                    )[0]
                else:  # Older = traditional
                    payment_method = random.choices(
                        ["credit_card", "debit_card", "paypal"],
                        weights=[50, 40, 10]  # Prefer cards
                    )[0]
            
            # Website users more balanced
            elif channel == "website":
                if customer_segment in ["diamond", "platinum"]:
                    # Premium customers prefer credit cards for points/protection
                    payment_method = random.choices(
                        ["credit_card", "debit_card", "paypal", "apple_pay"],
                        weights=[60, 15, 15, 10]
                    )[0]
                else:
                    # Budget travelers use debit cards and digital wallets more
                    payment_method = random.choices(
                        ["credit_card", "debit_card", "paypal", "apple_pay", "google_pay"],
                        weights=[30, 35, 20, 10, 5]
                    )[0]
            
            # Call center bookings = traditional payment methods
            else:  # call_center
                payment_method = random.choices(
                    ["credit_card", "debit_card", "bank_transfer"],
                    weights=[70, 25, 5]  # Mostly cards over phone
                )[0]
            
            # Card type (only relevant for card payments)
            if payment_method in ["credit_card", "debit_card"]:
                if customer_segment in ["diamond", "platinum"]:
                    # Premium customers use premium cards (Amex, high-end Visa/MC)
                    card_type = random.choices(
                        ["amex", "visa", "mastercard"],
                        weights=[50, 30, 20]  # Amex preferred for premium
                    )[0]
                else:
                    # Standard customers use standard cards
                    card_type = random.choices(
                        ["visa", "mastercard", "amex", "discover"],
                        weights=[45, 40, 10, 5]
                    )[0]
            else:
                card_type = None  # No card type for digital wallets/PayPal/bank transfer
            
            # REALISTIC BOOKING STATUS & PAYMENT STATUS
            # Create a realistic distribution of booking journey outcomes
            
            # First, determine the booking outcome (what actually happened)
            # This varies by customer segment and price sensitivity
            
            if customer_segment in ["diamond", "platinum"]:
                # Premium customers rarely abandon (decisive, can afford it)
                booking_outcome = random.choices(
                    ["complete_booking", "abandon_at_payment", "abandon_at_review", "expire_hold"],
                    weights=[93, 3, 3, 1]  # 93% complete bookings
                )[0]
            elif customer_segment == "gold":
                # Gold customers sometimes hesitate
                booking_outcome = random.choices(
                    ["complete_booking", "abandon_at_payment", "abandon_at_review", "expire_hold"],
                    weights=[88, 5, 5, 2]  # 88% complete bookings
                )[0]
            else:  # silver, bronze
                # Budget travelers abandon more (price sensitivity, comparison shopping)
                booking_outcome = random.choices(
                    ["complete_booking", "abandon_at_payment", "abandon_at_review", "expire_hold"],
                    weights=[80, 8, 10, 2]  # 80% complete bookings, 18% abandon
                )[0]
            
            # Now set payment status and booking status based on the outcome
            if booking_outcome == "complete_booking":
                # They decided to book - now did payment succeed?
                if customer_segment in ["diamond", "platinum"]:
                    # Premium: high payment success rate
                    payment_status = random.choices(
                        ["completed", "pending", "processing", "failed"],
                        weights=[95, 3, 1.5, 0.5]
                    )[0]
                elif customer_segment == "gold":
                    payment_status = random.choices(
                        ["completed", "pending", "processing", "failed"],
                        weights=[92, 4, 2, 2]
                    )[0]
                else:
                    payment_status = random.choices(
                        ["completed", "pending", "processing", "failed"],
                        weights=[88, 5, 3, 4]
                    )[0]
                
                # Set booking status from payment result
                if payment_status == "completed":
                    # Most confirmed bookings stay confirmed, but some get modified/refunded later
                    booking_status = random.choices(
                        ["confirmed", "modified", "refunded"],
                        weights=[92, 6, 2]  # 92% stay confirmed
                    )[0]
                elif payment_status in ["pending", "processing"]:
                    booking_status = "pending"
                else:  # payment failed
                    booking_status = "cancelled"
            
            elif booking_outcome == "abandon_at_payment":
                # User got to payment page but didn't submit
                booking_status = "abandoned"
                payment_status = "not_attempted"  # Never tried to pay
                
            elif booking_outcome == "abandon_at_review":
                # User reviewed booking but abandoned before payment page
                booking_status = "abandoned"
                payment_status = "not_attempted"
                
            else:  # expire_hold
                # Booking was held (e.g., seat reservation) but expired
                booking_status = "expired"
                payment_status = "not_attempted"
            
            # Ensure booking status and return flight airports are never None/empty (for Analytics dimensions)
            booking_status = (booking_status or "confirmed").strip() if isinstance(booking_status, str) else "confirmed"
            origin_airport = (origin_airport or random.choice(uk_origins)).strip() if isinstance(origin_airport, str) else random.choice(uk_origins)
            destination_airport = (destination_airport or "CDG").strip() if isinstance(destination_airport, str) else "CDG"
            
            # Set event type based on booking status
            if booking_status == "confirmed":
                event_type = "booking.completed"
            elif booking_status in ["pending", "cancelled"]:
                event_type = "booking.pending"
            elif booking_status == "abandoned":
                event_type = "booking.abandoned"
            elif booking_status == "expired":
                event_type = "booking.expired"
            elif booking_status == "modified":
                event_type = "booking.modified"
            elif booking_status == "refunded":
                event_type = "booking.refunded"
            else:
                event_type = "booking.completed"
            
            # PHASE 1A: Generate marketing attribution
            attribution = AttributionHelper.assign_marketing_channel(is_mobile=(channel == 'mobile_app'))
            
            # PHASE 1A: Generate product finding/merchandising data
            product_finding = AttributionHelper.generate_product_finding_method(
                customer_segment=customer_segment,
                cabin_class=preferred_cabin
            )
            
            # PHASE 1A: Generate customer journey/conversion path
            # Determine if first time customer (no previous bookings in profile)
            is_first_timer = (previous_booking_count == 0) if 'previous_booking_count' in locals() else True
            journey = AttributionHelper.generate_customer_journey(
                customer_segment=customer_segment,
                is_first_time_customer=is_first_timer
            )
            
            booking = (
                # Identity (same as profile)
                crm_id, ecid, email, email_sha, gaid, loyalty_id, passport_id, phone, push_tokens, stack_id,
                
                # Event Metadata
                f"BOOKING{crm_id[3:]}",
                booking_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],  # Use realistic staggered timestamp
                event_type,  # Now varies: booking.completed, booking.abandoned, booking.expired, etc.
                
                # Booking Details
                f"PNR{crm_id[3:]}",
                booking_status,  # Now varies: confirmed, pending, cancelled, abandoned, expired, modified, refunded
                booking_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                channel,
                "round_trip",
                
                # Outbound Flight (to their upcoming destination!)
                outbound_flight,
                origin_airport,
                destination_airport,
                outbound_dep.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                outbound_arr.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                preferred_cabin,  # Using THEIR preferred cabin!
                
                # Return Flight
                return_flight,
                destination_airport,
                origin_airport,
                return_dep.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                return_arr.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                preferred_cabin,  # Same cabin for return
                
                # Passenger Details
                total_pax, adults, children, infants,
                
                # Pricing (matches their average booking value!)
                total_price, base_fare, taxes, fees, "GBP", discount, points_used, points_earned,
                
                # Payment (NOW REALISTIC & VARIED!)
                payment_method,  # credit_card, debit_card, paypal, apple_pay, google_pay, bank_transfer
                card_type,  # amex, visa, mastercard, discover (or None for digital wallets)
                f"TXN{crm_id[3:]}",
                payment_status,  # completed, pending, processing, failed
                
                # Ancillary Services (based on their cabin class)
                random.randint(1, 2) if has_baggage else 0,
                has_seat_sel,
                has_meal,
                has_insurance,
                has_fast_track,
                has_lounge,
                
                # Metadata: _RECORDCREATEDTIMESTAMP = actual insert time so AEP incremental load picks up every new row
                insert_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                
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
                
                # PHASE 1A: Product Finding/Merchandising Fields
                product_finding['product_finding_method'],
                product_finding['product_search_term'],
                product_finding['product_category'],
                product_finding['product_list_name'],
                product_finding['product_position'],
                product_finding['cross_sell_source'],
                product_finding['recommendation_algorithm'],
                
                # PHASE 1A: Conversion Path/Journey Fields
                journey['touchpoints_before_conversion'],
                journey['days_to_conversion'],
                journey['first_touch_channel'],
                journey['first_touch_timestamp'],
                journey['last_touch_channel'],
                journey['assist_channels'],  # ARRAY
                journey['channel_path'],
                journey['is_first_time_customer'],
                journey['previous_booking_count'],
                
                # Channel field (for standardized event tracking)
                channel  # Maps to CHANNEL column
            )
            bookings.append(booking)
        
        return bookings
    
    def generate_and_insert(self, profile_count=1, verbose=True, auto_close=True):
        """
        Main function to generate and insert all data
        NOW WITH REALISTIC CUSTOMER JOURNEYS!
        Events are personalized to match each customer's profile preferences.
        
        Args:
            profile_count: Number of profiles to create
            verbose: Print progress messages
            auto_close: Automatically close connection (set to False if reusing connection)
            
        Returns:
            dict with counts of records inserted
        """
        try:
            self.connect()
            
            if verbose:
                print(f"Generating {profile_count} profiles...")
            
            start_idx = self.get_next_customer_id()
            email_counter = self.get_daily_email_counter()
            
            if verbose:
                today = datetime.now().strftime("%d%m%Y")
                print(f"Today's date: {today}")
                print(f"Starting email counter: {email_counter}")
            
            # STEP 1: Generate BASE profiles first (simplified foundational data)
            if verbose:
                print(f"Generating {profile_count} BASE profiles...")
            base_profiles = self.generate_base_profiles(profile_count, start_idx, email_counter)
            
            if verbose:
                print(f"Inserting {len(base_profiles)} BASE profiles...")
            self.insert_base_profiles(base_profiles)
            
            if verbose:
                print("✅ Base profiles inserted!")
            
            # STEP 2: Generate FULL profiles with all travel data (matching base profile names)
            if verbose:
                print(f"Generating {profile_count} FULL profiles (matching base profile data)...")
            profiles = self.generate_profiles(profile_count, start_idx, email_counter, base_profiles=base_profiles)
            
            # Now generate events BASED ON the profile data for realistic journeys
            # Use single insert time for _recordCreatedTimestamp so AEP incremental load picks up all new rows
            insert_time = datetime.utcnow()
            website_events = self.generate_personalized_website_events(profiles, start_idx, record_created_timestamp_utc=insert_time)
            booking_events = self.generate_personalized_booking_events(profiles, start_idx, use_current_time_for_ingestion=True)
            
            # Insert data
            if verbose:
                print(f"Inserting {len(profiles)} profiles...")
            self.insert_profiles(profiles)
            
            if verbose:
                print(f"Inserting {len(website_events)} website events...")
            self.insert_website_events(website_events)
            
            if verbose:
                print(f"Inserting {len(booking_events)} booking events...")
            self.insert_booking_events(booking_events)
            
            if verbose:
                print("✅ Data inserted successfully!")
            
            # Extract identity information from profiles
            email_list = [p[2] for p in profiles]  # email is 3rd field (index 2)
            crm_ids = [p[0] for p in profiles]  # crmId is 1st field (index 0)
            ecids = [p[1] for p in profiles]  # ecid is 2nd field (index 1)
            
            result = {
                'success': True,
                'base_profiles': len(base_profiles),
                'profiles': len(profiles),
                'website_events': len(website_events),
                'booking_events': len(booking_events),
                'ancillary_events': self._last_ancillary_count,
                'start_index': start_idx,
                'emails': email_list,
                'crm_ids': crm_ids,
                'ecids': ecids,
                'journey_flags': self._journey_flags  # Include journey flags for Phase 2/3
            }
            
            return result
            
        except Exception as e:
            if verbose:
                print(f"❌ Error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if auto_close:
                self.disconnect()
    
    def close(self):
        """Manually close the connection"""
        self.disconnect()


# CLI usage
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate travel data for AEP')
    parser.add_argument('--count', type=int, default=1, help='Number of profiles to generate (default: 1)')
    args = parser.parse_args()
    
    print("=" * 80)
    print("🎯 AGENTIC TRAVEL DATA GENERATOR")
    print("=" * 80)
    print()
    
    generator = TravelDataGenerator()
    result = generator.generate_and_insert(args.count)
    
    if result['success']:
        print()
        print("=" * 80)
        print("✅ SUCCESS!")
        print("=" * 80)
        print(f"Base profiles created: {result['base_profiles']}")
        print(f"Full profiles created: {result['profiles']}")
        print(f"Website events created: {result['website_events']}")
        print(f"Booking events created: {result['booking_events']}")
        print(f"Starting CRM ID: CRM{result['start_index']}")
        print()
    else:
        print()
        print("=" * 80)
        print("❌ FAILED")
        print("=" * 80)
        print(f"Error: {result['error']}")
        print()
        sys.exit(1)
