#!/usr/bin/env node

/**
 * EmpirePicks Deployment Check Script
 * -----------------------------------
 * Ensures the project is valid before deployment to Vercel.
 *
 * Checks:
 * 1. Required files exist
 * 2. vercel.json is valid and correctly configured
 * 3. Environment variables exist
 * 4. Odds API connectivity works
 * 5. API routes compile without syntax errors
 * 6. Front-end files reachable
 */

import fs from "fs";
import { execSync } from "child_process";
import fetch from "node-fetch";

const REQUIRED_FILES = [
  "index.html",
  "styles.css",
  "script.js",
  "teams.js",
  "vercel.json",
  "api/events.js",
  "api/props.js"
];

// --------------------------------------------
// Helper logging
// --------------------------------------------
function pass(msg) {
  console.log(`✔ PASS: ${msg}`);
}
function fail(msg) {
  console.error(`✘ FAIL: ${msg}`);
  process.exit(1);
}

// --------------------------------------------
// 1. Verify required files exist
// --------------------------------------------
console.log("Checking required project files...");

REQUIRED_FILES.forEach(file => {
  if (!fs.existsSync(file)) fail(`Missing file: ${file}`);
});

pass("All required files present.");


// --------------------------------------------
// 2. Validate vercel.json
// --------------------------------------------
console.log("\nValidating vercel.json...");

let vercel;
try {
  vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
} catch (err) {
  fail("vercel.json is not valid JSON.");
}

if (!vercel.builds || !Array.isArray(vercel.builds))
  fail("vercel.json missing 'builds' section.");

if (!vercel.routes || !Array.isArray(vercel.routes))
  fail("vercel.json missing 'routes' section.");

pass("vercel.json structure OK.");


// --------------------------------------------
// 3. Check environment variables
// --------------------------------------------
console.log("\nChecking required environment variables...");

if (!process.env.ODDS_API_KEY) {
  fail("Environment variable ODDS_API_KEY is missing.");
}

pass("Environment variables OK.");


// --------------------------------------------
// 4. Try hitting The Odds API (connectivity test)
// --------------------------------------------
console.log("\nTesting Odds API connectivity...");

async function testAPI() {
  const url =
    `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?` +
    `apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h`;

  try {
    const r = await fetch(url);
    if (!r.ok) fail(`Odds API returned ${r.status}`);

    const data = await r.json();
    if (!Array.isArray(data)) fail("Odds API returned unexpected data.");

    pass("Odds API connectivity OK.");
  } catch (err) {
    fail("Error connecting to Odds API: " + err.message);
  }
}

await testAPI();


// --------------------------------------------
// 5. Compile API routes to ensure no syntax errors
// --------------------------------------------
console.log("\nTesting serverless API syntax...");

function checkCompile(path) {
  try {
    execSync(`node --check ${path}`);
    pass(`${path} syntax OK.`);
  } catch (e) {
    fail(`Syntax error in ${path}`);
  }
}

checkCompile("api/events.js");
checkCompile("api/props.js");


// --------------------------------------------
// 6. Check front-end static files loadable
// --------------------------------------------
console.log("\nChecking frontend asset availability...");

["index.html", "styles.css", "script.js", "teams.js"].forEach(a => {
  if (!fs.existsSync(a)) fail(`Frontend asset missing: ${a}`);
});

pass("Frontend assets check OK.");


// --------------------------------------------
// Done
// --------------------------------------------
console.log("\n=====================================");
console.log(" EmpirePicks Deployment Check: PASS ");
console.log("=====================================");
process.exit(0);