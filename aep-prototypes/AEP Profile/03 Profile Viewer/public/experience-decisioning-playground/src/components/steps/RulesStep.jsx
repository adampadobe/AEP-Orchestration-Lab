import { useState } from 'react';
import { Check, X, User } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { useIndustryData } from '../../IndustryContext.jsx';
import { DECISION_RULES, RULE_RATES } from '../../data/rules';
import { Label, Title, Desc, Card, Tip, Badge } from '../ui';
import styles from './RulesStep.module.css';

const PEOPLE_TOTAL = 30;

/* Step 4 — Toggle rules, see the people grid narrow, check profile pass/fail */
export const RulesStep = () => {
  const { PROFILES } = useIndustryData();
  const [activeRules, setActiveRules] = useState([]);
  const toggleRule = (i) => setActiveRules(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);

  /* Multiply pass-through rates for all active rules */
  const combinedRate = activeRules.length === 0 ? 1 : activeRules.reduce((acc, i) => acc * RULE_RATES[i], 1);
  const eligibleCount = Math.max(1, Math.round(PEOPLE_TOTAL * combinedRate));
  const pct = Math.round((eligibleCount / PEOPLE_TOTAL) * 100);

  /* Evaluate a single profile against all active rules */
  const profileEval = (p) => DECISION_RULES.map((rule, i) => {
    if (!activeRules.includes(i)) return null;
    let pass;
    switch (i) {
      case 0: pass = p.tier === 'Platinum' || p.tier === 'Gold'; break;
      case 1: pass = p.cartValue > 80; break;
      case 2: pass = p.browsed.length > 0; break;
      case 3: pass = p.purchases >= 3; break;
      default: pass = false;
    }
    return { name: rule.name, pass };
  }).filter(Boolean);

  return (
    <div>
      <Label>Step 04 — Who Qualifies</Label>
      <Title>Decision Rules</Title>
      <Desc>Rules are reusable eligibility conditions. You define them once, then plug them into your selection strategies. Each rule narrows the audience — toggle them on and watch who's left.</Desc>

      <div className={styles.grid}>
        {/* Left: Rules */}
        <div>
          <Label>Toggle rules to narrow the audience</Label>
          {DECISION_RULES.map((rule, i) => {
            const on = activeRules.includes(i);
            const Icon = rule.icon;
            const rulePercent = Math.round(RULE_RATES[i] * 100);
            return (
              <Card key={rule.name} hoverable onClick={() => toggleRule(i)}
                style={{ padding: '12px 14px', marginBottom: 6, borderLeft: `3px solid ${on ? T.gn : T.bd}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={15} color={on ? T.gn : T.tm} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: FONT_SANS, fontSize: 12.5, fontWeight: 600, color: T.tx }}>
                      {rule.name}
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.tm, marginLeft: 6 }}>keeps ~{rulePercent}%</span>
                    </div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: T.tm, marginTop: 2 }}>{rule.source} · {rule.condition}</div>
                  </div>
                  <div className={styles.toggleCircle} style={{ background: on ? T.gn : T.bd }}>
                    {on && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                </div>
              </Card>
            );
          })}
          <Tip title="Reusable:">Define a rule once, then attach it to any selection strategy. The same rule can power multiple strategies across different campaigns.</Tip>
        </div>

        {/* Right: People grid + profile check */}
        <div>
          <Label>Your audience — {eligibleCount} of {PEOPLE_TOTAL} eligible ({pct}%)</Label>
          <Card style={{ padding: 16, marginBottom: 12 }}>
            <div className={styles.peopleGrid}>
              {Array.from({ length: PEOPLE_TOTAL }, (_, i) => {
                const isEligible = i < eligibleCount;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'center', transition: 'all 0.4s ease', transitionDelay: `${i * 15}ms` }}>
                    <User size={20} color={isEligible ? T.gn : T.bd} style={{ transition: 'color 0.4s ease', transitionDelay: `${i * 15}ms` }} />
                  </div>
                );
              })}
            </div>
            <div className={styles.progressRow}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%`, background: activeRules.length === 0 ? T.tx : T.gn }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: activeRules.length === 0 ? T.tx : T.gn, transition: 'color 0.3s' }}>{pct}%</span>
            </div>
            {activeRules.length === 0 && (
              <p className={styles.hint}>No rules active — everyone qualifies. Toggle rules on the left to narrow the audience.</p>
            )}
            {activeRules.length > 0 && eligibleCount <= 3 && (
              <p className={styles.hint} style={{ color: T.gl }}>Very narrow audience — only the most qualified customers remain.</p>
            )}
          </Card>

          {/* Profile check */}
          <Label>How does this affect real customers?</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {PROFILES.map(p => {
              const evals = profileEval(p);
              const allPass = evals.length > 0 && evals.every(e => e.pass);
              const noRules = evals.length === 0;
              return (
                <Card key={p.name} style={{
                  padding: '10px 14px',
                  background: noRules ? T.sf : allPass ? 'var(--mix-green-06)' : 'var(--mix-accent-06)',
                  borderColor: noRules ? T.bd : allPass ? 'var(--mix-green-25)' : 'var(--mix-accent-25)',
                  transition: 'background 0.3s, border-color 0.3s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={styles.avatar}>{p.avatar}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, color: T.tx }}>
                        {p.name}{p.age ? `, ${p.age}` : ''} <span style={{ fontWeight: 400, color: T.tm }}>· {p.tier !== 'None' ? p.tier : 'No tier'}</span>
                      </div>
                      {evals.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          {evals.map(e => (
                            <span key={e.name} style={{ fontFamily: FONT_MONO, fontSize: 9, color: e.pass ? T.gn : T.ac, display: 'flex', alignItems: 'center', gap: 2 }}>
                              {e.pass ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}{e.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 600, color: noRules ? T.tm : allPass ? T.gn : T.ac, flexShrink: 0 }}>
                      {noRules ? '—' : allPass ? 'Eligible' : 'Excluded'}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
