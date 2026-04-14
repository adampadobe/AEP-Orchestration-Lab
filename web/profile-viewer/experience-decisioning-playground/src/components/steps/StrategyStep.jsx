import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { COLLECTIONS } from '../../data/collections';
import { DECISION_RULES, AUDIENCES } from '../../data/rules';
import { RANKING_METHODS } from '../../data/rankings';
import { Label, Title, Desc, Card, Badge, Pill, Tip } from '../ui';
import styles from './StrategyStep.module.css';

/* Step 6 — 3-column picker: Collection + Eligibility + Ranking */
export const StrategyStep = () => {
  const [colIdx, setColIdx] = useState(4);
  const [eligType, setEligType] = useState('rule');
  const [ruleIdx, setRuleIdx] = useState(0);
  const [audIdx, setAudIdx] = useState(0);
  const [rankId, setRankId] = useState('priority');

  const eligLabel = eligType === 'rule' ? DECISION_RULES[ruleIdx].name : AUDIENCES[audIdx].name;

  return (
    <div>
      <Label>Step 06 — Assemble</Label>
      <Title>Selection Strategy</Title>
      <Desc>Combine a collection, eligibility constraint, and ranking method into one reusable strategy.</Desc>

      <div className={styles.grid}>
        {/* Column 1: Collection */}
        <div>
          <div className={styles.colHeader}>
            <div className={styles.numCircle} style={{ background: T.ac }}>1</div>
            <span className={styles.colTitle}>Collection</span>
          </div>
          {COLLECTIONS.map((c, i) => (
            <div key={c.name} onClick={() => setColIdx(i)} className={styles.option}
              style={{ background: colIdx === i ? T.ac + '10' : T.sf, border: `1.5px solid ${colIdx === i ? T.ac : T.bd}`, color: colIdx === i ? T.ac : T.tx, fontWeight: colIdx === i ? 600 : 400 }}>
              {c.name}
            </div>
          ))}
        </div>

        {/* Column 2: Eligibility — rules OR audiences */}
        <div>
          <div className={styles.colHeader}>
            <div className={styles.numCircle} style={{ background: T.gl }}>2</div>
            <span className={styles.colTitle}>Eligibility</span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <Pill active={eligType === 'rule'} onClick={() => setEligType('rule')} color={T.gl}>Rules</Pill>
            <Pill active={eligType === 'audience'} onClick={() => setEligType('audience')} color={T.gl}>Audiences</Pill>
          </div>
          {eligType === 'rule' ? DECISION_RULES.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={r.name} onClick={() => setRuleIdx(i)} className={styles.option}
                style={{ background: ruleIdx === i ? T.gl + '10' : T.sf, border: `1.5px solid ${ruleIdx === i ? T.gl : T.bd}`, color: ruleIdx === i ? T.gl : T.tx, fontWeight: ruleIdx === i ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={11} color={ruleIdx === i ? T.gl : T.tm} />{r.name}
              </div>
            );
          }) : AUDIENCES.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={a.name} onClick={() => setAudIdx(i)} className={styles.option}
                style={{ background: audIdx === i ? T.gl + '10' : T.sf, border: `1.5px solid ${audIdx === i ? T.gl : T.bd}`, color: audIdx === i ? T.gl : T.tx, fontWeight: audIdx === i ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={11} color={audIdx === i ? T.gl : T.tm} />{a.name}
                <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: T.tm, marginLeft: 'auto' }}>{a.desc}</span>
              </div>
            );
          })}
        </div>

        {/* Column 3: Ranking */}
        <div>
          <div className={styles.colHeader}>
            <div className={styles.numCircle} style={{ background: T.gn }}>3</div>
            <span className={styles.colTitle}>Ranking</span>
          </div>
          {RANKING_METHODS.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.name} onClick={() => setRankId(m.id)} className={styles.option}
                style={{ background: rankId === m.id ? T.gn + '10' : T.sf, border: `1.5px solid ${rankId === m.id ? T.gn : T.bd}`, color: rankId === m.id ? T.gn : T.tx, fontWeight: rankId === m.id ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={11} color={rankId === m.id ? T.gn : T.tm} />{m.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary row */}
      <Card style={{ background: T.sa, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Badge color={T.ac}>{COLLECTIONS[colIdx].name}</Badge>
          <ArrowRight size={12} color={T.bd} />
          <Badge color={T.gl}>{eligLabel}</Badge>
          <ArrowRight size={12} color={T.bd} />
          <Badge color={T.gn}>{RANKING_METHODS.find(m => m.id === rankId).name}</Badge>
        </div>
      </Card>

      <Tip title="Rules vs. Audiences:">A rule evaluates conditions in real time for each individual (e.g. cart value right now). An audience is a pre-built segment from Adobe Experience Platform (e.g. all high-value shoppers). Both achieve the same goal — controlling who's eligible.</Tip>
    </div>
  );
};
