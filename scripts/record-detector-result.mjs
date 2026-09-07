import { recordDetectorResult } from "./lib/evaluation-records.mjs";

const args = process.argv.slice(2);
if (args.length < 5 || args.length > 6 || args.includes("--help")) {
  console.log("Usage: node scripts/record-detector-result.mjs RUN_DIRECTORY full|body DETECTOR_HTTPS_URL SCORE probability|text-share|unknown [NOTE]");
  process.exit(args.includes("--help") ? 0 : 1);
}
const [directory, scope, detector, score, meaning, note] = args;
try {
  console.log(JSON.stringify(await recordDetectorResult({ directory, scope, detector, score, meaning, note })));
} catch (error) {
  // Filesystem errors can contain user paths; do not print raw error details.
  console.error(error.code || error instanceof SyntaxError ? "Could not read or save the evaluation record." : error.message);
  process.exitCode = 1;
}
