import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const src = path.join(
  repoRoot,
  'web/profile-viewer/assets/style-config-army-recruitment.json',
);
const out = path.join(repoRoot, 'web/profile-viewer/styleConfigurations-mod-demo-army.js');

const raw = fs.readFileSync(src, 'utf8');
const obj = JSON.parse(raw);

obj.behavior = obj.behavior || {};
obj.behavior.input = obj.behavior.input || {};
obj.behavior.input.showAiChatIcon = false;
obj.behavior.disclaimer = {
  attachWithInput: true,
  useDynamicDisclaimerMinHeight: true,
};
obj.visualProfile = {
  sendIconIconColor: '#FFFFFF',
  sendIconBackgroundColor: '#292929',
};

const header =
  '/**\n' +
  ' * Brand Concierge styling — Army recruitment export for MOD (British Army) demo.\n' +
  ' * Built from: web/profile-viewer/assets/style-config-army-recruitment.json\n' +
  ' * Overrides: showAiChatIcon=false; behavior.disclaimer shell from lab defaults.\n' +
  ' */\n';

const body = `window.styleConfiguration = ${JSON.stringify(obj, null, 2)};\n`;
fs.writeFileSync(out, header + body, 'utf8');
console.log('Wrote', out);
