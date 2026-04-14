import { FONT_MONO, T } from '../../theme';

/* Monospace uppercase section header */
export const Label = ({ children }) => (
  <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.tm, marginBottom: 10 }}>
    {children}
  </div>
);
