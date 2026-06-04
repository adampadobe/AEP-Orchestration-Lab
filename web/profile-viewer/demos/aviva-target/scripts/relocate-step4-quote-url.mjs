import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const src = path.join(root, 'step4-quote.html');
const destDir = path.join(root, 'quote/Direct/Motor');
const dest = path.join(destDir, 'quote-details.html');

let html = fs.readFileSync(src, 'utf8');
html = html.split('./assets/step4/').join('../../../assets/step4/');
html = html.replace(/src="aviva-demo-head\.js"/g, 'src="../../../aviva-demo-head.js"');
html = html.replace(/src="aviva-target-sdk-resume\.js"/g, 'src="../../../aviva-target-sdk-resume.js"');
html = html.replace(/src="aviva-target-personalization\.js"/g, 'src="../../../aviva-target-personalization.js"');
html = html.replace(/src="aviva-journey-patch\.js"/g, 'src="../../../aviva-journey-patch.js"');

fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(dest, html);
console.log('Wrote', dest);

const redirect = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=quote/Direct/Motor/quote-details.html">
  <title>Redirecting to quote details…</title>
  <script>location.replace('quote/Direct/Motor/quote-details.html');</script>
</head>
<body>
  <p><a href="quote/Direct/Motor/quote-details.html">Continue to your quote</a></p>
</body>
</html>
`;

fs.writeFileSync(src, redirect);
console.log('Wrote redirect stub', src);
