import styles from './Badge.module.css';

/* Colored pill label — dynamic color prop controls bg tint, text, and border */
export const Badge = ({ children, color = 'var(--accent)' }) => (
  <span
    className={styles.badge}
    style={{
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      color,
      borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
    }}
  >
    {children}
  </span>
);
