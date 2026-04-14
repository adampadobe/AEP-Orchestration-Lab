import { ShoppingCart, Building2, Plane, Tv, Trophy, Smartphone, Landmark } from 'lucide-react';
import { DCE_INDUSTRIES } from '../../../dce-shared-industries.js';

const ICONS = [ShoppingCart, Building2, Plane, Tv, Trophy, Smartphone, Landmark];

/* Icons aligned 1:1 with DCE_INDUSTRIES order — see ../../../dce-shared-industries.js */
export const INDUSTRIES = DCE_INDUSTRIES.map((row, i) => ({
  ...row,
  icon: ICONS[i],
}));
