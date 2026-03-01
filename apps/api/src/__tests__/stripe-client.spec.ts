import { describe, it, expect } from "vitest";
import { createStripeClient } from "../stripe-client.js";

describe("StripeClient", () => {
  it("creates an invoice with Stripe-style ID and open status", () => {
    const stripe = createStripeClient({ apiKey: "sk_test_demo" });
    const invoice = stripe.createInvoice({
      customerId: "cus_abc123",
      amount: 500,
      currency: "NOK",
      description: "Monthly plan"
    });

    expect(invoice.id).toMatch(/^in_/);
    expect(invoice.object).toBe("invoice");
    expect(invoice.customerId).toBe("cus_abc123");
    expect(invoice.amount).toBe(500);
    expect(invoice.currency).toBe("nok");
    expect(invoice.status).toBe("open");
    expect(invoice.description).toBe("Monthly plan");
    expect(invoice.livemode).toBe(false);
    expect(invoice.created).toBeTypeOf("number");
  });

  it("creates an invoice with due date when dueInDays is set", () => {
    const stripe = createStripeClient();
    const invoice = stripe.createInvoice({
      customerId: "cus_xyz",
      amount: 1000,
      currency: "EUR",
      dueInDays: 14
    });

    expect(invoice.dueDate).toBeTypeOf("string");
    const dueDate = new Date(invoice.dueDate!);
    const now = new Date();
    const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThan(15);
  });

  it("creates a payment link with checkout URL", () => {
    const stripe = createStripeClient();
    const link = stripe.createPaymentLink({ invoiceId: "in_test123" });

    expect(link.id).toMatch(/^plink_/);
    expect(link.object).toBe("payment_link");
    expect(link.url).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\//);
    expect(link.invoiceId).toBe("in_test123");
    expect(link.active).toBe(true);
    expect(link.livemode).toBe(false);
  });

  it("retrieves customer info", () => {
    const stripe = createStripeClient();
    const customer = stripe.getCustomer("cus_test456");

    expect(customer.id).toBe("cus_test456");
    expect(customer.object).toBe("customer");
    expect(customer.currency).toBe("nok");
    expect(customer.balance).toBe(0);
    expect(customer.livemode).toBe(false);
  });

  it("uses livemode when api key starts with sk_live_", () => {
    const stripe = createStripeClient({ apiKey: "sk_live_real_key" });
    const invoice = stripe.createInvoice({
      customerId: "cus_prod",
      amount: 250,
      currency: "NOK"
    });

    expect(invoice.livemode).toBe(true);
    expect(stripe.config.livemode).toBe(true);
  });

  it("defaults to test mode with demo key", () => {
    const stripe = createStripeClient();
    expect(stripe.config.livemode).toBe(false);
    expect(stripe.config.apiBase).toBe("https://api.stripe.com");
  });

  it("generates unique IDs for each invoice", () => {
    const stripe = createStripeClient();
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const invoice = stripe.createInvoice({
        customerId: "cus_a",
        amount: 100,
        currency: "NOK"
      });
      ids.add(invoice.id);
    }
    expect(ids.size).toBe(10);
  });
});
