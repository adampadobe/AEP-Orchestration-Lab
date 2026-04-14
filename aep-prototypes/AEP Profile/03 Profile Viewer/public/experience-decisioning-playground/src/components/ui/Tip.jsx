import { T } from '../../theme';
import styles from './Tip.module.css';

/* Info callout box — optional bold title prefix */
export const Tip = ({ children, title }) => (
  <div className={styles.tip}>
    <p className={styles.text}>
      {title && <strong style={{ color: T.tx }}>{title} </strong>}
      {children}
    </p>
  </div>
);
