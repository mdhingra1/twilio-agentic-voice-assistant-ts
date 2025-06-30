#!/usr/bin/env node

/**
 * Railway Deployment Script
 * Reads .env.production file and sets environment variables in Railway, then deploys
 */

import { spawn, execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

console.log("🚀 Railway Deployment Script");
console.log("============================\n");

// Check if .env file exists
const envPath = join(rootDir, ".env.production");
if (!existsSync(envPath)) {
  console.error("❌ No .env.production file found in project root");
  console.error(
    "   Please create .env.production with your environment variables"
  );
  process.exit(1);
}

console.log("✅ Found .env.production file");

// Parse .env.production file
function parseEnvFile(filePath) {
  const envVars = {};
  const envContent = readFileSync(filePath, "utf8");

  envContent.split("\n").forEach((line) => {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) return;

    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").trim();
      // Remove surrounding quotes if present
      const cleanValue = value.replace(/^["'](.*)["']$/, "$1");
      envVars[key.trim()] = cleanValue;
    }
  });

  return envVars;
}

// Execute command and return promise
function execCommand(command, description) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 ${description}...`);

    const child = spawn("sh", ["-c", command], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: rootDir,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data;
    });

    child.stderr.on("data", (data) => {
      stderr += data;
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

// Set environment variable in Railway
async function setRailwayVar(key, value) {
  try {
    await execCommand(
      `railway variables --set "${key}=${value}"`,
      `Setting ${key}`
    );
    return true;
  } catch (error) {
    console.warn(`   ⚠️ Failed to set ${key}: ${error.message}`);
    return false;
  }
}

// Main deployment function
async function deploy() {
  try {
    // Parse environment variables
    console.log(
      "📝 Reading environment variables from .env.production file..."
    );
    const envVars = parseEnvFile(envPath);

    const envKeys = Object.keys(envVars);
    console.log(`   Found ${envKeys.length} environment variables`);

    if (envKeys.length === 0) {
      console.warn("⚠️ No environment variables found in .env.production file");
    } else {
      console.log("\n🔧 Setting environment variables in Railway...");

      let successCount = 0;
      for (const [key, value] of Object.entries(envVars)) {
        if (await setRailwayVar(key, value)) {
          successCount++;
        }
      }

      console.log(
        `✅ Successfully set ${successCount}/${envKeys.length} environment variables`
      );
    }

    // Get Railway domain and set HOSTNAME
    console.log("\n🌐 Setting HOSTNAME for Railway domain...");
    try {
      const statusOutput = await execCommand(
        "railway status --json",
        "Getting Railway status"
      );
      const status = JSON.parse(statusOutput);

      let railwayDomain = "";
      if (status.deployments && status.deployments.length > 0) {
        const url = status.deployments[0].url || "";
        railwayDomain = url.replace(/^https?:\/\//, "");
      }

      if (railwayDomain) {
        await setRailwayVar("HOSTNAME", railwayDomain);
        console.log(`   Set HOSTNAME to ${railwayDomain}`);
      } else {
        console.warn("   ⚠️ Could not determine Railway domain");
      }
    } catch (error) {
      console.warn("   ⚠️ Could not set HOSTNAME:", error.message);
    }

    // Deploy to Railway
    console.log("\n🚀 Deploying to Railway...");
    await execCommand("railway up --detach", "Deploying application");

    console.log("\n🎉 Deployment complete!");
    console.log(
      "\n📊 Your app should now be running with all environment variables!"
    );

    // Get final status
    try {
      const statusOutput = await execCommand(
        "railway status --json",
        "Getting final status"
      );
      const status = JSON.parse(statusOutput);

      if (status.deployments && status.deployments.length > 0) {
        const url = status.deployments[0].url;
        if (url) {
          console.log(`\n✅ Your app is deployed at: ${url}`);
          console.log("\n📞 Update your Twilio webhooks to:");
          console.log(`   Incoming Call: ${url}/incoming-call`);
          console.log(`   Call Status:   ${url}/call-status`);
        }
      }
    } catch (error) {
      console.warn("⚠️ Could not get deployment URL - check Railway dashboard");
    }
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

// Run deployment
deploy();
