import type { Procedure } from "../types.js";
// TODO: update
export const procedures: Record<string, Procedure> = [
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
        instructions: "",
      },
      {
        id: "verify_identifier",
        description: "Verify the provided identifier is valid",
        strictness: "conditional",
        completionCriteria: "Identifier has been validated",
        conditions: "Required when get_identifier step was performed",
        instructions:
          "Ensure email format is valid or phone number is in correct format",
      },
      {
        id: "create_or_update_user_profile",
        description:
          "Update or create a new user profile if it does not exist.",
        strictness: "conditional",
        completionCriteria:
          "New user profile created or existing profile updated",
        conditions:
          "This is not required when a profile already exists for the user. ",
        instructions: "Use the identify_user tool to update or create the user profile.",
      },
    ],
  },
    {
    id: "greet_user",
    description:
      "Fetch user profile information and greet the user accordingly",
    steps: [
      {
        id: "get_profile_traits",
        description:
          "Gather profile traits for user.",
        strictness: "required",
        completionCriteria:
          "Traits have been fetched from the user profile",
        instructions: "use getProfileTraits tool to fetch user profile traits, use format user_id:{user_id}",
      },
      {
        id: "get_profile_events",
        description:
          "Gather profile events for user.",
        strictness: "required",
        completionCriteria:
          "Events have been fetched from the user profile",
        instructions: "use getProfileEvents tool to fetch last 20 traits for user, use format user_id:{user_id}",
      },
      {
        id: "greet_user",
        description:
          "Generate a personalized greeting using the profile events and traits.",
        strictness: "required",
        completionCriteria:
          "You have greeted the user with a personalized message",
        instructions: "Say hi {name}, and reference information relevant to their profile. Example: 'Hi John, I see you recently purchased a new laptop. Are you calling about this order?'",
      },
    ],
  },
  {
    id: "provide_order_information",
    description:
      "Retrieve and present order information based on available context and identifiers",
    steps: [
      {
        id: "identify_user",
        description: "Verify user identity if needed",
        strictness: "conditional",
        completionCriteria:
          "Either confirmation number provided OR user identity verified",
        conditions: "Skip if valid confirmation number provided",
        instructions:
          "Only perform user identification if no confirmation number is provided",
      },
      {
        id: "gather_order_details",
        description: "Collect information needed to locate the order",
        strictness: "critical",
        completionCriteria:
          "Either: (A) Valid CN-00-00-00 format confirmation number obtained, OR (B) Order description collected from verified user",
        instructions:
          "Accept confirmation number or gather order description if user is verified",
      },
      {
        id: "confirm_order",
        description: "Verify order details with user",
        strictness: "required",
        completionCriteria: "User has confirmed the order details are correct",
        instructions:
          "Review key order details with user to ensure correct order was found",
      },
    ],
  },
  {
    id: "process_refund_request",
    description:
      "Handle customer refund requests according to defined policies and approval workflows",
    steps: [
      {
        id: "identify_user",
        description: "Verify the identity of the user requesting the refund",
        strictness: "critical",
        completionCriteria:
          "User identity has been verified through account information or order details",
        instructions:
          "Confirm user identity through account details, email address, or other identifying information associated with the order",
      },
      {
        id: "locate_order",
        description:
          "Find the specific order for which a refund is being requested",
        strictness: "critical",
        completionCriteria:
          "Valid order record has been located in the system with matching user information",
        instructions:
          "Use order number, confirmation ID, or search by user purchase history to locate the exact order",
      },
      {
        id: "request_human_approval",
        description:
          "Obtain approval from a human agent for refunds outside standard criteria",
        strictness: "critical",
        completionCriteria:
          "Human agent has provided explicit approval for the refund",
        instructions:
          "Contact human agent with order details, refund reason, and request approval for processing",
      },
      {
        id: "send_confirmation_sms",
        description:
          "Send an SMS confirmation to the customer before processing the refund",
        strictness: "critical",
        completionCriteria:
          "SMS confirmation has been sent to the customer's verified phone number",
        instructions:
          "Execute the tool to send an SMS confirmation to the user. This SMS will include details about the refund. They should validate the details before the refund is processed.",
      },
      {
        id: "verify_refund_details",
        description:
          "Verify that the details in the SMS confirmation the user received are accurate.",
        strictness: "critical",
        completionCriteria:
          "The user has explicitly stated that the refund details are accurate.",
        instructions:
          "Ask the user to confirm that the refund details are correct. Do not execute the refund until they have give you their approval.",
      },
      {
        id: "execute_refund",
        description: "Process the refund through the payment system",
        strictness: "required",
        completionCriteria:
          "Refund has been successfully processed and confirmation received from payment system",
        conditions:
          "Only execute if either standard eligibility criteria are met OR human approval has been obtained",
        instructions:
          "Use the refund processing tool to issue the refund to the original payment method",
      },
    ],
  },
].reduce((acc, cur) => Object.assign(acc, { [cur.id]: cur }), {});
