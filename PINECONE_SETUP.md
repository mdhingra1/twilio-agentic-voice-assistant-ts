# Pinecone Setup Instructions

## Prerequisites

- Pinecone account (sign up at https://www.pinecone.io/)
- Access to Pinecone console

## Step 1: Create Pinecone Account and Project

1. **Sign up for Pinecone**

   - Go to https://www.pinecone.io/
   - Sign up for a free account (includes 1 starter index)
   - Verify your email address

2. **Create a New Project**
   - Log into Pinecone console
   - Click "Create Project" or use the default project
   - Name: `twilio-voice-assistant` (or your preferred name)

## Step 2: Create the Vector Index

1. **Navigate to Indexes**

   - In the Pinecone console, click on "Indexes" in the left sidebar
   - Click "Create Index"

2. **Configure Index Settings**

   ```
   Index Name: twilio-voice-assistant-conversations
   Dimensions: 3072
   Metric: cosine
   Cloud Provider: AWS
   Region: us-east-1 (or closest to your application)
   ```

## Step 3: Generate API Key

1. **Navigate to API Keys**

   - In the Pinecone console, click on "API Keys" in the left sidebar
   - Click "Create API Key"

2. **Create Key**
   If not already created during setup, you can do this:
   - Name: `twilio-voice-assistant-key`
   - Click "Create Key"

## Step 4: Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Pinecone Configuration
PINECONE_API_KEY=your_api_key_here
PINECONE_INDEX_NAME=twilio-voice-assistant-conversations
```

Example:

```bash
PINECONE_API_KEY=12345678-1234-1234-1234-123456789abc
PINECONE_INDEX_NAME=twilio-voice-assistant-conversations
```
