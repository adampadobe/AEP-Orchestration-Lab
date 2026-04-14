/**
 * XDM schema tree for the offer object — ported from
 * https://github.com/alexmtmr/experience-decisioning-playground/blob/main/src/data/schema.js
 * (structure and ids must stay aligned with the React SchemaStep).
 *
 * - group nodes: collapsible folders
 * - leaf nodes: toggles that build the live offer preview
 * - visual → offer card; meta → metadata widget; nav → navigation widget
 * - Standard fields are in group "Standard Fields" (locked folder chrome; leaves still toggle)
 */
window.DCE_PLAYGROUND_SCHEMA_TREE = [
  {
    id: 's3',
    name: 'Standard Fields',
    group: true,
    standard: true,
    locked: true,
    children: [
      { id: 'f15', name: 'itemName', type: 'String', standard: true, icon: 'type', previewLabel: 'Name' },
      { id: 'f16', name: 'priority', type: 'Integer', standard: true, icon: 'bar', previewLabel: 'Priority', previewVal: '70' },
      { id: 'f17', name: 'startDate', type: 'DateTime', standard: true, icon: 'cal', previewLabel: 'Start', previewVal: '2026-04-01' },
      { id: 'f18', name: 'endDate', type: 'DateTime', standard: true, icon: 'cal', previewLabel: 'End', previewVal: '2026-08-31' },
    ],
  },
  {
    id: 's1',
    name: 'Offer Content',
    group: true,
    custom: true,
    children: [
      {
        id: 's1a',
        name: 'Media Assets',
        group: true,
        custom: true,
        children: [
          { id: 'f1', name: 'heroImage', type: 'Asset', custom: true, icon: 'img', previewLabel: 'Hero Image', previewVal: 'banner.jpg', visual: true },
          { id: 'f2', name: 'thumbnail', type: 'Asset', custom: true, icon: 'img', previewLabel: 'Thumbnail', previewVal: 'thumb.png', visual: true },
        ],
      },
      {
        id: 's1b',
        name: 'Text Content',
        group: true,
        custom: true,
        children: [
          { id: 'f3', name: 'title', type: 'String', custom: true, icon: 'type', previewLabel: 'Title', visual: true },
          { id: 'f4', name: 'description', type: 'String', custom: true, icon: 'file', previewLabel: 'Description', visual: true },
          { id: 'f5', name: 'callToAction', type: 'String', custom: true, icon: 'mouse', previewLabel: 'CTA', previewVal: 'Shop Now →', visual: true },
        ],
      },
      {
        id: 's1c',
        name: 'Navigation',
        group: true,
        custom: true,
        children: [
          { id: 'f6', name: 'webUrl', type: 'String', custom: true, icon: 'link', previewLabel: 'Web URL', previewVal: 'shop.example.com/promo', nav: true },
          { id: 'f7', name: 'deepLink', type: 'String', custom: true, icon: 'phone', previewLabel: 'Deep Link', previewVal: 'app://promo/offer', nav: true },
          { id: 'f19', name: 'channelType', type: 'Enum', custom: true, icon: 'laptop', previewLabel: 'Channel', previewVal: 'Web, App, Push', nav: true },
        ],
      },
      {
        id: 's1d',
        name: 'Promo Elements',
        group: true,
        custom: true,
        children: [
          { id: 'f8', name: 'promoCode', type: 'String', custom: true, icon: 'tag', previewLabel: 'Promo Code', previewVal: 'SUMMER26', nav: true },
        ],
      },
    ],
  },
  {
    id: 's2',
    name: 'Offer Metadata',
    group: true,
    custom: true,
    children: [
      { id: 'f9', name: 'contentType', type: 'Enum', custom: true, icon: 'mega', previewLabel: 'Content Type', previewVal: 'Promotional', meta: true },
      { id: 'f10', name: 'salesStage', type: 'Enum', custom: true, icon: 'trend', previewLabel: 'Sales Stage', previewVal: 'Cross-sell', meta: true },
      { id: 'f11', name: 'journeyStage', type: 'Enum', custom: true, icon: 'target', previewLabel: 'Journey Stage', previewVal: 'Retention', meta: true },
      { id: 'f12', name: 'targetSegment', type: 'Enum', custom: true, icon: 'users', previewLabel: 'Target', previewVal: 'High-value', meta: true },
      { id: 'f13', name: 'category', type: 'String', custom: true, icon: 'layers', previewLabel: 'Category', previewVal: 'Footwear', meta: true },
      { id: 'f14', name: 'margin', type: 'Enum', custom: true, icon: 'bar', previewLabel: 'Margin', previewVal: 'Medium', meta: true },
    ],
  },
];
