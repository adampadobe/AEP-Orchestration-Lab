import { useState } from 'react';
import { Mail, Laptop, Smartphone, Bell, MessageSquare, Code, MousePointerClick } from 'lucide-react';
import { FONT_SERIF, FONT_SANS, FONT_MONO, T } from '../../theme';
import { useIndustryData } from '../../IndustryContext.jsx';
import { Badge, Card, Pill, Label } from '../ui';
import styles from './ItemsStep.module.css';

/* Channel definitions for the toggle bar */
const CHANNELS = [
  { k: 'email', ic: Mail, l: 'Email' },
  { k: 'web', ic: Laptop, l: 'Web' },
  { k: 'app', ic: Smartphone, l: 'App' },
  { k: 'push', ic: Bell, l: 'Push' },
  { k: 'sms', ic: MessageSquare, l: 'SMS' },
  { k: 'code', ic: Code, l: 'Code' },
];

/* Step 2 — 10 offer cards + 6 channel preview renderers */
export const ItemsStep = () => {
  const { OFFERS } = useIndustryData();
  const [selected, setSelected] = useState(null);
  const [channel, setChannel] = useState('web');
  const selOffer = OFFERS.find(o => o.id === selected);

  /* Render the right-hand preview based on selected channel */
  const renderPreview = () => {
    if (!selOffer) {
      return (
        <Card style={{ background: T.sa, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
          <MousePointerClick size={22} color={T.bd} />
          <p style={{ fontFamily: FONT_SANS, fontSize: 11, color: T.tm, textAlign: 'center', marginTop: 6 }}>Click an offer to preview</p>
        </Card>
      );
    }

    const OfferIcon = selOffer.icon;
    const isDark = channel === 'push' || channel === 'sms' || channel === 'code';

    return (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ background: isDark ? '#1B1B1B' : T.sa, padding: isDark ? 16 : channel === 'email' ? 0 : channel === 'app' ? '12px 36px 0' : 0 }}>
          {channel === 'email' && (
            <div style={{ background: T.sf, overflow: 'hidden' }}>
              <div style={{ background: selOffer.color, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, background: '#ffffff30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <OfferIcon size={10} color="#fff" />
                </div>
                <span style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 600, color: '#fff' }}>Your Store</span>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: FONT_SANS, fontSize: 10, color: T.tm, marginBottom: 8 }}>Subject: {selOffer.name} — Just for you</div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 700, color: T.tx, marginBottom: 6 }}>{selOffer.name}</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: T.tm, marginBottom: 12, lineHeight: 1.5 }}>{selOffer.desc}. Don't miss out — this offer is available for a limited time only.</div>
                <div style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 6, background: selOffer.color, color: '#fff', fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600 }}>Shop Now →</div>
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.bd}`, fontFamily: FONT_SANS, fontSize: 8, color: T.tm }}>You're receiving this because you opted into marketing emails. Unsubscribe</div>
              </div>
            </div>
          )}

          {channel === 'push' && (
            <div style={{ background: '#2a2a2a', borderRadius: 6, padding: '12px 14px', border: '1px solid #333' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: selOffer.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <OfferIcon size={10} color={selOffer.color} />
                </div>
                <span style={{ fontFamily: FONT_SANS, fontSize: 9, color: '#999' }}>Your Store · now</span>
              </div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, color: '#fff' }}>{selOffer.name}</div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 10, color: '#aaa', marginTop: 2 }}>{selOffer.desc}</div>
            </div>
          )}

          {channel === 'sms' && (
            <div style={{ background: '#2a2a2a', borderRadius: 6, padding: '14px 16px', border: '1px solid #333', maxWidth: 280 }}>
              <div style={{ background: '#363636', borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ fontFamily: FONT_SANS, fontSize: 11.5, color: '#eee', lineHeight: 1.5 }}>
                  {selOffer.name}: {selOffer.desc}. Reply STOP to opt out.
                </div>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#666', textAlign: 'center' }}>SMS · Your Store</div>
            </div>
          )}

          {channel === 'code' && (
            <div style={{ background: '#1e1e1e', borderRadius: 4, padding: 16, border: '1px solid #333' }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#666', marginBottom: 10 }}>// JSON payload — Code-Based Experience</div>
              <pre style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: '#d4d4d4', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>{
`{
  "name": "${selOffer.name}",
  "description": "${selOffer.desc}",
  "type": "${selOffer.type}",
  "priority": ${selOffer.priority},
  "cta": "Shop Now →",
  "imageUrl": "https://cdn.store.com/...",
  "surface": "web://store.com/#hero-banner"
}`
              }</pre>
            </div>
          )}

          {(channel === 'web' || channel === 'app') && (
            <div style={{ borderRadius: channel === 'app' ? '4px 4px 0 0' : 0, overflow: 'hidden', border: channel === 'app' ? `1px solid ${T.bd}` : 'none' }}>
              <img src={selOffer.img} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '12px 14px', background: T.sf }}>
                <div style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 700, color: T.tx }}>{selOffer.name}</div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 11, color: T.tm, margin: '3px 0 8px' }}>{selOffer.desc}</div>
                <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: 7, background: selOffer.color, color: '#fff', fontFamily: FONT_SANS, fontSize: 10, fontWeight: 600 }}>Shop Now →</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.bd}` }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Badge color={selOffer.color}>{selOffer.type}</Badge>
            <Badge color={T.tm}>{selOffer.margin} margin</Badge>
            <Badge color={T.tm}>{selOffer.category}</Badge>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <Label>Step 02 — Your Offers</Label>
      <h1 className={styles.title}>Decision Items</h1>
      <p className={styles.desc}>Click any offer card. Use the channel toggle to preview how it renders on web, app, or push.</p>

      <div className={styles.channelBar}>
        {CHANNELS.map(c => (
          <Pill key={c.k} active={channel === c.k} onClick={() => setChannel(c.k)} color={T.bl}>
            <c.ic size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />{c.l}
          </Pill>
        ))}
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.offerGrid}>
          {OFFERS.map(item => {
            const Icon = item.icon;
            const active = selected === item.id;
            const hasChannel = item.channels.includes(channel);
            return (
              <Card key={item.id} hoverable onClick={() => setSelected(active ? null : item.id)}
                style={{ padding: 12, borderLeft: `3px solid ${item.color}`, opacity: hasChannel ? 1 : 0.3, background: active ? item.color + '05' : T.sf }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: item.color + '10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} color={item.color} />
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: item.color }}>{item.priority}</div>
                </div>
                <h3 className={styles.offerName}>{item.name}</h3>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Badge color={item.color}>{item.type}</Badge>
                  {!hasChannel && <Badge color={T.tm}>No {channel}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
        <div className={styles.previewCol}>
          {renderPreview()}
        </div>
      </div>
    </div>
  );
};
