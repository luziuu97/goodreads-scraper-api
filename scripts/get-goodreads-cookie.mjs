
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const GOODREADS_LOGIN_URL = 'https://www.goodreads.com/user/sign_in';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Show the browser so the user can log in
    defaultViewport: null,
  });

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
           window.location.href.startsWith('https://www.goodreads.com/?');
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
})();
