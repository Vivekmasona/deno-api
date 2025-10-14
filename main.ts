// export_cookies.ts
import puppeteer from 'https://deno.land/x/puppeteer@v0.4.0/mod.ts';

async function exportCookies() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.youtube.com');
  console.log('Please log in to your YouTube account.');
  await page.waitForTimeout(30000); // Wait for 30 seconds for manual login

  const cookies = await page.cookies();
  const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

  await Deno.writeTextFile('cookies.txt', JSON.stringify(cookies, null, 2));
  await Deno.writeTextFile('cookie-header.txt', cookieHeader);

  console.log('Cookies saved to cookies.txt and cookie-header.txt');
  await browser.close();
}

exportCookies();
