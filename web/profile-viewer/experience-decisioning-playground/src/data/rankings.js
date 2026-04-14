import { BarChart3, SlidersHorizontal, Brain } from "lucide-react";

/* 3 ranking methods — from simple fixed score to ML-powered */
export const RANKING_METHODS = [
  { id:"priority", name:"Item Priority", desc:"Fixed score per offer. Same for everyone.", effort:1, icon:BarChart3 },
  { id:"formula", name:"Ranking Formula", desc:"Dynamic score from item + profile + context.", effort:2, icon:SlidersHorizontal },
  { id:"ai", name:"AI Model", desc:"ML model. Per-individual propensity. Learns continuously.", effort:3, icon:Brain },
];
