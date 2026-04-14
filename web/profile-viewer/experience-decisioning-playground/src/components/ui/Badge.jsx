import styles from './Badge.module.css';

/* Colored pill label — dynamic color prop controls bg tint, text, and border */
export const Badge = ({ children, color = 'var(--accent)' }) => (
  <span className={styles.badge} style={{ background: color + '12', color, borderColor: color + '22' }}>
    {children}
  </span>
);
