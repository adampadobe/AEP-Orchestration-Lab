/**
 * Smoke test: Lines tool — draw a connector, single-click the stroke to add bend(s).
 * Run from repo root: node web/profile-viewer/scripts/e2e-architecture-line-bend.mjs
 * Requires: npm install -D playwright (chromium will download on first run).
 */
import { chromium } from 'playwright';

const url =
  process.env.ARCH_PAGE_URL ||
  'https://aep-orchestration-lab.web.app/profile-viewer/aep-architecture-apps.html';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.locator('#archEditModeToggle').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#archEditModeToggle').click();
  await page.locator('#archEditorRailSources').click();

  const svg = page.locator('.arch-int-svg-wrap svg').first();
  await svg.waitFor({ state: 'visible', timeout: 15000 });
  const box = await svg.boundingBox();
  if (!box) {
    throw new Error('SVG has no bounding box');
  }

  const hitsBefore = await page.locator('#layer-user-lines .arch-user-line-hit').count();

  const x1 = box.x + box.width * 0.2;
  const y1 = box.y + box.height * 0.35;
  const x2 = box.x + box.width * 0.78;
  const y2 = box.y + box.height * 0.42;
  await page.mouse.click(x1, y1);
  await page.mouse.click(x2, y2);

  await page.waitForFunction(
    (n) => document.querySelectorAll('#layer-user-lines .arch-user-line-hit').length > n,
    hitsBefore,
    { timeout: 15000 }
  );

  const drawnHit = page.locator('#layer-user-lines .arch-user-line-hit').last();
  await drawnHit.waitFor({ state: 'visible', timeout: 5000 });

  const afterDraw = await page.locator('#layer-user-line-handles .arch-user-line-handle').count();
  if (afterDraw !== 2) {
    throw new Error(`Expected 2 endpoint handles after two-click draw, got ${afterDraw}`);
  }

  /**
   * Fire click with correct clientX/Y on the hit path (matches archUserLineOnConnectorStrokeClick).
   */
  async function clickOnHitPathFraction(frac) {
    const ok = await page.evaluate((f) => {
      const list = document.querySelectorAll('#layer-user-lines .arch-user-line-hit');
      const el = list[list.length - 1];
      if (!el) return false;
      const len = el.getTotalLength();
      const p = el.getPointAtLength(len * f);
      const svg = el.ownerSVGElement;
      if (!svg) return false;
      const ptSvg = svg.createSVGPoint();
      ptSvg.x = p.x;
      ptSvg.y = p.y;
      const ctm = el.getScreenCTM();
      if (!ctm) return false;
      const scr = ptSvg.matrixTransform(ctm);
      const ev = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: scr.x,
        clientY: scr.y,
        button: 0,
      });
      el.dispatchEvent(ev);
      return true;
    }, frac);
    if (!ok) throw new Error('Could not dispatch click on hit path');
    await page.waitForTimeout(400);
  }

  // Line is selected after draw — first stroke click adds a bend (skip only applies when changing selection).
  await clickOnHitPathFraction(0.5);

  const afterBend1 = await page.locator('#layer-user-line-handles .arch-user-line-handle').count();
  if (afterBend1 < 3) {
    throw new Error(`Expected >=3 handles after first bend insert, got ${afterBend1}`);
  }

  await clickOnHitPathFraction(0.28);

  const afterBend2 = await page.locator('#layer-user-line-handles .arch-user-line-handle').count();
  if (afterBend2 < 4) {
    throw new Error(`Expected >=4 handles after second bend insert, got ${afterBend2}`);
  }

  console.log('e2e-architecture-line-bend: OK', { afterDraw, afterBend1, afterBend2 });
  await browser.close();
}

main().catch((err) => {
  console.error('e2e-architecture-line-bend: FAIL', err);
  process.exit(1);
});
