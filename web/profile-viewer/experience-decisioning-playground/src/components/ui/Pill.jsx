import { T } from '../../theme';
import styles from './Pill.module.css';

/* Toggle button — active state changes border/bg/text color dynamically */
export const Pill = ({ children, active, onClick, color = T.ac }) => (
  <button
    className={styles.pill}
    onClick={onClick}
    style={{
      border: `1.5px solid ${active ? color : T.bd}`,
      background: active ? color + '10' : 'transparent',
      color: active ? color : T.tm,
    }}
  >
    {children}
  </button>
);
