import { describe, it, expect } from "vitest";
import { createStripeClient, StripeError } from "../stripe-client.js";

describe("StripeClient", () => {
  // ── Legacy convenience methods (backward compat) ──

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

  // ── SDK-style namespaced interface ──

  describe("invoices", () => {
    it("creates and retrieves an invoice via namespaced API", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_ns1",
        amount: 750,
        currency: "NOK",
        description: "SDK-style test"
      });

      expect(invoice.id).toMatch(/^in_/);
      expect(invoice.hostedInvoiceUrl).toMatch(/^https:\/\/invoice\.stripe\.com\/i\/in_/);

      const retrieved = stripe.invoices.retrieve(invoice.id);
      expect(retrieved.id).toBe(invoice.id);
      expect(retrieved.customerId).toBe("cus_ns1");
    });

    it("lists invoices filtered by customer", () => {
      const stripe = createStripeClient();
      stripe.invoices.create({ customerId: "cus_a1", amount: 100, currency: "NOK" });
      stripe.invoices.create({ customerId: "cus_a1", amount: 200, currency: "NOK" });
      stripe.invoices.create({ customerId: "cus_b1", amount: 300, currency: "NOK" });

      const result = stripe.invoices.list({ customerId: "cus_a1" });
      expect(result.data).toHaveLength(2);
      expect(result.data.every(i => i.customerId === "cus_a1")).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it("lists invoices with limit and hasMore flag", () => {
      const stripe = createStripeClient();
      for (let i = 0; i < 5; i++) {
        stripe.invoices.create({ customerId: "cus_lim", amount: 100 + i, currency: "NOK" });
      }

      const result = stripe.invoices.list({ customerId: "cus_lim", limit: 3 });
      expect(result.data).toHaveLength(3);
      expect(result.hasMore).toBe(true);
    });

    it("voids an open invoice", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({ customerId: "cus_v", amount: 100, currency: "NOK" });
      expect(invoice.status).toBe("open");

      const voided = stripe.invoices.voidInvoice(invoice.id);
      expect(voided.status).toBe("void");
      expect(voided.id).toBe(invoice.id);
    });

    it("pays an open invoice", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({ customerId: "cus_p", amount: 100, currency: "NOK" });

      const paid = stripe.invoices.pay(invoice.id);
      expect(paid.status).toBe("paid");
    });

    it("throws StripeError when voiding a paid invoice", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({ customerId: "cus_v2", amount: 100, currency: "NOK" });
      stripe.invoices.pay(invoice.id);

      expect(() => stripe.invoices.voidInvoice(invoice.id)).toThrow(StripeError);
      try {
        stripe.invoices.voidInvoice(invoice.id);
      } catch (err) {
        expect(err).toBeInstanceOf(StripeError);
        const se = err as InstanceType<typeof StripeError>;
        expect(se.code).toBe("invoice_not_open");
        expect(se.statusCode).toBe(400);
        expect(se.requestId).toMatch(/^req_/);
      }
    });

    it("throws when retrieving a non-existent invoice", () => {
      const stripe = createStripeClient();
      expect(() => stripe.invoices.retrieve("in_doesnotexist")).toThrow(StripeError);
    });

    it("throws when amount is zero or negative", () => {
      const stripe = createStripeClient();
      expect(() =>
        stripe.invoices.create({ customerId: "cus_bad", amount: 0, currency: "NOK" })
      ).toThrow(StripeError);
      try {
        stripe.invoices.create({ customerId: "cus_bad", amount: -5, currency: "NOK" });
      } catch (err) {
        expect(err).toBeInstanceOf(StripeError);
        expect((err as InstanceType<typeof StripeError>).code).toBe("amount_too_small");
      }
    });
  });

  describe("paymentLinks", () => {
    it("creates a payment link via namespaced API", () => {
      const stripe = createStripeClient();
      const link = stripe.paymentLinks.create({ invoiceId: "in_test_ns" });

      expect(link.id).toMatch(/^plink_/);
      expect(link.url).toContain("checkout.stripe.com");
      expect(link.invoiceId).toBe("in_test_ns");
    });
  });

  describe("customers", () => {
    it("retrieves and auto-creates a customer stub", () => {
      const stripe = createStripeClient();
      const customer = stripe.customers.retrieve("cus_new");

      expect(customer.id).toBe("cus_new");
      expect(customer.object).toBe("customer");
      expect(customer.metadata).toEqual({});
    });

    it("updates customer name, email, and metadata", () => {
      const stripe = createStripeClient();
      stripe.customers.retrieve("cus_upd"); // auto-create

      const updated = stripe.customers.update("cus_upd", {
        name: "Ola Nordmann",
        email: "ola@example.no",
        metadata: { tier: "enterprise" }
      });

      expect(updated.name).toBe("Ola Nordmann");
      expect(updated.email).toBe("ola@example.no");
      expect(updated.metadata.tier).toBe("enterprise");

      // Verify persistence within the client
      const retrieved = stripe.customers.retrieve("cus_upd");
      expect(retrieved.name).toBe("Ola Nordmann");
    });
  });

  describe("subscriptions", () => {
    it("creates a subscription with active status", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_sub1",
        priceId: "price_monthly_499"
      });

      expect(sub.id).toMatch(/^sub_/);
      expect(sub.object).toBe("subscription");
      expect(sub.customerId).toBe("cus_sub1");
      expect(sub.status).toBe("active");
      expect(sub.cancelAtPeriodEnd).toBe(false);
      expect(sub.items).toHaveLength(1);
      expect(sub.items[0].priceId).toBe("price_monthly_499");
      expect(sub.items[0].quantity).toBe(1);
      expect(sub.livemode).toBe(false);
    });

    it("creates a subscription with trial period", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_trial",
        priceId: "price_pro",
        trialDays: 14
      });

      expect(sub.status).toBe("trialing");
      expect(sub.currentPeriodEnd).toBeGreaterThan(sub.currentPeriodStart);
    });

    it("creates a subscription with custom quantity", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_qty",
        priceId: "price_seat",
        quantity: 5
      });

      expect(sub.items[0].quantity).toBe(5);
    });

    it("retrieves a subscription by ID", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_ret",
        priceId: "price_basic"
      });

      const retrieved = stripe.subscriptions.retrieve(sub.id);
      expect(retrieved.id).toBe(sub.id);
      expect(retrieved.customerId).toBe("cus_ret");
    });

    it("cancels a subscription immediately", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_cancel",
        priceId: "price_standard"
      });

      const canceled = stripe.subscriptions.cancel(sub.id);
      expect(canceled.status).toBe("canceled");
      expect(canceled.canceledAt).toBeTypeOf("number");
      expect(canceled.cancelAtPeriodEnd).toBe(false);
    });

    it("cancels at period end without immediate cancellation", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_eop",
        priceId: "price_premium"
      });

      const canceled = stripe.subscriptions.cancel(sub.id, { cancelAtPeriodEnd: true });
      expect(canceled.status).toBe("active"); // Still active until period end
      expect(canceled.cancelAtPeriodEnd).toBe(true);
      expect(canceled.canceledAt).toBeUndefined();
    });

    it("throws when canceling an already canceled subscription", () => {
      const stripe = createStripeClient();
      const sub = stripe.subscriptions.create({
        customerId: "cus_dup",
        priceId: "price_dup"
      });

      stripe.subscriptions.cancel(sub.id);
      expect(() => stripe.subscriptions.cancel(sub.id)).toThrow(StripeError);
    });

    it("lists subscriptions filtered by customer", () => {
      const stripe = createStripeClient();
      stripe.subscriptions.create({ customerId: "cus_list1", priceId: "price_a" });
      stripe.subscriptions.create({ customerId: "cus_list1", priceId: "price_b" });
      stripe.subscriptions.create({ customerId: "cus_list2", priceId: "price_c" });

      const result = stripe.subscriptions.list({ customerId: "cus_list1" });
      expect(result.data).toHaveLength(2);
      expect(result.data.every(s => s.customerId === "cus_list1")).toBe(true);
    });

    it("throws when retrieving a non-existent subscription", () => {
      const stripe = createStripeClient();
      expect(() => stripe.subscriptions.retrieve("sub_fake")).toThrow(StripeError);
    });
  });

  describe("refunds", () => {
    it("refunds a paid invoice for the full amount", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_ref1",
        amount: 500,
        currency: "NOK"
      });
      stripe.invoices.pay(invoice.id);

      const refund = stripe.refunds.create({ invoiceId: invoice.id });
      expect(refund.id).toMatch(/^re_/);
      expect(refund.object).toBe("refund");
      expect(refund.amount).toBe(500);
      expect(refund.currency).toBe("nok");
      expect(refund.status).toBe("succeeded");
      expect(refund.invoiceId).toBe(invoice.id);
    });

    it("refunds a partial amount", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_partial",
        amount: 1000,
        currency: "NOK"
      });
      stripe.invoices.pay(invoice.id);

      const refund = stripe.refunds.create({
        invoiceId: invoice.id,
        amount: 300,
        reason: "requested_by_customer"
      });
      expect(refund.amount).toBe(300);
      expect(refund.reason).toBe("requested_by_customer");
    });

    it("throws when refund amount exceeds invoice amount", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_over",
        amount: 200,
        currency: "NOK"
      });
      stripe.invoices.pay(invoice.id);

      expect(() =>
        stripe.refunds.create({ invoiceId: invoice.id, amount: 500 })
      ).toThrow(StripeError);

      try {
        stripe.refunds.create({ invoiceId: invoice.id, amount: 500 });
      } catch (err) {
        expect((err as InstanceType<typeof StripeError>).code).toBe("refund_exceeds_charge");
      }
    });

    it("throws when refunding an unpaid invoice", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_unpaid",
        amount: 100,
        currency: "NOK"
      });

      expect(() =>
        stripe.refunds.create({ invoiceId: invoice.id })
      ).toThrow(StripeError);
    });

    it("retrieves a refund by ID", () => {
      const stripe = createStripeClient();
      const invoice = stripe.invoices.create({
        customerId: "cus_rr",
        amount: 400,
        currency: "NOK"
      });
      stripe.invoices.pay(invoice.id);
      const refund = stripe.refunds.create({ invoiceId: invoice.id });

      const retrieved = stripe.refunds.retrieve(refund.id);
      expect(retrieved.id).toBe(refund.id);
      expect(retrieved.amount).toBe(400);
    });

    it("throws when retrieving a non-existent refund", () => {
      const stripe = createStripeClient();
      expect(() => stripe.refunds.retrieve("re_fake")).toThrow(StripeError);
    });
  });

  describe("StripeError", () => {
    it("serializes to JSON with expected structure", () => {
      const error = new StripeError({
        type: "invalid_request_error",
        code: "resource_missing",
        message: "No such invoice",
        statusCode: 404,
        param: "invoice"
      });

      const json = error.toJSON();
      expect(json.error.type).toBe("invalid_request_error");
      expect(json.error.code).toBe("resource_missing");
      expect(json.error.message).toBe("No such invoice");
      expect(json.error.statusCode).toBe(404);
      expect(json.error.param).toBe("invoice");
      expect(json.error.requestId).toMatch(/^req_/);
    });

    it("is an instance of Error", () => {
      const error = new StripeError({
        type: "api_error",
        code: "api_connection_error",
        message: "Connection failed",
        statusCode: 500
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("StripeError");
    });
  });
});
