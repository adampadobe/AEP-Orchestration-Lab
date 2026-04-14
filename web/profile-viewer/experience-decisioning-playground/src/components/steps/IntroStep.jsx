import { ArrowRight } from 'lucide-react';
import { T } from '../../theme';
import { CardExplorer } from './CardExplorer';
import styles from './IntroStep.module.css';

/* Step 0 — Welcome screen with the 3-box story, then interactive card explorer */
export const IntroStep = () => (
  <div className={styles.wrapper}>
    <div className={styles.module}>A module of Adobe Journey Optimizer</div>

    <h1 className={styles.heading}>Experience Decisioning</h1>

    <p className={styles.intro}>
      Your online shop runs 10 different promotions at the same time. A customer lands on your homepage — which offer should they see? Experience Decisioning answers that question automatically, for every visitor, in real time.
    </p>

    {/* Visual story: the problem → the engine → the result */}
    <div className={styles.storyRow}>
      {[
        { title: '10 offers compete', sub: 'for the same slot' },
        { title: 'The engine evaluates', sub: 'rules, ranking, context' },
        { title: '1 winner', sub: 'per customer, per visit' },
      ].map((box, i) => (
        <div key={i} className={styles.storyGroup}>
          {i > 0 && <ArrowRight size={18} color={T.tm} />}
          <div className={styles.storyBox}>
            <div className={styles.storyTitle}>{box.title}</div>
            <div className={styles.storySub}>{box.sub}</div>
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
