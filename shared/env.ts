import "dotenv-flow/config";
import log from "../lib/logger.js";

const errors: string[] = [];
const addError = (msg: string) => {
  log.red(msg);
  errors.push(msg);
};
const missingRequired = (env: string) =>
  addError(`Missing environment variable ${env}`);

const warn = (msg: string) => log.yellow(msg);
const warnMissing = (env: string) =>
  warn(`(warning) Missing environment variable ${env}`);

/****************************************************
 Required Env Variables
****************************************************/
export const HOSTNAME = process.env.HOSTNAME as string;
if (!HOSTNAME) missingRequired("HOSTNAME");
else if (!isValidHostname(HOSTNAME)) {
  warn(
    "Invalid HOSTNAME. Only include the hostname, e.g. domain.com or sub.domain.com, not the other URL elements, e.g. http://"
  );
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string;
if (!OPENAI_API_KEY) missingRequired("OPENAI_API_KEY");

export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID as string;
export const TWILIO_API_KEY = process.env.TWILIO_API_KEY as string;
export const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET as string;
if (!TWILIO_ACCOUNT_SID) missingRequired("TWILIO_ACCOUNT_SID");
if (!TWILIO_API_KEY) missingRequired("TWILIO_API_KEY");
if (!TWILIO_API_SECRET) missingRequired("TWILIO_API_SECRET");

export const TWILIO_SYNC_SVC_SID = process.env.TWILIO_SYNC_SVC_SID as string;
if (!TWILIO_SYNC_SVC_SID) missingRequired("TWILIO_SYNC_SVC_SID");

export const PINECONE_API_KEY = process.env.PINECONE_API_KEY as string;
export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME as string;
if (!PINECONE_API_KEY) missingRequired("PINECONE_API_KEY");
if (!PINECONE_INDEX_NAME) missingRequired("PINECONE_INDEX_NAME");

export const SEGMENT_PROFILE_API_TOKEN = process.env.SEGMENT_PROFILE_API_TOKEN as string;
export const SEGMENT_TRACKING_WRITE_KEY = process.env.SEGMENT_TRACKING_WRITE_KEY as string;
export const SEGMENT_WORKSPACE_ID = process.env.SEGMENT_WORKSPACE_ID as string;
export const SEGMENT_SPACE_ID = process.env.SEGMENT_SPACE_ID as string;
if (!SEGMENT_PROFILE_API_TOKEN) missingRequired("SEGMENT_PROFILE_API_TOKEN");
if (!SEGMENT_TRACKING_WRITE_KEY) missingRequired("SEGMENT_TRACKING_WRITE_KEY");
if (!SEGMENT_WORKSPACE_ID) missingRequired("SEGMENT_WORKSPACE_ID");
if (!SEGMENT_SPACE_ID) missingRequired("SEGMENT_SPACE_ID");

/****************************************************
 Optional Env Variables
****************************************************/
export const DEFAULT_TWILIO_NUMBER = process.env.DEFAULT_TWILIO_NUMBER;
if (!DEFAULT_TWILIO_NUMBER) warnMissing("DEFAULT_TWILIO_NUMBER");

export const DEVELOPERS_PHONE_NUMBER = process.env.DEVELOPERS_PHONE_NUMBER;

export const FLEX_WORKFLOW_SID = process.env.FLEX_WORKFLOW_SID as string; // required for transfer to flex

export const IS_TRANSFER_TO_FLEX_ENABLED = !!FLEX_WORKFLOW_SID;

if (IS_TRANSFER_TO_FLEX_ENABLED)
  console.log("Flex: Transfer to agent is enabled");
else log.yellow("Flex: Transfer to Flex is disabled. Env vars missing");

export const FLEX_WORKSPACE_SID = process.env.FLEX_WORKSPACE_SID as string; // required to ask agent a question
export const FLEX_QUEUE_SID = process.env.FLEX_QUEUE_SID as string; // required to ask agent a question
export const FLEX_WORKER_SID = process.env.FLEX_WORKER_SID as string; // required to ask agent a question
export const TWILIO_CONVERSATIONS_SVC_SID = process.env
  .TWILIO_CONVERSATIONS_SVC_SID as string;

export const IS_ASK_FLEX_AGENT_ENABLED =
  !!FLEX_WORKSPACE_SID &&
  !!FLEX_WORKFLOW_SID &&
  !!FLEX_QUEUE_SID &&
  !!FLEX_WORKER_SID &&
  !!TWILIO_CONVERSATIONS_SVC_SID;

if (IS_ASK_FLEX_AGENT_ENABLED)
  console.log("Flex: Live agent conversation enabled");
else log.yellow("Flex: Live agent conversation disabled. Env vars missing");

/****************************************************
 Environment Configuration
****************************************************/
export const PORT = process.env.PORT ?? "3333";

/****************************************************
 Validation Helpers
****************************************************/
// Helper function to validate hostname using RFC-1123
function isValidHostname(hostname: string): boolean {
  return /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/.test(
    hostname
  );
}

// throw if any required variables are missing
if (errors.length) {
  throw Error(
    `Environment validation failed with the following errors:\n${errors
      .map((err, idx) => `\t(${idx + 1}) ${err}`)
      .join("\n")}`
  );
}

function bool(value: any) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toUpperCase() === "TRUE";
  return false;
}
