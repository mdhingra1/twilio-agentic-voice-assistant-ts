import { interpolateTemplate } from "../../lib/template.js";
import type { SessionContext } from "../../shared/session/context.js";
import axios from 'axios';
import { readFileSync } from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url)); // this directory
const greetingPrompt = "greeting-prompt.md";


async function getOutputTextFromOpenAIResponse(data) {
  let output;
  output = data.output
  let outputResp;
  outputResp = "not found"
  for (let i = 0; i < output.length; i++) {
    if (output[i].type == "message") {
      outputResp = output[i]
      break;
    }
  };

  return outputResp.content[0].text;
}

async function getOpenAIResponse(messages) {
  const reqData = {
    model: "gpt-4o",
    input: messages,
  }


  try {
    const response = await axios({
      method: "post",
      url: "https://api.openai.com/v1/responses",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      data: reqData
    });

    const content = response.data;
    return content

  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw error;
  }
}


async function aiResponse(messages) {
  const aiResponse = await getOpenAIResponse(messages);
  const outputText = await getOutputTextFromOpenAIResponse(aiResponse)
  return outputText;
}

export async function getGreeting(context: Partial<SessionContext>) {
  const template = readFileSync(join(__dirname, greetingPrompt), "utf-8");

  const systemPrompt = interpolateTemplate(template, context);
  const conversation = [{ role: "system", content: systemPrompt }];
  let resp = await aiResponse(conversation)
  return resp
}




