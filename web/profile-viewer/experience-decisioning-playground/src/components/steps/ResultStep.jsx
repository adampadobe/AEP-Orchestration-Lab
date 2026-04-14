import { useState } from 'react';
import { FONT_SERIF, FONT_SANS, FONT_MONO, T } from '../../theme';
import { useIndustryData } from '../../IndustryContext.jsx';
import { Label, Card } from '../ui';
import styles from './ResultStep.module.css';

/* Step 8 — Final results: select a profile, see the top 5 ranked offers */
export const ResultStep = () => {
  const { OFFERS, PROFILES, RESULTS } = useIndustryData();
  const [profileIdx, setProfileIdx] = useState(0);
  const profile = PROFILES[profileIdx];
  const results = RESULTS[profileIdx];

  return (
    <div>
      <Label>Step 08 — See It Work</Label>
      <h1 className={styles.title}>The Engine Decides</h1>
      <p className={styles.desc}>Same 10 offers, same policy. Different customer — different result. Select a profile to see the top 5.</p>

      {/* Profile selector */}
      <div className={styles.profileGrid}>
        {PROFILES.map((p, i) => (
          <Card key={p.name} hoverable onClick={() => setProfileIdx(i)}
            style={{ borderTop: `3px solid ${profileIdx === i ? T.ac : 'transparent'}`, background: profileIdx === i ? T.as : T.sf, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div className={styles.avatar}>{p.avatar}</div>
              <div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, color: T.tx }}>{p.name}</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: T.tm }}>{p.tier}</div>
              </div>
            </div>
            <p style={{ fontFamily: FONT_SANS, fontSize: 9, color: T.tm, margin: 0 }}>{p.detail}</p>
          </Card>
        ))}
      </div>

      {/* Results */}
      <Card style={{ background: T.sa, padding: 20, borderColor: T.bd }}>
        <Label><span style={{ color: T.tm }}>Top 5 for {profile.name}</span></Label>
        {results.map((r, i) => {
          const offer = OFFERS[r.oi];
          const Icon = offer.icon;
          const isTop = i === 0;
          const isMid = i < 3;
          return (
            <div key={i} className={styles.resultRow} style={{
              padding: isTop ? 14 : '8px 12px',
              background: isTop ? offer.color + '10' : T.sf,
              border: `1px solid ${isTop ? offer.color + '25' : T.bd}`,
            }}>
              <div className={styles.iconCircle} style={{
                width: isTop ? 44 : 32, height: isTop ? 44 : 32,
                background: isTop ? offer.color : isMid ? T.bd + '80' : T.bd + '50',
              }}>
                <Icon size={isTop ? 20 : 14} color={isTop ? '#fff' : T.tm} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_SANS, fontSize: isTop ? 14 : 11.5, fontWeight: 600, color: isTop ? T.tx : isMid ? T.tx : T.tm }}>{offer.name}</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: isTop ? 10.5 : 9.5, color: T.tm, marginTop: 1 }}>{r.reason}</div>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: isTop ? 18 : 13, fontWeight: 700, color: isTop ? offer.color : isMid ? T.tx : T.tm, flexShrink: 0 }}>{r.score}</div>
            </div>
          );
        })}
      </Card>

      {/* Closing */}
      <div className={styles.closing}>
        <p className={styles.closingTitle}>That's Experience Decisioning.</p>
        <p className={styles.closingSub}>Schema → Items → Collections → Rules → Ranking → Strategy → Policy → Result.</p>
      </div>
    </div>
  );
};
