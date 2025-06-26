import { Datagraph } from "../../shared/session/context.js";

export const datagraph: Datagraph = {
    name: "AMEX Datagraph",
    value: `
    data_graph {
  version = "v1.0.0"
  
  profile {
    profile_folder = "creditcard-prod.profiles_sync"
    type           = "segment:materialized"
    
    relationship "customer-accounts" {
      name           = "Customer Accounts"
      related_entity = "account"
      external_id {
        join_key = "CUSTOMER_ID"
        type     = "user_id"
      }
      
      relationship "account-transactions" {
        name           = "Account Transactions"
        related_entity = "transaction"
        join_on        = "account.ID = transaction.ACCOUNT_ID"
      }
    }
    
    relationship "customer-applications" {
      name           = "Customer Applications"
      related_entity = "application"
      external_id {
        join_key = "CUSTOMER_ID"
        type     = "user_id"
      }
    }
  }
  
  entity "account" {
    name        = "Account"
    primary_key = "ID"
    table_ref   = "creditcard-prod.CORE.ACCOUNTS"
  }
  
  entity "application" {
    name        = "Application"
    primary_key = "ID"
    table_ref   = "creditcard-prod.CORE.APPLICATIONS"
  }
  
  entity "transaction" {
    name        = "Transaction"
    primary_key = "ID"
    table_ref   = "creditcard-prod.CORE.TRANSACTIONS"
  }
}
    `,

};