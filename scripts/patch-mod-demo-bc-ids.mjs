import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'profile-viewer');

const reps = [
  ['window.ModDemoBcConfig', 'window.SiteCloneBcConfig'],
  ['ModDemoBcConfig', 'SiteCloneBcConfig'],
  ['window.ModDemoBc', 'window.SiteCloneBc'],
  ['invalidateModDemoBcCore', 'invalidateSiteCloneBcCore'],
  ['syncModDemoBcFromPrefs', 'syncSiteCloneBcFromPrefs'],
  ["'army-bc/styleConfigurations-6a0992.js'", "'embed-bc/styleConfigurations-6a0992.js'"],
  ['modBcStyleConfigUrl', 'siteCloneBcStyleConfigUrl'],
  ['modBcDatastreamId', 'siteCloneBcDatastreamId'],
  ['modBcDatastreamList', 'siteCloneBcDatastreamList'],
  ['modBcDatastreamHint', 'siteCloneBcDatastreamHint'],
  ['modBcStyleConfigResolved', 'siteCloneBcStyleConfigResolved'],
  ['modBcFullScreenToggle', 'siteCloneBcFullScreenToggle'],
  ['modBcModalToggle', 'siteCloneBcModalToggle'],
  ['modBcInjectedToggle', 'siteCloneBcInjectedToggle'],
  ['MOD_BC_STYLE_URL', 'SC_BC_STYLE_URL'],
  ['MOD_BC_DATASTREAM', 'SC_BC_DATASTREAM'],
  ['MOD_BC_PREFS', 'SC_BC_PREFS'],
  ['modDemoBcStyleConfigUrl', 'siteCloneBcStyleConfigUrlBySandbox'],
  ['modDemoBcDatastreamId', 'siteCloneBcDatastreamIdBySandbox'],
  ['modDemoBcDisplayPrefs', 'siteCloneBcDisplayPrefs'],
  ['getModBc', 'getSiteCloneBc'],
  ['readPersistedModBc', 'readPersistedSiteCloneBc'],
  ['saveModBc', 'saveSiteCloneBc'],
  ['applyModBc', 'applySiteCloneBc'],
  ['loadModBc', 'loadSiteCloneBc'],
  ['renderModBc', 'renderSiteCloneBc'],
  ['resolveModBc', 'resolveSiteCloneBc'],
  ['sanitiseModBc', 'sanitiseSiteCloneBc'],
  ['refreshModBc', 'refreshSiteCloneBc'],
  ['findModBc', 'findSiteCloneBc'],
  ['__modDemoSuppressBcEnable', '__siteCloneSuppressBcEnable'],
  ["'modBcFullScreenToggle', 'modBcModalToggle', 'modBcInjectedToggle'", "'siteCloneBcFullScreenToggle', 'siteCloneBcModalToggle', 'siteCloneBcInjectedToggle'"],
  ['data-mod-bc-style-url', 'data-site-clone-bc-style-url'],
];

const extraReps = [
  ['initModBcDisplayPrefs', 'initSiteCloneBcDisplayPrefs'],
  ['initModBcStyleConfigUrl', 'initSiteCloneBcStyleConfigUrl'],
  ['initModBcDatastreamPicker', 'initSiteCloneBcDatastreamPicker'],
  ['initModBcOnInjectToggle', 'initSiteCloneBcOnInjectToggle'],
  ['writeModWebPushOnInject', 'writeSkyWebPushOnInject'],
  ['applyModWebPushOnInjectToggle', 'applySkyWebPushOnInjectToggle'],
  ['applyModDemoEnvForCurrentSandbox', 'applySkyDemoEnvForCurrentSandbox'],
  ['flushModDemoEnvForSandboxKey', 'flushSkyDemoEnvForSandboxKey'],
  ['initModDemoSandboxAndEnvBar', 'initSkyDemoSandboxAndEnvBar'],
];

for (const file of ['mod-demo.js', 'mod-demo.css', 'sky-demo.js']) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  const all = file === 'sky-demo.js' ? [...reps, ...extraReps] : [...reps, ...extraReps.filter(([a]) => !a.includes('Sky') && !a.includes('sky')];
  for (const [a, b] of all) s = s.split(a).join(b);
  fs.writeFileSync(p, s);
  console.log('patched', file);
}
