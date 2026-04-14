import { useState } from 'react';
import { T } from '../../theme';
import styles from './Card.module.css';

/*
 * Card wrapper — white surface with border, optional hover-lift effect.
 * Static layout in CSS module; dynamic hover transform via inline style
 * because it's conditional on the `hoverable` prop.
 */
export const Card = ({ children, style = {}, onClick, hoverable }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={styles.card}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        transform: hoverable && hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hoverable && hovered ? '0 6px 20px rgba(0,0,0,0.07)' : '0 1px 2px rgba(0,0,0,0.03)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
