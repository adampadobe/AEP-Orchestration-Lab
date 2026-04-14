import {
  Type, BarChart3, Calendar, Image as ImgIcon, FileText,
  MousePointerClick, Link, Smartphone, Laptop, Tag,
  Megaphone, TrendingUp, Target, Users, Layers,
} from "lucide-react";

/*
 * XDM Schema tree for the offer object.
 * - "group" nodes are collapsible folders.
 * - Leaf nodes have a checkbox; toggling them builds the live offer preview.
 * - Tags: visual → offer card, meta → metadata widget, nav → navigation widget.
 * - Standard fields are locked (always present).
 */
export const SCHEMA_TREE = [
  { id:"s3", name:"Standard Fields", group:true, standard:true, locked:true, children:[
    { id:"f15", name:"itemName", type:"String", standard:true, icon:Type, previewLabel:"Name" },
    { id:"f16", name:"priority", type:"Integer", standard:true, icon:BarChart3, previewLabel:"Priority", previewVal:"70" },
    { id:"f17", name:"startDate", type:"DateTime", standard:true, icon:Calendar, previewLabel:"Start", previewVal:"2026-04-01" },
    { id:"f18", name:"endDate", type:"DateTime", standard:true, icon:Calendar, previewLabel:"End", previewVal:"2026-08-31" },
  ]},
  { id:"s1", name:"Offer Content", group:true, custom:true, children:[
    { id:"s1a", name:"Media Assets", group:true, custom:true, children:[
      { id:"f1", name:"heroImage", type:"Asset", custom:true, icon:ImgIcon, previewLabel:"Hero Image", previewVal:"banner.jpg", visual:true },
      { id:"f2", name:"thumbnail", type:"Asset", custom:true, icon:ImgIcon, previewLabel:"Thumbnail", previewVal:"thumb.png", visual:true },
    ]},
    { id:"s1b", name:"Text Content", group:true, custom:true, children:[
      { id:"f3", name:"title", type:"String", custom:true, icon:Type, previewLabel:"Title", visual:true },
      { id:"f4", name:"description", type:"String", custom:true, icon:FileText, previewLabel:"Description", visual:true },
      { id:"f5", name:"callToAction", type:"String", custom:true, icon:MousePointerClick, previewLabel:"CTA", previewVal:"Shop Now →", visual:true },
    ]},
    { id:"s1c", name:"Navigation", group:true, custom:true, children:[
      { id:"f6", name:"webUrl", type:"String", custom:true, icon:Link, previewLabel:"Web URL", previewVal:"shop.example.com/promo", nav:true },
      { id:"f7", name:"deepLink", type:"String", custom:true, icon:Smartphone, previewLabel:"Deep Link", previewVal:"app://promo/offer", nav:true },
      { id:"f19", name:"channelType", type:"Enum", custom:true, icon:Laptop, previewLabel:"Channel", previewVal:"Web, App, Push", nav:true },
    ]},
    { id:"s1d", name:"Promo Elements", group:true, custom:true, children:[
      { id:"f8", name:"promoCode", type:"String", custom:true, icon:Tag, previewLabel:"Promo Code", previewVal:"SUMMER26", nav:true },
    ]},
  ]},
  { id:"s2", name:"Offer Metadata", group:true, custom:true, children:[
    { id:"f9", name:"contentType", type:"Enum", custom:true, icon:Megaphone, previewLabel:"Content Type", previewVal:"Promotional", meta:true },
    { id:"f10", name:"salesStage", type:"Enum", custom:true, icon:TrendingUp, previewLabel:"Sales Stage", previewVal:"Cross-sell", meta:true },
    { id:"f11", name:"journeyStage", type:"Enum", custom:true, icon:Target, previewLabel:"Journey Stage", previewVal:"Retention", meta:true },
    { id:"f12", name:"targetSegment", type:"Enum", custom:true, icon:Users, previewLabel:"Target", previewVal:"High-value", meta:true },
    { id:"f13", name:"category", type:"String", custom:true, icon:Layers, previewLabel:"Category", previewVal:"Footwear", meta:true },
    { id:"f14", name:"margin", type:"Enum", custom:true, icon:BarChart3, previewLabel:"Margin", previewVal:"Medium", meta:true },
  ]},
];
