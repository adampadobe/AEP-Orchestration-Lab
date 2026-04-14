import { useState } from 'react';
import { ChevronRight, ChevronDown, Lock, Check, Layers, Eye } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { useIndustryData } from '../../IndustryContext.jsx';
import { SCHEMA_TREE } from '../../data/schema';
import { Label, Card, Pill, Tip } from '../ui';
import styles from './SchemaStep.module.css';

/* Step 1 — Toggle XDM fields on/off and watch the offer preview build up */
export const SchemaStep = () => {
  const { OFFERS } = useIndustryData();
  const offer = OFFERS[3];
  const [openGroups, setOpenGroups] = useState(new Set(['s3']));
  const [enabledFields, setEnabledFields] = useState(new Set(['f15', 'f16', 'f17', 'f18']));

  const toggleGroup = (id) => setOpenGroups(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleField = (id) => setEnabledFields(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const expandCustom = () => {
    setOpenGroups(new Set(['s1', 's1a', 's1b', 's1c', 's1d', 's2']));
    const e = new Set(enabledFields);
    const walk = (items) => items.forEach(n => { if (n.children) walk(n.children); else if (n.custom) e.add(n.id); });
    walk(SCHEMA_TREE); setEnabledFields(e);
  };
  const expandAll = () => {
    const o = new Set(); const e = new Set(enabledFields);
    const walk = (items) => items.forEach(n => { if (n.group) o.add(n.id); if (n.children) walk(n.children); else e.add(n.id); });
    walk(SCHEMA_TREE); setOpenGroups(o); setEnabledFields(e);
  };
  const reset = () => { setOpenGroups(new Set(['s3'])); setEnabledFields(new Set(['f15', 'f16', 'f17', 'f18'])); };

  /* Collect all leaf fields */
  const allFields = [];
  const walkCollect = (items) => items.forEach(n => { if (n.children) walkCollect(n.children); else allFields.push(n); });
  walkCollect(SCHEMA_TREE);

  const activeFields = allFields.filter(f => enabledFields.has(f.id));
  const hasImage = activeFields.some(f => f.id === 'f1' || f.id === 'f2');
  const hasTitle = activeFields.some(f => f.id === 'f3' || f.id === 'f15');
  const hasDesc = activeFields.some(f => f.id === 'f4');
  const hasCTA = activeFields.some(f => f.id === 'f5');
  const metaFields = activeFields.filter(f => f.meta);
  const navFields = activeFields.filter(f => f.nav);
  const stdFields = activeFields.filter(f => !f.visual && !f.meta && !f.nav);

  /* Recursive tree renderer */
  const renderTree = (items, depth = 0) => items.map(node => {
    if (node.group) {
      const isOpen = openGroups.has(node.id);
      return (
        <div key={node.id}>
          <div onClick={() => toggleGroup(node.id)} className={styles.groupRow}
            style={{ marginLeft: depth * 16 }}
            onMouseEnter={e => e.currentTarget.style.background = T.sa} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {isOpen ? <ChevronDown size={11} color={T.tm} /> : <ChevronRight size={11} color={T.tm} />}
            {node.locked && <Lock size={9} color={T.tm} />}
            <span className={styles.groupName}>{node.name}</span>
            {node.custom && <span className={styles.customTag}>custom</span>}
          </div>
          {isOpen && <div style={{ borderLeft: `1px solid ${T.bd}`, marginLeft: depth * 16 + 14 }}>{renderTree(node.children, depth + 1)}</div>}
        </div>
      );
    }
    const Icon = node.icon;
    const isOn = enabledFields.has(node.id);
    return (
      <div key={node.id} onClick={() => toggleField(node.id)} className={styles.fieldRow}
        style={{ marginLeft: depth * 16, opacity: isOn ? 1 : 0.4 }}
        onMouseEnter={e => e.currentTarget.style.background = T.sa} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div className={styles.checkbox} style={{ border: `1.5px solid ${isOn ? T.tx : T.bd}`, background: isOn ? T.tx : 'transparent' }}>
          {isOn && <Check size={9} color="#fff" strokeWidth={3} />}
        </div>
        <Icon size={11} color={isOn ? T.tx : T.tm} />
        <span className={styles.fieldName}>{node.name}</span>
        <span className={styles.fieldType}>{node.type}</span>
      </div>
    );
  });

  /* Helper: render a row inside a preview widget */
  const FieldRow = ({ field }) => {
    const Icon = field.icon;
    return (
      <div className={styles.previewRow}>
        <Icon size={10} color={T.tm} />
        <span className={styles.previewLabel}>{field.previewLabel}</span>
        <span className={styles.previewVal}>{field.previewVal || offer.name}</span>
      </div>
    );
  };

  return (
    <div>
      <Label>Step 01 — The Blueprint</Label>
      <h1 className={styles.title}>Offer Schema</h1>
      <p className={styles.desc}>Toggle fields on and off — watch the offer preview build up on the right. Fields marked "custom" are attributes you define for your business needs.</p>

      <div className={styles.pillRow}>
        <Pill onClick={reset} color={T.tm}>Reset</Pill>
        <Pill onClick={expandCustom} color={T.ac}>Enable Custom</Pill>
        <Pill onClick={expandAll} color={T.bl}>Enable All</Pill>
      </div>

      <div className={styles.grid}>
        {/* Left: tree */}
        <Card style={{ padding: 14, maxHeight: 520, overflow: 'auto' }}>
          <div className={styles.treeHeader}>
            <Layers size={13} color={T.tm} />
            <span className={styles.treeLabel}>XDM Schema</span>
            <span className={styles.treeHint}>Toggle fields</span>
          </div>
          {renderTree(SCHEMA_TREE)}
        </Card>

        {/* Right: preview */}
        <div className={styles.previewCol}>
          <Card style={{ background: T.pv, borderColor: T.pb, padding: 0, overflow: 'hidden' }}>
            <div className={styles.previewHeader}>
              <Label>Offer Preview</Label>
              <span className={styles.counter}>{activeFields.length}/{allFields.length}</span>
            </div>
            {activeFields.length === 0 ? (
              <div className={styles.empty}>
                <Eye size={22} color={T.bd} />
                <p className={styles.emptyText}>Toggle fields to build the preview</p>
              </div>
            ) : (
              <div>
                {hasImage && <div className={styles.imgWrap}><img src={offer.img} alt="" className={styles.img} /></div>}
                <div style={{ padding: '12px 14px' }}>
                  {hasTitle && <div className={styles.offerName}>{offer.name}</div>}
                  {hasDesc && <div className={styles.offerDesc}>{offer.desc}</div>}
                  {hasCTA && <div className={styles.cta} style={{ background: offer.color }}>Shop Now →</div>}
                </div>
              </div>
            )}
          </Card>

          {/* Standard fields widget */}
          {stdFields.length > 0 && (
            <Card style={{ marginTop: 8, padding: '12px 14px', background: T.sf, borderColor: T.pb }}>
              <Label>Standard Attributes</Label>
              <div className={styles.previewList}>{stdFields.map(f => <FieldRow key={f.id} field={f} />)}</div>
            </Card>
          )}

          {/* Navigation & Delivery widget */}
          {navFields.length > 0 && (
            <Card style={{ marginTop: 8, padding: '12px 14px', background: T.sf, borderColor: T.pb }}>
              <Label>Navigation & Delivery</Label>
              <div className={styles.previewList}>{navFields.map(f => <FieldRow key={f.id} field={f} />)}</div>
            </Card>
          )}

          {/* Metadata section */}
          {metaFields.length > 0 && (
            <Card style={{ marginTop: 8, padding: '12px 14px', background: T.sw, borderColor: T.pb }}>
              <Label>Metadata & Classification</Label>
              <div className={styles.previewList}>{metaFields.map(f => <FieldRow key={f.id} field={f} />)}</div>
            </Card>
          )}

          {/* Progress bar */}
          <div className={styles.progressRow}>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${(activeFields.length / allFields.length) * 100}%` }} />
            </div>
            <span className={styles.progressPct}>{Math.round((activeFields.length / allFields.length) * 100)}%</span>
          </div>

          <Tip title="Why this matters:">Every field you enable becomes available in ranking formulas, eligibility rules, and collections. Richer schema = smarter engine.</Tip>
        </div>
      </div>
    </div>
  );
};
