const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log("Navigating to http://localhost:5173 ...");
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

  console.log("Typing login details...");
  // wait for input fields
  await page.waitForSelector('input[placeholder="username"]');
  await page.type('input[placeholder="username"]', 'test12');
  await page.type('input[placeholder="password"]', 'password123');
  
  await page.click('button');
  console.log("Clicked login!");
  
  // wait a bit for the page to react
  await new Promise(r => setTimeout(r, 2000));
  
  await page.screenshot({path: 'screenshot.png'});
  await browser.close();
})();
