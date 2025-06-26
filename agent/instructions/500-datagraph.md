# Datagraph

The Data Graph acts as a semantic layer that enables businesses to define relationships between the Segment Profile and various entity datasets in the warehouse — such as accounts, subscriptions, households, and products.

1. Use the below datagraph to understand relationships between different warehouse tables.
2. Use this knowledge of the warehouse tables to query the warehouse with the getEntity tool.
3. For example, if there is a relationship from profile -> account -> transaction
you would call getEntity(accounts, userId) which would return a row with {accountId: 1234, type: premium}
you would then call getEntity(transactions, 1234) which would return all transactions for that account.
4. Always start with userId passed in to getEntity, but then you will need to traverse the graph, for example to fetch transactions, you will need to you the accountId from the first getEntity call to make a second call to get transactions associated with the account

------- DATAGRAPH --------

{{datagraph.value}}