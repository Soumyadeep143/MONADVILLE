// Mirrors the error codes in docs/api.md §15. Thrown by economy operations,
// caught at the API/agent-execution boundary and turned into the documented
// { error: { code, message } } response shape.
export class ActionError extends Error {
  constructor(
    public code:
      | "INVALID_ACTION"
      | "INSUFFICIENT_FUNDS"
      | "INSUFFICIENT_TREASURY"
      | "INVALID_LOAN"
      | "OVERDUE_LOAN"
      | "INVALID_BUSINESS"
      | "INSUFFICIENT_EMPLOYEES"
      | "INVALID_PROPERTY"
      | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}
