import { FONT_SERIF, T } from '../../theme';

/* Serif display heading — main step title */
export const Title = ({ children }) => (
  <h1 style={{ fontFamily: FONT_SERIF, fontSize: 'clamp(24px,3.5vw,36px)', fontWeight: 700, color: T.tx, lineHeight: 1.15, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
    {children}
  </h1>
);
