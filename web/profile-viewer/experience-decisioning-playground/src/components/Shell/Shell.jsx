import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { FONT_SANS, FONT_MONO, T } from '../../theme';
import { STEPS } from '../../data/steps';
import { INDUSTRIES } from '../../data/industries';
import styles from './Shell.module.css';

/*
 * App shell — sticky header (logo, tabs, industry dropdown, progress bar)
 * and sticky footer (Back / Next navigation).
 * Receives all state + setters as props from App.jsx.
 */
export const Shell = ({ step, goToStep, industry, setIndustry, showIndustry, setShowIndustry, contentRef, children }) => {
  const currentIndustry = INDUSTRIES.find(x => x.key === industry);
  const IndustryIcon = currentIndustry.icon;

  return (
    <div className={styles.root}>
      {/* ── HEADER ── */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.topBar}>
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Adobe" width={28} height={27} className={styles.logo} />
            <div className={styles.divider} />
            <span className={styles.appName}>Experience Decisioning</span>

            {/* Industry dropdown */}
            <div className={styles.dropdownWrap}>
              <button className={styles.dropdownBtn} onClick={() => setShowIndustry(!showIndustry)}>
                <IndustryIcon size={12} color={T.ac} />
                {currentIndustry.label}
                <ChevronDown size={11} color={T.tm} />
              </button>
              {showIndustry && (
                <div className={styles.dropdownMenu}>
                  {INDUSTRIES.map(({ key, label, icon: Icon }) => (
                    <div key={key} onClick={() => { setIndustry(key); setShowIndustry(false); }}
                      className={styles.dropdownItem}
                      style={{ background: industry === key ? T.as : 'transparent', color: industry === key ? T.ac : T.tx, fontWeight: industry === key ? 600 : 400 }}
                      onMouseEnter={e => { if (industry !== key) e.currentTarget.style.background = T.sa; }}
                      onMouseLeave={e => { if (industry !== key) e.currentTarget.style.background = 'transparent'; }}>
                      <Icon size={12} color={industry === key ? T.ac : T.tm} />{label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* Step tabs */}
        <div className={styles.headerInner}>
          <div className={styles.tabRow}>
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => goToStep(i)} className={styles.tab}
                style={{ fontWeight: step === i ? 600 : 400, color: step === i ? T.ac : i < step ? T.tx : T.tm, borderBottom: `2px solid ${step === i ? T.ac : 'transparent'}` }}>
                {s.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div ref={contentRef} className={styles.content} onClick={() => showIndustry && setShowIndustry(false)}>
        {children}
      </div>

      {/* ── FOOTER NAV ── */}
      <div className={styles.footer}>
        <div className={styles.footerInner}>
          <button onClick={() => step > 0 && goToStep(step - 1)} disabled={step === 0}
            className={styles.backBtn}
            style={{ borderColor: step === 0 ? T.bd : T.tx, color: step === 0 ? T.tm : T.tx, opacity: step === 0 ? 0.4 : 1 }}>
            <ChevronLeft size={13} />Back
          </button>
          <span className={styles.counter}>{step + 1}/{STEPS.length}</span>
          <button onClick={() => step < STEPS.length - 1 && goToStep(step + 1)} disabled={step === STEPS.length - 1}
            className={styles.nextBtn}
            style={{ background: step === STEPS.length - 1 ? T.bd : T.ac, color: step === STEPS.length - 1 ? T.tm : '#fff', opacity: step === STEPS.length - 1 ? 0.4 : 1 }}>
            Next<ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
