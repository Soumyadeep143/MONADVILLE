import { describe, it, expect } from "vitest";
import { InMemoryLedgerService } from "../blockchain/InMemoryLedgerService.js";

describe("InMemoryLedgerService", () => {
  it("splits a taxed transfer 98/2 at the 2% rate", async () => {
    const ledger = new InMemoryLedgerService();
    await ledger.registerAgent("sim1", "a", 1000);
    await ledger.registerAgent("sim1", "b", 1000);

    const result = await ledger.transfer({ simulationId: "sim1", fromAgentId: "a", toAgentId: "b", grossAmount: 100, type: "TRANSFER", gameDay: 1 });

    expect(result.status).toBe("CONFIRMED");
    expect(result.taxAmount).toBe(2);
    expect(result.netAmount).toBe(98);
    expect(await ledger.getBalance("sim1", "a")).toBe(900);
    expect(await ledger.getBalance("sim1", "b")).toBe(1098);
    expect(await ledger.getTreasuryBalance("sim1")).toBe(2);
  });

  it("credits the treasury the full gross amount when it is the recipient, regardless of the tax split", async () => {
    const ledger = new InMemoryLedgerService();
    await ledger.registerAgent("sim1", "a", 1000);

    const result = await ledger.transfer({ simulationId: "sim1", fromAgentId: "a", toAgentId: null, grossAmount: 200, type: "PROPERTY", gameDay: 1 });

    expect(result.status).toBe("CONFIRMED");
    expect(await ledger.getTreasuryBalance("sim1")).toBe(200);
    expect(await ledger.getBalance("sim1", "a")).toBe(800);
  });

  it("rejects a transfer that exceeds the sender's balance", async () => {
    const ledger = new InMemoryLedgerService();
    await ledger.registerAgent("sim1", "a", 50);

    const result = await ledger.transfer({ simulationId: "sim1", fromAgentId: "a", toAgentId: null, grossAmount: 100, type: "TRANSFER", gameDay: 1 });

    expect(result.status).toBe("FAILED");
    expect(await ledger.getBalance("sim1", "a")).toBe(50);
  });

  it("conserves money end to end: fundLoan followed by repayLoan returns treasury and agent balances to their starting point (minus/plus interest)", async () => {
    const ledger = new InMemoryLedgerService();
    await ledger.registerAgent("sim1", "a", 1000);
    // seed the treasury so it can fund a loan
    await ledger.transfer({ simulationId: "sim1", fromAgentId: "a", toAgentId: null, grossAmount: 500, type: "TRANSFER", gameDay: 1, taxable: false });

    const before = (await ledger.getBalance("sim1", "a")) + (await ledger.getTreasuryBalance("sim1"));
    await ledger.fundLoan({ simulationId: "sim1", agentId: "a", principal: 200, gameDay: 2 });
    await ledger.repayLoan({ simulationId: "sim1", agentId: "a", principal: 200, interest: 20, gameDay: 3 });
    const after = (await ledger.getBalance("sim1", "a")) + (await ledger.getTreasuryBalance("sim1"));

    // agent paid 20 interest into the closed system; nothing was created or destroyed
    expect(after).toBe(before);
  });
});
