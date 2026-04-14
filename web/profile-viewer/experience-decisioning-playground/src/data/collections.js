/* 5 collections — each filters offers by schema attribute rules */
export const COLLECTIONS = [
  { name:"High-Margin Offers", rule:'margin = "High"', items:[1,6,8], info:"High profit margin offers — prioritized to maximize revenue per impression." },
  { name:"Loyalty Rewards", rule:'type IN ("Loyalty","Exclusive")', items:[1,2,7], info:"For loyalty members — builds retention and lifetime value." },
  { name:"Electronics Deals", rule:'category = "Electronics"', items:[3,6,8], info:"Electronics category — targets tech-interested shoppers." },
  { name:"Discount & Bundles", rule:'type IN ("Discount","Bundle")', items:[4,5,6,10], info:"Price-led promotions for price-sensitive segments." },
  { name:"All Active Offers", rule:"endDate > now()", items:[1,2,3,4,5,6,7,8,9,10], info:"Every offer within its validity window — broadest selection." },
];
