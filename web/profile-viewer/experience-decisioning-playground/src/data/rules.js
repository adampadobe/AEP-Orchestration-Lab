import { Crown, ShoppingCart, Monitor, RefreshCw, Megaphone, Smartphone } from "lucide-react";

/* 4 decision rules — reusable eligibility conditions */
export const DECISION_RULES = [
  { name:"VIP Customers Only", condition:'loyaltyTier IN ("Platinum","Gold")', icon:Crown, source:"Profile" },
  { name:"Cart Value > €80", condition:"cart.value > 80", icon:ShoppingCart, source:"Context" },
  { name:"Category Browsers", condition:'browsedCategories CONTAINS "…"', icon:Monitor, source:"Event" },
  { name:"Repeat Purchasers", condition:"purchaseCount ≥ 3 in 90d", icon:RefreshCw, source:"Computed" },
];

/* Pass-through rates — what % of audience each rule keeps */
export const RULE_RATES = [0.20, 0.50, 0.70, 0.40];

/* 3 AEP audience segments — used in Strategy step as alternative to rules */
export const AUDIENCES = [
  { name:"High-Value Shoppers", icon:Crown, desc:"LTV > €500" },
  { name:"Newsletter Subscribers", icon:Megaphone, desc:"Opted-in to email" },
  { name:"Mobile App Users", icon:Smartphone, desc:"Active in last 30d" },
];
