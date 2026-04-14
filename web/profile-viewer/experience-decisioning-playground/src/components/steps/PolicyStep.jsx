import { useState } from 'react';
import { Plus, Package } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { Label, Title, Desc, Card, Badge, Tip } from '../ui';
import styles from './PolicyStep.module.css';

/* Step 7 — Strategy sequence builder + items-to-return selector */
export const PolicyStep = () => {
  const [strategies, setStrategies] = useState([{ name: 'Primary Strategy', rank: 'Formula' }]);
  const [numItems, setNumItems] = useState(3);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <Label>Step 07 — Bring It Together</Label>
      <Title>Decision Policy</Title>
      <Desc>The policy is embedded in a campaign or journey. It sequences strategies, sets return count, and defines a fallback.</Desc>

      <div className={styles.grid}>
        <div>
          <Label>Strategy sequence</Label>
          {strategies.map((s, i) => (
            <Card key={i} style={{ marginBottom: 5, borderLeft: `3px solid ${i === 0 ? T.ac : T.bl}`, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className={styles.numCircle} style={{ background: i === 0 ? T.ac : T.bl }}>{i + 1}</div>
                <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600 }}>{s.name}</span>
                <Badge color={T.gn}>{s.rank}</Badge>
              </div>
            </Card>
          ))}
          {strategies.length < 2 && !showAdd && (
            <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
              <Plus size={12} />Add strategy
            </button>
          )}
          {showAdd && (
            <button className={styles.confirmBtn}
              onClick={() => { setStrategies(p => [...p, { name: 'Secondary', rank: 'AI Model' }]); setShowAdd(false); }}>
              Add Secondary Strategy
            </button>
          )}
          <Card style={{ marginTop: 5, background: T.sa, borderStyle: 'dashed', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Package size={12} color={T.tm} />
              <div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.tm }}>FALLBACK</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 11, color: T.tx }}>Generic offer — always available</div>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <Label>Items to return</Label>
          <Card>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setNumItems(n)} className={styles.countBtn}
                  style={{ border: `2px solid ${numItems === n ? T.ac : T.bd}`, background: numItems === n ? T.as : 'transparent', color: numItems === n ? T.ac : T.tm }}>
                  {n}
                </button>
              ))}
            </div>
            <p style={{ fontFamily: FONT_SANS, fontSize: 11, color: T.tm, marginTop: 8 }}>
              Return top <strong style={{ color: T.tx }}>{numItems}</strong> offer{numItems > 1 ? 's' : ''}.
            </p>
          </Card>
          <Tip title="Why this matters:">A homepage hero banner needs 1 offer. A recommendation carousel might need 4. The engine ranks all eligible offers but only returns the number you specify — the rest are ready as fallbacks.</Tip>
        </div>
      </div>
    </div>
  );
};
