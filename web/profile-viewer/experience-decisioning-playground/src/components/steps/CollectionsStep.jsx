import { useState } from 'react';
import { Filter } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { useIndustryData } from '../../IndustryContext.jsx';
import { COLLECTIONS } from '../../data/collections';
import { Label, Card, Pill, Badge, Tip } from '../ui';
import styles from './CollectionsStep.module.css';

/* Step 3 — Switch between collections and see which offers match */
export const CollectionsStep = () => {
  const { OFFERS } = useIndustryData();
  const [active, setActive] = useState(4);
  const col = COLLECTIONS[active];

  return (
    <div>
      <Label>Step 03 — Organize</Label>
      <h1 className={styles.title}>Collections</h1>
      <p className={styles.desc}>Collections group items using schema attribute filters — like smart folders. Switch between them to see which offers match.</p>

      <div className={styles.pillRow}>
        {COLLECTIONS.map((c, i) => <Pill key={c.name} active={active === i} onClick={() => setActive(i)}>{c.name}</Pill>)}
      </div>

      <Card>
        <div className={styles.ruleHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <Filter size={13} color={T.ac} />
            <code className={styles.ruleCode}>{col.rule}</code>
          </div>
          <p className={styles.ruleInfo}>{col.info}</p>
        </div>
        <div className={styles.offerGrid}>
          {OFFERS.map(item => {
            const match = col.items.includes(item.id);
            const Icon = item.icon;
            return (
              <div key={item.id} className={styles.offerRow}
                style={{ background: match ? item.color + '06' : T.sa, border: `1px solid ${match ? item.color + '18' : T.bd}`, opacity: match ? 1 : 0.25 }}>
                <Icon size={13} color={match ? item.color : T.tm} />
                <span className={styles.offerName}>{item.name}</span>
                {match && <Badge color={T.gn}>Match</Badge>}
              </div>
            );
          })}
        </div>
      </Card>
      <Tip title="How filters work:">The rule uses schema attributes (margin, category, type) to decide membership. New offers matching the rule are included automatically.</Tip>
    </div>
  );
};
