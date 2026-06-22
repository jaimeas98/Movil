// Captura de pantalla de la web en varios viewports y estados (escritorio/móvil,
// claro/oscuro, tarjetas y modal). Sirve para revisar el diseño sin abrir el navegador.
//
// Playwright NO está en package.json a propósito (su postinstall descarga ~150MB de
// navegadores y ralentizaría el build de Vercel). Para usar este script en local:
//
//   npm i -D playwright && npx playwright install chromium
//   CARTELERA_SAMPLE=1 npm run dev          # en otra terminal (datos de ejemplo)
//   node scripts/screenshot.mjs /tmp/shots  # genera los PNG
//
// CARTELERA_SAMPLE=1 hace que el agregador rellene con datos de ejemplo cuando las
// webs reales de los cines no son accesibles (p. ej. desde un entorno sin salida).

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  // touch:true → el navegador reporta `hover: none`, igual que un móvil real,
  // para verificar que los horarios se muestran siempre (no solo al hover).
  { name: 'mobile', width: 390, height: 844, touch: true },
];

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`📸 ${OUT}/${name}.png`);
}

async function run() {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        hasTouch: vp.touch,
        isMobile: vp.touch,
      });
      const page = await ctx.newPage();
      // Fijar el tema antes de cargar
      await page.addInitScript((t) => {
        try { localStorage.setItem('theme', t); } catch {}
      }, theme);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await shoot(page, `${vp.name}-${theme}`);

      // Tarjetas (scroll a la primera sección de cine)
      const cinema = page.locator('.cinema').first();
      if (await cinema.count()) {
        await cinema.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await shoot(page, `${vp.name}-${theme}-cards`);
      }

      // Hover sobre la primera tarjeta (solo escritorio: revela horarios)
      const firstPoster = page.locator('.poster').first();
      if (!vp.touch && await firstPoster.count()) {
        await firstPoster.hover();
        await page.waitForTimeout(450);
        await shoot(page, `${vp.name}-${theme}-cards-hover`);
      }

      // Modal (abrir la primera tarjeta haciendo clic en el póster)
      if (await firstPoster.count()) {
        await firstPoster.click();
        await page.waitForTimeout(500);
        await shoot(page, `${vp.name}-${theme}-modal`);
      }
      await ctx.close();
    }
  }
  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
