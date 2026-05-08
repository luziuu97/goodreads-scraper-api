
import puppeteer from 'puppeteer';

const GOODREADS_LOGIN_URL = 'https://www.goodreads.com/user/sign_in';

async function launchBrowserWithFallback() {
  const launchConfigs = [
    {
      name: 'chrome-channel',
      options: {
        headless: false,
        defaultViewport: null,
        channel: 'chrome',
        timeout: 30000,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },
    {
      name: 'bundled-chromium',
      options: {
        headless: false,
        defaultViewport: null,
        timeout: 30000,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },
  ];

  let lastError = null;
  for (const config of launchConfigs) {
    try {
      console.log(`Trying launch strategy: ${config.name}...`);
      const browser = await puppeteer.launch(config.options);
      console.log(`Browser launched with strategy: ${config.name}`);
      return browser;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Launch strategy "${config.name}" failed: ${message}`);
    }
  }

  throw lastError || new Error('Unable to launch browser');
}

(async () => {
  console.log('Launching browser...');
  const browser = await launchBrowserWithFallback();

  const page = await browser.newPage();

  console.log(`Navigating to ${GOODREADS_LOGIN_URL}...`);
  await page.goto(GOODREADS_LOGIN_URL);

  console.log('Please log in to Goodreads in the opened browser window.');
  console.log('Waiting for you to be redirected to the homepage...');

  // Wait for the URL to indicate we are logged in (usually just goodreads.com or we can check for a specific element)
  // We'll wait indefinitely until the user manually closes the browser or we detect success.
  // A simple check is waiting for the URL to NOT include "sign_in" and maybe include query params or be just goodreads.com
  
  await page.waitForFunction(() => {
    return window.location.href === 'https://www.goodreads.com/' || 
           window.location.href.startsWith('https://www.goodreads.com/?') ||
           window.location.href.includes('/user/show/');
  }, { timeout: 0 }); // No timeout, wait as long as user takes

  console.log('Login detected! Capturing cookies...');

  // Get all cookies
  const cookies = await page.cookies();
  
  // Create the Cookie header string
  // We primarily need 'session-id', 'ubid-main', 'x-main', 'at-main', 'sess-at-main' etc.
  // But usually sending all of them is safest.
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  console.log('\n--- COPIED COOKIES ---');
  console.log(cookieString);
  console.log('----------------------\n');
  
  console.log('You can now paste the string above into your .env file as GOODREADS_SESSION_COOKIE');
  console.log('Or I can try to append it for you if you want.');

  // Optional: Write to a temp file or directly to .env
  
  await browser.close();
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\nFailed to run cookie capture script.');
  console.error(message);
  console.error('\nIf this is a browser install issue, run:');
  console.error('npx puppeteer browsers install chrome');
  process.exit(1);
});
