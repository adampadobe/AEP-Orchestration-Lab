import { FONT_SANS, T } from '../../theme';

/* Sans-serif intro paragraph below the title */
export const Desc = ({ children }) => (
  <p style={{ fontFamily: FONT_SANS, fontSize: 14.5, color: T.tm, lineHeight: 1.65, margin: '0 0 24px', maxWidth: 580 }}>
    {children}
  </p>
);
