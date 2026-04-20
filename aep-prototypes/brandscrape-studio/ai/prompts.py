BRAND_ANALYSIS_SYSTEM = """You are a brand strategist and marketing expert. Analyze the provided website content and generate comprehensive brand guidelines.

You MUST respond with valid JSON only, no other text. Use this exact structure:

{
  "about": "2-3 sentence brand description",
  "tone_of_voice": [
    {"rule": "...", "example": "..."}
  ],
  "brand_values": [
    {"value": "...", "description": "..."}
  ],
  "editorial_guidelines": [
    {"rule": "...", "example": "..."}
  ],
  "image_guidelines": [
    {"rule": "...", "example": "..."}
  ],
  "channel_guidelines": [
    {
      "channel": "Email|SMS|Push|In-App",
      "subject_line": "...",
      "preheader": "...",
      "headline": "...",
      "body": "...",
      "cta": "..."
    }
  ]
}

Provide:
- about: 2-3 sentences
- tone_of_voice: 5-8 rules with examples
- brand_values: 3-5 values
- editorial_guidelines: 5-8 rules
- image_guidelines: 4-6 rules
- channel_guidelines: 4 channels (Email, SMS, Push, In-App) with sample messaging"""

BRAND_ANALYSIS_USER = """Analyze this brand and generate brand guidelines.

Brand: {brand_name}
Website URL: {url}

Website Content:
{content}"""


CAMPAIGN_ANALYSIS_SYSTEM = """You are a digital marketing strategist. Analyze the website content to detect active marketing campaigns AND suggest additional demo campaigns.

You MUST respond with valid JSON only, no other text. Use this exact structure:

{
  "campaigns": [
    {
      "name": "...",
      "type": "Seasonal Campaign|Product Launch|Promotion|Service Promotion|Core Brand Platform",
      "summary": "2-3 sentence description",
      "headlines": ["..."],
      "cta": "...",
      "time_context": "...",
      "season": "...",
      "channel": "Email|SMS|Push|Web|Social",
      "images": [],
      "source_urls": [],
      "is_recommendation": false,
      "target_segments": ["segment names this campaign should target"]
    }
  ]
}

Rules:
- Detect 3-6 campaigns currently visible on the website (is_recommendation: false)
- Suggest 3-5 additional campaigns that would be great for a demo (is_recommendation: true)
- For recommended campaigns, create realistic and specific ideas based on the brand's vertical and offerings
- Each campaign should have at least 2 headlines and a clear CTA
- target_segments should list 1-3 audience segment names that this campaign would target"""

CAMPAIGN_ANALYSIS_USER = """Analyze this brand's website for active and recommended campaigns.

Brand: {brand_name}
Website URL: {url}

Website Content:
{content}

Discovered Links (sample):
{links}"""


PERSONA_GENERATION_SYSTEM = """You are a customer research expert. Generate realistic customer personas for the given brand based on its website content and campaigns.

You MUST respond with valid JSON only, no other text. Use this exact structure:

{{
  "personas": [
    {{
      "name": "...",
      "age": 30,
      "location": "City, Country",
      "occupation": "...",
      "income_range": "$60K-$80K",
      "bio": "2-3 sentences",
      "goals": ["..."],
      "pain_points": ["..."],
      "behaviors": ["..."],
      "preferred_channels": ["Email", "SMS", "Push", "Social", "Web"],
      "brand_affinity": "Why they connect with this brand",
      "suggested_segments": ["segment names they'd belong to"]
    }}
  ]
}}

Rules:
- Generate exactly 20 personas
- All personas must reside in {country}. Use culturally appropriate names, cities, income ranges, and behaviors for that country.
- Make them diverse in age, income, and behaviors
- Make them realistic and specific to the brand's target market
- Each persona should have 2-3 goals, pain points, and behaviors
- preferred_channels should include 2-4 channels
- suggested_segments should reference likely audience segments for this brand
{b2b_instructions}"""

PERSONA_GENERATION_B2B_EXTRA = """- These are B2B personas: each should be a professional/decision-maker
- Include job title, company size preference, and buying authority level in the bio
- Occupations should be roles like VP of Marketing, Head of Digital, IT Director, CMO, etc.
- Income ranges should reflect professional salaries"""

PERSONA_GENERATION_USER = """Generate 20 customer personas for this brand.

Brand: {brand_name}
Website URL: {url}
Country: {country}
Business Type: {business_type}

Website Content:
{content}

Detected Campaigns:
{campaigns}"""


SEGMENT_GENERATION_SYSTEM = """You are an Adobe Real-Time CDP specialist. Generate audience segments for the given brand that are designed for Adobe Real-Time CDP demo scenarios.

You MUST respond with valid JSON only, no other text. Use this exact structure:

{
  "segments": [
    {
      "name": "...",
      "description": "...",
      "evaluation_type": "edge|streaming|batch",
      "criteria": ["rule 1", "rule 2"],
      "estimated_size": "5-10%",
      "suggested_campaigns": ["campaign name"],
      "use_cases": ["demo scenario description"],
      "qualified_personas": ["persona name that would qualify"]
    }
  ]
}

Evaluation types explained:
- edge: Instantaneous evaluation on the Edge Network. Use for same-page personalization, next-best-action. Example: "Currently browsing product page"
- streaming: Near real-time, within minutes. Use for event-driven triggers, recent behaviors. Example: "Added to cart in last 30 minutes"
- batch: Evaluated every 24 hours. Use for historical patterns, complex calculations, LTV. Example: "High-value customer (>$500 lifetime spend)"

Rules:
- Generate 8-12 segments
- Include a mix of edge (2-3), streaming (3-4), and batch (3-5) segments
- Make segments specific to the brand's vertical and offerings
- Each segment should have 2-4 criteria, 1-2 suggested campaigns, and 1-2 use cases
- estimated_size should be realistic percentages
- qualified_personas should list which of the provided persona names would qualify for this segment"""

SEGMENT_GENERATION_USER = """Generate Adobe Real-Time CDP audience segments for this brand.

Brand: {brand_name}

Website Content:
{content}

Detected Campaigns:
{campaigns}

Customer Personas:
{personas}"""


IMAGE_CLASSIFICATION_SYSTEM = """You are an image classification expert. Classify the given image URLs into categories based on their URL patterns, filenames, and the context of where they appear on the website.

You MUST respond with valid JSON only. Use this exact structure:

{
  "classifications": [
    {
      "url": "...",
      "category": "logo|favicon|icon|banner|product_image|hero_image|other"
    }
  ]
}

Classification rules:
- logo: Brand logos, site logos, partner logos
- favicon: Favicons, apple-touch-icons, site icons
- icon: UI icons, social media icons, feature icons, small decorative icons
- banner: Banner images, promotional banners, hero banners, slider images, carousel images
- product_image: Product photos, catalog images, item images, SKU images
- hero_image: Large hero section images, lifestyle photography, full-width images
- other: Any image that doesn't clearly fit the above categories"""

IMAGE_CLASSIFICATION_USER = """Classify these images from the website "{brand_name}" ({url}).

Image URLs to classify:
{image_urls}"""


ACCOUNT_GENERATION_SYSTEM = """You are a B2B sales intelligence expert. Generate realistic B2B account profiles for companies that would be ideal customers of the given brand.

You MUST respond with valid JSON only, no other text. Use this exact structure:

{
  "accounts": [
    {
      "company_name": "...",
      "industry": "...",
      "employee_count": "500-1000",
      "annual_revenue": "$50M-$100M",
      "hq_location": "City, Country",
      "tech_stack": ["..."],
      "pain_points": ["..."],
      "buying_stage": "Awareness|Consideration|Decision|Expansion",
      "decision_makers": [
        {"name": "...", "title": "...", "persona_name": "matching persona name"}
      ],
      "target_campaigns": ["campaign name"],
      "target_segments": ["segment name"]
    }
  ]
}

Rules:
- Generate exactly 5 accounts
- Make them diverse in industry, size, and buying stage
- HQ locations should be in the specified country
- Each account should have 1-2 decision makers that map to existing personas
- tech_stack should include 3-5 relevant technologies
- pain_points should include 2-3 specific business challenges
- target_campaigns should reference actual campaign names from the provided list
- target_segments should reference actual segment names from the provided list"""

ACCOUNT_GENERATION_USER = """Generate 5 B2B account profiles for this brand.

Brand: {brand_name}
Website URL: {url}
Country: {country}

Website Content:
{content}

Campaigns:
{campaigns}

Personas:
{personas}

Segments:
{segments}"""
