import type { Procedure } from "../types.js";

export const procedures: Record<string, Procedure> = [
  {
    id: "add_to_user_identity",
    description: "Update any new traits to user profile with information provided by the user",
    steps: [
      {
        id: "identify_user",
        description: "Add or update any new traits to user profile",
        strictness: "conditional",
        conditions: "Only do this step if new traits or identifiers are provided by the user",
        completionCriteria: "A trait has been successfully added to the user profile",
        instructions: "User the identify_user tool to update or add new traits or identifiers to profile."
      }
    ]
  },
  {
    id: "provide_application_information",
    description:
        "Provide information about the application to the user, including the requirements",
    steps: [
      {
        id: "required_documents",
        description: "List the required documents for the application",
        strictness: "required",
        completionCriteria: "List of required documents has been provided",
        instructions: "Provide a clear list of documents needed for the application: copy of your W2, 2 years of Tax returns, your EIN, and a copy of your ID."
      },
    ]
  },
  {
    id: "check_current_application_status",
    description:
        "Check the status of the user's current application",
    steps: [
      {
        id: "check_status_with_profile",
        description: "get the profile events via tool, and use event name Document Uploaded to check current application status",
        strictness: "required",
        completionCriteria: "List what documents have been uploaded by the user and what still needs to be uploaded",
        instructions: "use getProfileEvents for event name Document Uploaded and let user know what is missing from required documents: copy of your W2, 2 years of Tax returns, your EIN, and a copy of your ID."
      }
    ]
  },
  {
    id: "fetch_entity",
    description:
        "Use the provided datagraph and getEntity tool to fetch the information needed by the user",
    steps: [
      {
        id: "learn_datagraph",
        description:
            "Learn the customers datagraph to understand the relationship between tables in their data warehouse.",
        strictness: "required"
      },
      {
        id: "get_entity_chain",
        description: "use the getEntity tool to fetch the information needed by the user",
        strictness: "required",
        completionCriteria: "Data rows have been fetched",
        instructions:
            "Use getEntity tool, may require chaining across multiple entity/table relationships."
      }
    ]
  },
  {
    id: "identify_user",
    description:
        "Verify the identity of a user through context or active identification",
    steps: [
      {
        id: "get_identifier",
        description:
            "Gather an identifier from the user that can be used to lookup their account.",
        strictness: "conditional",
        completionCriteria:
            "Valid email address or phone number has been provided",
        conditions:
            "This is not required when the user's profile has been provided in context. ",
        instructions: ""
      },
      {
        id: "verify_identifier",
        description: "Verify the provided identifier is valid",
        strictness: "conditional",
        completionCriteria: "Identifier has been validated",
        conditions: "Required when get_identifier step was performed",
        instructions:
            "Ensure email format is valid or phone number is in correct format"
      },
      {
        id: "confirm_identity",
        description: "Confirm user identity using available information",
        strictness: "required",
        completionCriteria: "User has verbally confirmed their identity",
        instructions:
            "If profile exists in context, confirm name. Otherwise, confirm details from identifier."
      }
    ]
},
].reduce((acc, cur) => Object.assign(acc, { [cur.id]: cur }), {});
