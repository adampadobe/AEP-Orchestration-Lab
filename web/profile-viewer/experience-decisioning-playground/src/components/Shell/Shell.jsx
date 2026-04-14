import { ChevronDown } from 'lucide-react';
import { STEPS } from '../../data/steps';
import { INDUSTRIES } from '../../data/industries';
import styles from './Shell.module.css';

/*
 * App shell — progress bar, sticky tab row (industry dropdown + step tabs).
 * Menu typography/colors match web/profile-viewer/decisioning-edp-shell.css (Decisioning visualiser).
 */
export const Shell = ({ step, goToStep, industry, setIndustry, showIndustry, setShowIndustry, contentRef, children }) => {
  const currentIndustry = INDUSTRIES.find((x) => x.key === industry);
  const IndustryIcon = currentIndustry.icon;

  return (
    <div className={styles.root}>
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
                  <span className={styles.industryIcon} aria-hidden="true">
                    <IndustryIcon size={12} color="currentColor" />
                  </span>
                  {currentIndustry.label}
                  <ChevronDown className={styles.chevron} size={11} color="currentColor" />
                </button>
                {showIndustry && (
                  <div className={styles.dropdownMenu} role="listbox">
                    {INDUSTRIES.map((row) => {
                      const Ico = row.icon;
                      const active = industry === row.key;
                      return (
                        <button
                          key={row.key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setIndustry(row.key);
                            setShowIndustry(false);
                          }}
                          className={`${styles.dropdownItem} ${active ? styles.dropdownItemActive : ''}`}
                        >
                          <span className={styles.menuIcon} aria-hidden="true">
                            <Ico size={12} color="currentColor" />
                          </span>
                          <span className={styles.menuLabel}>{row.label}</span>
                        </button>
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
                  className={`${styles.tab} ${step === i ? styles.tabActive : ''}`}
                >
                  {s.short}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        ref={contentRef}
        className={`${styles.content} content`}
        onClick={() => showIndustry && setShowIndustry(false)}
      >
        {children}
      </div>
    </div>
  );
};
