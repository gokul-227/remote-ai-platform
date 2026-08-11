const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Configuration
const BASE_URL = "http://localhost:3000";
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Test accounts
const ACCOUNTS = {
  engineer: { email: "engineer@workmesh.ai", password: "engineer123" },
  company: { email: "company@workmesh.ai", password: "company123" },
  admin: { email: "admin@workmesh.ai", password: "admin123" },
};

// Routes to capture
const ROUTES = {
  public: [
    { path: "/", name: "home", state: "default" },
    { path: "/auth/login", name: "login", state: "default" },
    { path: "/auth/register", name: "register", state: "default" },
    { path: "/jobs", name: "jobs-list", state: "default" },
    { path: "/jobs/new", name: "jobs-create", state: "default" },
    { path: "/companies", name: "companies-list", state: "default" },
    { path: "/engineers", name: "engineers-list", state: "default" },
    { path: "/feed", name: "feed", state: "default" },
    { path: "/freelancers", name: "freelancers", state: "default" },
    { path: "/groups", name: "groups", state: "default" },
    { path: "/contracts", name: "contracts-list", state: "default" },
    { path: "/projects", name: "projects-list", state: "default" },
    { path: "/quality", name: "quality", state: "default" },
    { path: "/messages", name: "messages", state: "default" },
    { path: "/network", name: "network", state: "default" },
    { path: "/payments", name: "payments", state: "default" },
    { path: "/workspace", name: "workspace", state: "default" },
  ],
  engineer: [
    { path: "/engineer/dashboard", name: "engineer-dashboard", state: "default" },
    { path: "/engineer/applications", name: "engineer-applications", state: "default" },
    { path: "/engineer/profile", name: "engineer-profile", state: "default" },
    { path: "/engineer/recommendations", name: "engineer-recommendations", state: "default" },
    { path: "/engineer/workspace", name: "engineer-workspace", state: "default" },
  ],
  company: [
    { path: "/company/dashboard", name: "company-dashboard", state: "default" },
    { path: "/company/jobs", name: "company-jobs", state: "default" },
    { path: "/company/candidates", name: "company-candidates", state: "default" },
    { path: "/company/profile", name: "company-profile", state: "default" },
  ],
  admin: [
    { path: "/admin/dashboard", name: "admin-dashboard", state: "default" },
  ],
};

async function login(page, account) {
  console.log(`  Logging in as ${account.email}...`);
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "networkidle" });
  await page.fill('input[id="email"]', account.email);
  await page.fill('input[id="password"]', account.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(BASE_URL + "/", { waitUntil: "networkidle" });
  console.log(`  ✓ Logged in as ${account.email}`);
}

async function captureRoute(page, route, role, viewportLabel, screenshotNum) {
  const url = `${BASE_URL}${route.path}`;
  const filename = `${String(screenshotNum).padStart(2, "0")}-${route.name}.png`;
  const filepath = path.join("screenshot-pages", viewportLabel, filename);
  
  try {
    console.log(`  Capturing ${viewportLabel}/${filename} (${url})...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    // Wait a bit for any animations or lazy loading
    await page.waitForTimeout(1000);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`  ✓ Saved ${filepath}`);
    return { file: `${viewportLabel}/${filename}`, route: route.path, role, viewport: viewportLabel === "desktop" ? "1440x900" : "390x844", state: route.state, description: route.name };
  } catch (error) {
    console.log(`  ✗ Failed to capture ${url}: ${error.message}`);
    return null;
  }
}

async function captureAllRoutes(role, routes, account, viewportLabel, startNum, browser) {
  const page = await browser.newPage({ 
    viewport: viewportLabel === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT 
  });
  
  const results = [];
  let num = startNum;
  
  // Login if account provided
  if (account) {
    await login(page, account);
  }
  
  for (const route of routes) {
    const result = await captureRoute(page, route, role, viewportLabel, num);
    if (result) {
      results.push(result);
      num++;
    }
  }
  
  await page.close();
  return { results, nextNum: num };
}

async function main() {
  console.log("Starting Playwright screenshot capture...\n");
  
  const browser = await chromium.launch({ headless: true });
  const allResults = [];
  let screenshotNum = 1;
  
  try {
    // Capture public pages - desktop
    console.log("=== CAPTURING PUBLIC PAGES (DESKTOP) ===");
    const publicDesktop = await captureAllRoutes("public", ROUTES.public, null, "desktop", screenshotNum, browser);
    allResults.push(...publicDesktop.results);
    screenshotNum = publicDesktop.nextNum;
    
    // Capture public pages - mobile
    console.log("\n=== CAPTURING PUBLIC PAGES (MOBILE) ===");
    const publicMobile = await captureAllRoutes("public", ROUTES.public, null, "mobile", screenshotNum, browser);
    allResults.push(...publicMobile.results);
    screenshotNum = publicMobile.nextNum;
    
    // Capture engineer pages - desktop
    console.log("\n=== CAPTURING ENGINEER PAGES (DESKTOP) ===");
    const engineerDesktop = await captureAllRoutes("engineer", ROUTES.engineer, ACCOUNTS.engineer, "desktop", screenshotNum, browser);
    allResults.push(...engineerDesktop.results);
    screenshotNum = engineerDesktop.nextNum;
    
    // Capture engineer pages - mobile
    console.log("\n=== CAPTURING ENGINEER PAGES (MOBILE) ===");
    const engineerMobile = await captureAllRoutes("engineer", ROUTES.engineer, ACCOUNTS.engineer, "mobile", screenshotNum, browser);
    allResults.push(...engineerMobile.results);
    screenshotNum = engineerMobile.nextNum;
    
    // Capture company pages - desktop
    console.log("\n=== CAPTURING COMPANY PAGES (DESKTOP) ===");
    const companyDesktop = await captureAllRoutes("company", ROUTES.company, ACCOUNTS.company, "desktop", screenshotNum, browser);
    allResults.push(...companyDesktop.results);
    screenshotNum = companyDesktop.nextNum;
    
    // Capture company pages - mobile
    console.log("\n=== CAPTURING COMPANY PAGES (MOBILE) ===");
    const companyMobile = await captureAllRoutes("company", ROUTES.company, ACCOUNTS.company, "mobile", screenshotNum, browser);
    allResults.push(...companyMobile.results);
    screenshotNum = companyMobile.nextNum;
    
    // Capture admin pages - desktop
    console.log("\n=== CAPTURING ADMIN PAGES (DESKTOP) ===");
    const adminDesktop = await captureAllRoutes("admin", ROUTES.admin, ACCOUNTS.admin, "desktop", screenshotNum, browser);
    allResults.push(...adminDesktop.results);
    screenshotNum = adminDesktop.nextNum;
    
    // Capture admin pages - mobile
    console.log("\n=== CAPTURING ADMIN PAGES (MOBILE) ===");
    const adminMobile = await captureAllRoutes("admin", ROUTES.admin, ACCOUNTS.admin, "mobile", screenshotNum, browser);
    allResults.push(...adminMobile.results);
    screenshotNum = adminMobile.nextNum;
    
  } finally {
    await browser.close();
  }
  
  // Write manifest.json
  const manifest = { screenshots: allResults };
  fs.writeFileSync(
    path.join("screenshot-pages", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`\n✓ Written manifest.json with ${allResults.length} screenshots`);
  
  // Write README.md
  const readme = generateReadme(allResults);
  fs.writeFileSync(
    path.join("screenshot-pages", "README.md"),
    readme
  );
  console.log(`✓ Written README.md`);
  
  // Summary
  const desktopCount = allResults.filter(r => r.viewport === "1440x900").length;
  const mobileCount = allResults.filter(r => r.viewport === "390x844").length;
  const publicCount = allResults.filter(r => r.role === "public").length;
  const engineerCount = allResults.filter(r => r.role === "engineer").length;
  const companyCount = allResults.filter(r => r.role === "company").length;
  const adminCount = allResults.filter(r => r.role === "admin").length;
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total screenshots: ${allResults.length}`);
  console.log(`Desktop screenshots: ${desktopCount}`);
  console.log(`Mobile screenshots: ${mobileCount}`);
  console.log(`Public routes: ${publicCount / 2}`); // divided by 2 since desktop+mobile
  console.log(`Engineer routes: ${engineerCount / 2}`);
  console.log(`Company routes: ${companyCount / 2}`);
  console.log(`Admin routes: ${adminCount / 2}`);
}

function generateReadme(screenshots) {
  const desktopCount = screenshots.filter(r => r.viewport === "1440x900").length;
  const mobileCount = screenshots.filter(r => r.viewport === "390x844").length;
  const publicRoutes = [...new Set(screenshots.filter(r => r.role === "public").map(r => r.route))].length;
  const engineerRoutes = [...new Set(screenshots.filter(r => r.role === "engineer").map(r => r.route))].length;
  const companyRoutes = [...new Set(screenshots.filter(r => r.role === "company").map(r => r.route))].length;
  const adminRoutes = [...new Set(screenshots.filter(r => r.role === "admin").map(r => r.route))].length;
  
  let md = `# UI Screenshot Baseline\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `- **Total screenshots:** ${screenshots.length}\n`;
  md += `- **Desktop screenshots (1440×900):** ${desktopCount}\n`;
  md += `- **Mobile screenshots (390×844):** ${mobileCount}\n`;
  md += `- **Routes discovered:** ${publicRoutes + engineerRoutes + companyRoutes + adminRoutes}\n`;
  md += `  - Public routes: ${publicRoutes}\n`;
  md += `  - Engineer routes: ${engineerRoutes}\n`;
  md += `  - Company routes: ${companyRoutes}\n`;
  md += `  - Admin routes: ${adminRoutes}\n\n`;
  
  md += `## Screenshots\n\n`;
  md += `| # | File | Route | Role | Viewport | State | Description |\n`;
  md += `|---|------|-------|------|----------|-------|-------------|\n`;
  
  screenshots.forEach((s, i) => {
    md += `| ${i + 1} | ${s.file} | ${s.route} | ${s.role} | ${s.viewport} | ${s.state} | ${s.description} |\n`;
  });
  
  return md;
}

main().catch(console.error);