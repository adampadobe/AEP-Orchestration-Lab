import { ShoppingCart, Building2, Plane, Tv, Trophy, Smartphone, Landmark, Stethoscope } from 'lucide-react';
import { DCE_INDUSTRIES } from '../../../dce-shared-industries.js';

const ICONS = [ShoppingCart, Building2, Plane, Tv, Trophy, Smartphone, Landmark, Stethoscope];

/* Icons aligned 1:1 with DCE_INDUSTRIES order — see ../../../dce-shared-industries.js */
export const INDUSTRIES = DCE_INDUSTRIES.map((row, i) => ({
  ...row,
  icon: ICONS[i],
}));
