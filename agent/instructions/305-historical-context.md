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