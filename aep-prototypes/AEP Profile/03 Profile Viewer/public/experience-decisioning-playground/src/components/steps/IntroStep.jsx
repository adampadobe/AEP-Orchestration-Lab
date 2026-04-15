import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { T } from '../../theme';
import { CardExplorer } from './CardExplorer';
import styles from './IntroStep.module.css';

const EXPERIMENTATION_INTRO_BY_INDUSTRY = {
  media: [
    'Your media brand wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A viewer reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across a defined audience, over time.',
  ],
  travel: [
    'Your travel brand wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A traveller reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across a defined audience, over time.',
  ],
  retail: [
    'Your retail brand wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A shopper reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across a defined audience, over time.',
  ],
  fsi: [
    'Your financial institution wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A customer reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across eligible audiences and products, over time.',
  ],
  telecommunications: [
    'Your telecommunications brand wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A subscriber reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across segments and lines of business, over time.',
  ],
  sports: [
    'Your sports organisation wants to test different messages, layouts, or offers to understand what drives better engagement or conversion.',
    'A fan reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across defined fan segments, over time.',
  ],
  public: [
    'Your public-sector organisation wants to test different messages, layouts, or offers to understand what drives better service uptake or outcomes.',
    'A resident reaches a touchpoint where experimentation is enabled — which variant should they see?',
    'The walkthrough below shows how experimentation answers that systematically, across eligible cohorts, over time.',
  ],
};

function isExperimentationOverviewPath() {
  try {
    return typeof window !== 'undefined' && window.location.pathname.includes('experimentation-overview');
  } catch {
    return false;
  }
}

/* Step 0 — Welcome screen with the 3-box story, then interactive card explorer */
export const IntroStep = ({ industry = 'retail' }) => {
  const isExperimentation = useMemo(() => isExperimentationOverviewPath(), []);
  const expParagraphs =
    EXPERIMENTATION_INTRO_BY_INDUSTRY[industry] ?? EXPERIMENTATION_INTRO_BY_INDUSTRY.media;

  return (
  <div className={styles.wrapper}>
    <div className={styles.module}>A module of Adobe Journey Optimizer</div>

    <h1 className={styles.heading}>{isExperimentation ? 'Experimentation overview' : 'Decisioning overview'}</h1>

    {isExperimentation ? (
      <div className={styles.introStack}>
        {expParagraphs.map((text, i) => (
          <p key={i} className={styles.intro}>
            {text}
          </p>
        ))}
      </div>
    ) : (
      <p className={styles.intro}>
        Your online shop runs 10 different promotions at the same time. A customer lands on your homepage — which offer
        should they see? The walkthrough below shows how decisioning answers that automatically, for every visitor, in real
        time.
      </p>
    )}

    {/* Visual story: the problem → the engine → the result */}
    <div className={styles.storyRow}>
      {[
        { title: '1 control + N variants compete', sub: '' },
        { title: 'allocation logic distributes audience', sub: '' },
        { title: 'performance determines winner', sub: '' },
      ].map((box, i) => (
        <div key={i} className={styles.storyGroup}>
          {i > 0 && <ArrowRight size={18} color={T.tm} />}
          <div className={styles.storyBox}>
            <div className={styles.storyTitle}>{box.title}</div>
            {box.sub ? <div className={styles.storySub}>{box.sub}</div> : null}
          </div>
        </div>
      ))}
    </div>

    <p className={styles.bridgeText}>
      But how does the engine actually decide? Explore the building blocks below — expand each layer and click the info icons to see how policies, strategies, and ranking methods work together.
    </p>

    <CardExplorer />
  </div>
  );
};
