import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);
// Inspect the terrain layer's computed style.
const info = await page.evaluate(() => {
  const t = document.querySelector('.aurora-bg__terrain');
  if (!t) return { error: 'no .aurora-bg__terrain element' };
  const cs = getComputedStyle(t);
  return {
    opacity: cs.opacity,
    backgroundImage: cs.backgroundImage.slice(0, 80),
    display: cs.display,
    bgDarkenVar: getComputedStyle(document.documentElement).getPropertyValue('--bg-darken'),
    bgFadeVar: getComputedStyle(document.documentElement).getPropertyValue('--bg-fade'),
  };
});
console.log('TERRAIN:', JSON.stringify(info));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
