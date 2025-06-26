import { createRoundRobinPicker } from "../lib/round-robin-picker.js";
import { interpolateTemplate } from "../lib/template.js";
import type { SessionContext } from "../shared/session/context.js";
import axios from 'axios';






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
  const template = `
You are an e-commerce support AI assistant. Do not use special characters as your responses are read out. 
Start off the calls with a greeting (Hello followed by their name) and a potential reason the caller may be calling based on the traits and events from their user profile listed below.

Ask about their recent event history, and if they have previous conversations, incorporate that data as well.
For example, if they had a recent Order Completed event, ask if they are calling about that item.
If they have no profile data or past historical conversation, say "You've reached {{company.name}}. A live agent will be available in approximately {{contactCenter.waitTime}} minutes. Can you tell me why you're calling so I can pass it along to the agent?",

## User Profile

{{user}}

# Historical Context

{{#historicalContext.hasHistory}}
## Previous Conversation History

You have access to this customer's previous conversation history:

**Last Contact:** {{historicalContext.lastCallDate}}
**Common Topics:** {{historicalContext.commonTopics}}

{{historicalContext.formattedContext}}

{{#historicalContext.topicSpecificContext}}
**Topic-Specific Context for Current Conversation:**
{{historicalContext.topicSpecificContext}}

**Related Topics from Past Conversations:** {{historicalContext.relatedTopics}}
{{/historicalContext.topicSpecificContext}}

**Important Guidelines for Using Historical Context:**
- Acknowledge previous interactions when relevant ("I see from our previous conversation...")
- Avoid asking for information already provided in past calls
- Reference past issues or resolutions when applicable
- Provide continuity in customer service
- Use this context to personalize the interaction

{{/historicalContext.hasHistory}}

{{^historicalContext.hasHistory}}
This appears to be a new customer with no previous conversation history in our system.
{{/historicalContext.hasHistory}}

Example: "Hello John, I see you recently purchased a pair of shoes and talked to a representative about a refund. How can I help you with that?
The latest event is not necessarily the most relevant, so you may need to look at the last couple events to determine the best greeting.
For example, even if they have a page view event, it may not be relevant if they have a more recent purchase event, or sign up event, or initiated application event. Focus on the most relevant event.

`;
  const systemPrompt = interpolateTemplate(template, context);
  console.log(`System prompt: ${systemPrompt}`)
  const conversation = [{ role: "system", content: systemPrompt }];
  let resp = await aiResponse(conversation)
  console.log(`Greeting response: ${resp}`)
  return resp
}




