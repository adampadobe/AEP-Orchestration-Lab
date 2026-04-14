/* 3 customer profiles for rule evaluation and final results */
export const PROFILES = [
  { name:"Jordan", age:34, tier:"Platinum", detail:"App-first · 3-4×/mo · Electronics & Beauty", avatar:"J", cartValue:120, purchases:8, browsed:["Electronics"] },
  { name:"Riley", age:27, tier:"None", detail:"Cart abandons · Converts on promo", avatar:"R", cartValue:35, purchases:1, browsed:["Fashion"] },
  { name:"The Parkers", age:null, tier:"Silver", detail:"Weekly family shop · School list + home", avatar:"P", cartValue:95, purchases:12, browsed:["Stationery","Grocery"] },
];

/* Pre-computed decisioning results — top 5 ranked offers per profile */
export const RESULTS = {
  0: [
    { oi:0, score:96, reason:"Platinum VIP + high AOV → loyalty delivery perk." },
    { oi:5, score:84, reason:"Electronics browse + high margin." },
    { oi:1, score:78, reason:"Triple points matches loyalty engagement." },
    { oi:7, score:65, reason:"Trade-in leverages electronics affinity." },
    { oi:6, score:52, reason:"Exclusive preview — relevant but lower priority." },
  ],
  1: [
    { oi:3, score:91, reason:"Footwear browse + price sensitivity → shoe discount." },
    { oi:9, score:83, reason:"Grocery flash sale — app-first promo matches deal-seeking." },
    { oi:4, score:79, reason:"Bundle triggers value-seeking behavior." },
    { oi:8, score:68, reason:"Home assembly — broad appeal." },
    { oi:2, score:61, reason:"BNPL available but low cart value." },
  ],
  2: [
    { oi:4, score:93, reason:"Back-to-school matches family shopping mission exactly." },
    { oi:9, score:86, reason:"Grocery flash sale — weekly family shop + grocery browse." },
    { oi:8, score:82, reason:"Home furniture + free assembly → household need." },
    { oi:1, score:71, reason:"Triple points for Silver-tier families." },
    { oi:3, score:58, reason:"Shoe discount — broad appeal, less targeted." },
  ],
};
