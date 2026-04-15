import { useState, useRef, useEffect } from 'react';
import { STEPS } from './data/steps';
import { Shell } from './components/Shell/Shell';
import { IntroStep } from './components/steps/IntroStep';
import { SchemaStep } from './components/steps/SchemaStep';
import { ItemsStep } from './components/steps/ItemsStep';
import { CollectionsStep } from './components/steps/CollectionsStep';
import { RulesStep } from './components/steps/RulesStep';
import { RankingStep } from './components/steps/RankingStep';
import { StrategyStep } from './components/steps/StrategyStep';
import { PolicyStep } from './components/steps/PolicyStep';
import { ResultStep } from './components/steps/ResultStep';
import { IndustryDataProvider } from './IndustryContext.jsx';
import './index.css';
import styles from './App.module.css';

const VALID_INDUSTRIES = new Set(['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications', 'public']);

function readInitialIndustry() {
  try {
    const v = localStorage.getItem('aepEdpIndustry');
    if (v && VALID_INDUSTRIES.has(v)) return v;
  } catch (e) {
    /* ignore */
  }
  return 'retail';
}

/* Map step IDs to their component */
const STEP_COMPONENTS = {
  intro: IntroStep,
  schema: SchemaStep,
  items: ItemsStep,
  collections: CollectionsStep,
  rules: RulesStep,
  ranking: RankingStep,
  strategy: StrategyStep,
  policy: PolicyStep,
  result: ResultStep,
};

export default function App() {
  const [step, setStep] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const [industry, setIndustry] = useState(readInitialIndustry);
  const [showIndustry, setShowIndustry] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('aepEdpIndustry', industry);
    } catch (e) {
      /* ignore */
    }
  }, [industry]);

  const goToStep = (i) => {
    setFadeKey((k) => k + 1);
    setStep(i);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const CurrentStep = STEP_COMPONENTS[STEPS[step].id];

  return (
    <div className="edp-sandbox">
      <IndustryDataProvider industry={industry}>
        <Shell
          step={step}
          goToStep={goToStep}
          industry={industry}
          setIndustry={setIndustry}
          showIndustry={showIndustry}
          setShowIndustry={setShowIndustry}
          contentRef={contentRef}
        >
          <div key={fadeKey} className={styles.stepInner}>
            <CurrentStep industry={industry} />
          </div>
        </Shell>
      </IndustryDataProvider>
    </div>
  );
}
