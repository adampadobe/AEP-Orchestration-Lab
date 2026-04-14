import {
  Truck, Award, CreditCard, BadgePercent, Gift,
  Headphones, Shirt, Watch, Sofa, Utensils,
} from "lucide-react";

/* 10 retail offers — each has a unique color, Lucide icon, and Unsplash image */
export const OFFERS = [
  { id:1, name:"Free Express Delivery", desc:"For VIP members on orders over €50", type:"Loyalty", priority:100, margin:"High", category:"All", color:"#D94B3F", icon:Truck, img:"https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:2, name:"3× Loyalty Points Weekend", desc:"Earn triple points on every purchase", type:"Loyalty", priority:85, margin:"Medium", category:"All", color:"#E68619", icon:Award, img:"https://images.unsplash.com/photo-1607082349566-187342175e2f?w=400&h=240&fit=crop", channels:["web","app","email","sms"] },
  { id:3, name:"0% BNPL on Electronics", desc:"12-month interest-free financing", type:"BNPL", priority:55, margin:"Low", category:"Electronics", color:"#2680EB", icon:CreditCard, img:"https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=240&fit=crop", channels:["web"] },
  { id:4, name:"20% Off Running Shoes", desc:"Summer collection — limited time", type:"Discount", priority:70, margin:"Medium", category:"Footwear", color:"#2D9D78", icon:BadgePercent, img:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=240&fit=crop", channels:["email","web","app","push","code"] },
  { id:5, name:"Back-to-School Bundle", desc:"Stationery + backpack combo deal", type:"Bundle", priority:40, margin:"Low", category:"Stationery", color:"#7C5CFC", icon:Gift, img:"https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=240&fit=crop", channels:["web","email","sms"] },
  { id:6, name:"Premium Headphones €30 Off", desc:"Noise-cancelling, top rated", type:"Discount", priority:65, margin:"High", category:"Electronics", color:"#0D918C", icon:Headphones, img:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:7, name:"New Collection Preview", desc:"Early access for loyalty members", type:"Exclusive", priority:50, margin:"Medium", category:"Fashion", color:"#C45BAA", icon:Shirt, img:"https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&h=240&fit=crop", channels:["app","push"] },
  { id:8, name:"Smart Watch Trade-In", desc:"€100 off when you trade your old device", type:"Trade-In", priority:45, margin:"High", category:"Electronics", color:"#5B7FFF", icon:Watch, img:"https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:9, name:"Home — Free Assembly", desc:"Free furniture assembly over €200", type:"Service", priority:35, margin:"Low", category:"Home", color:"#8B6914", icon:Sofa, img:"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=240&fit=crop", channels:["web","email","sms"] },
  { id:10, name:"Grocery Flash Sale — 15% Off", desc:"Fresh produce & pantry essentials today only", type:"Discount", priority:75, margin:"Medium", category:"Grocery", color:"#D4793A", icon:Utensils, img:"https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=240&fit=crop", channels:["email","app","push","sms"] },
];
