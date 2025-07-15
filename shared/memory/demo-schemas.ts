import type { MemorySchema } from "./types.js";

export const DEMO_SCHEMAS: Record<string, MemorySchema> = {
  user_preferences: {
    id: "user_preferences",
    name: "User Preferences",
    description: "User's personal preferences and communication style",
    properties: {
      favorite_color: { 
        type: "string",
        description: "User's favorite color"
      },
      preferred_contact_method: { 
        type: "string", 
        enum: ["email", "phone", "sms"],
        description: "How the user prefers to be contacted"
      },
      communication_style: { 
        type: "string", 
        enum: ["formal", "casual", "friendly"],
        description: "User's preferred communication style"
      },
      timezone: {
        type: "string",
        description: "User's timezone preference"
      },
      language: {
        type: "string",
        description: "User's preferred language"
      }
    }
  },
  
  dietary_info: {
    id: "dietary_info", 
    name: "Dietary Information",
    description: "User's dietary preferences, restrictions, and food-related information",
    properties: {
      allergies: { 
        type: "array", 
        items: { type: "string" },
        description: "List of food allergies"
      },
      diet_type: { 
        type: "string", 
        enum: ["vegetarian", "vegan", "keto", "paleo", "gluten-free", "none"],
        description: "Type of diet the user follows"
      },
      favorite_foods: { 
        type: "array", 
        items: { type: "string" },
        description: "List of user's favorite foods"
      },
      dislikes: {
        type: "array",
        items: { type: "string" },
        description: "Foods the user dislikes"
      },
      favorite_restaurants: {
        type: "array",
        items: { type: "string" },
        description: "User's favorite restaurants"
      }
    }
  },
  
  personal_info: {
    id: "personal_info",
    name: "Personal Information", 
    description: "User's personal details and interests",
    properties: {
      age_range: { 
        type: "string", 
        enum: ["18-25", "26-35", "36-45", "46-55", "55+"],
        description: "User's age range"
      },
      occupation: { 
        type: "string",
        description: "User's job or profession"
      },
      interests: { 
        type: "array", 
        items: { type: "string" },
        description: "User's hobbies and interests"
      },
      family_status: {
        type: "string",
        enum: ["single", "married", "divorced", "widowed", "in_relationship"],
        description: "User's family/relationship status"
      },
      pets: {
        type: "array",
        items: { type: "string" },
        description: "Types of pets the user has"
      },
      location: {
        type: "string",
        description: "User's general location (city, state)"
      }
    }
  }
};

export const getMemorySchema = (schemaId: string): MemorySchema | undefined => {
  return DEMO_SCHEMAS[schemaId];
};

export const getAllMemorySchemas = (): MemorySchema[] => {
  return Object.values(DEMO_SCHEMAS);
};