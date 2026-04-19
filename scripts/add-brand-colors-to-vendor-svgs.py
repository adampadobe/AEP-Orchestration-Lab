#!/usr/bin/env python3
"""Add official brand colors to Simple Icons vendor SVGs in ecosystem-vendor-logos/."""

import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGOS_DIR = os.path.join(SCRIPT_DIR, '..', 'web', 'profile-viewer', 'images', 'ecosystem-vendor-logos')

# Official Simple Icons brand colors (simpleicons.org)
BRAND_COLORS = {
    'amazonaws':         '#FF9900',
    'apachekafka':       '#231F20',
    'databricks':        '#FF3621',
    'docker':            '#2496ED',
    'elasticsearch':     '#005571',
    'facebook':          '#1877F2',
    'googleanalytics':   '#E37400',
    'googlebigquery':    '#4285F4',
    'googlecloud':       '#4285F4',
    'hubspot':           '#FF7A59',
    'instagram':         '#E4405F',
    'kubernetes':        '#326CE5',
    'linkedin':          '#0A66C2',
    'looker':            '#4285F4',
    'meta':              '#0467DF',
    'microsoftazure':    '#0078D4',
    'microsoftsqlserver':'#CC2927',
    'mongodb':           '#47A248',
    'mysql':             '#4479A1',
    'postgresql':        '#4169E1',
    'redis':             '#DC382D',
    'salesforce':        '#00A1E0',
    'snowflake':         '#29B5E8',
    'tableau':           '#E97627',
    'tiktok':            '#010101',
    'twilio':            '#F22F46',
    'zendesk':           '#1F73B7',
}

def add_fill_to_svg(path, color):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Remove any existing fill on the <svg> tag first to avoid duplicates
    content = re.sub(r'(<svg\b[^>]*?)\s+fill="[^"]*"', r'\1', content)

    # Add fill="#COLOR" to the opening <svg> tag
    content = re.sub(r'(<svg\b)', rf'\1 fill="{color}"', content, count=1)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

    return True

updated = []
skipped = []

for filename in sorted(os.listdir(LOGOS_DIR)):
    if not filename.endswith('.svg'):
        continue
    key = filename[:-4]  # strip .svg
    if key not in BRAND_COLORS:
        skipped.append(filename)
        continue
    filepath = os.path.join(LOGOS_DIR, filename)
    add_fill_to_svg(filepath, BRAND_COLORS[key])
    updated.append(f'  {filename}  →  {BRAND_COLORS[key]}')

print(f'Updated {len(updated)} SVGs:')
for line in updated:
    print(line)

if skipped:
    print(f'\nNo color mapping for {len(skipped)} files (skipped):')
    for f in skipped:
        print(f'  {f}')
