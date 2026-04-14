import { ChevronDown } from 'lucide-react';
import { T } from '../../theme';
import { STEPS } from '../../data/steps';
import { INDUSTRIES } from '../../data/industries';
import styles from './Shell.module.css';

/*
 * App shell — progress bar, sticky tab row (industry dropdown + step tabs).
 * Step changes use the tab row only (no duplicate footer nav).
 * Receives all state + setters as props from App.jsx.
 */
export const Shell = ({ step, goToStep, industry, setIndustry, showIndustry, setShowIndustry, contentRef, children }) => {
  const currentIndustry = INDUSTRIES.find(x => x.key === industry);
  const IndustryIcon = currentIndustry.icon;

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className={styles.headerInner}>
          <div className={styles.tabBarRow}>
            <div className={styles.tabIndustry}>
              <div className={styles.dropdownWrap}>
                <button
                  type="button"
                  className={styles.dropdownBtn}
                  aria-label="Industry"
                  aria-expanded={showIndustry}
                  aria-haspopup="listbox"
                  onClick={() => setShowIndustry(!showIndustry)}
                >
                  <IndustryIcon size={12} color={T.ac} />
                  {currentIndustry.label}
                  <ChevronDown size={11} color={T.tm} />
                </button>
                {showIndustry && (
                  <div className={styles.dropdownMenu} role="listbox">
                    {INDUSTRIES.map((row) => {
                      const Ico = row.icon;
                      return (
                        <div
                          key={row.key}
                          role="option"
                          aria-selected={industry === row.key}
                          onClick={() => { setIndustry(row.key); setShowIndustry(false); }}
                          className={styles.dropdownItem}
                          style={{ background: industry === row.key ? T.as : 'transparent', color: industry === row.key ? T.ac : T.tx, fontWeight: industry === row.key ? 600 : 400 }}
                          onMouseEnter={e => { if (industry !== row.key) e.currentTarget.style.background = T.sa; }}
                          onMouseLeave={e => { if (industry !== row.key) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Ico size={12} color={industry === row.key ? T.ac : T.tm} />
                          {row.label}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.tabRow}>
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToStep(i)}
                  className={styles.tab}
                  style={{ fontWeight: step === i ? 600 : 400, color: step === i ? T.ac : i < step ? T.tx : T.tm, borderBottom: `2px solid ${step === i ? T.ac : 'transparent'}` }}
                >
                  {s.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div ref={contentRef} className={styles.content} onClick={() => showIndustry && setShowIndustry(false)}>
        {children}
      </div>
    </div>
  );
};
