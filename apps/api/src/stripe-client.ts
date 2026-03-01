/**
 * Stripe client abstraction with SDK-like interface.
 *
 * This module provides a realistic Stripe integration pattern used by the
 * billing/stripe_billing action type. It mirrors the official Stripe Node SDK's
 * resource-namespaced API (e.g. `stripe.invoices.create()`, `stripe.customers.retrieve()`).
 *
 * In production, swap the method bodies with actual `stripe` npm package calls
 * or direct `fetch` calls to `api.stripe.com`. The type signatures and error
 * handling patterns are designed to match the real SDK for a seamless transition.
 *
 * All IDs follow the Stripe `obj_xxxxx` naming convention.
 */

/* -------------------------------------------------------------------------- */
/*  Error types                                                               */
/* -------------------------------------------------------------------------- */

export type StripeErrorCode =
  | "resource_missing"
  | "parameter_invalid"
  | "amount_too_small"
  | "currency_invalid"
  | "invoice_not_open"
  | "subscription_inactive"
  | "refund_exceeds_charge"
  | "authentication_required"
  | "rate_limit_exceeded"
  | "api_connection_error";

export type StripeErrorType =
  | "invalid_request_error"
  | "api_error"
  | "authentication_error"
  | "rate_limit_error";

export class StripeError extends Error {
  readonly type: StripeErrorType;
  readonly code: StripeErrorCode;
  readonly statusCode: number;
  readonly param?: string;
  readonly requestId: string;

  constructor(opts: {
    type: StripeErrorType;
    code: StripeErrorCode;
    message: string;
    statusCode: number;
    param?: string;
  }) {
    super(opts.message);
    this.name = "StripeError";
    this.type = opts.type;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.param = opts.param;
    this.requestId = `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
  }

  toJSON() {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        param: this.param,
        statusCode: this.statusCode,
        requestId: this.requestId,
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Resource types                                                            */
/* -------------------------------------------------------------------------- */

export type StripeInvoice = {
  id: string;
  object: "invoice";
  customerId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  description?: string;
  dueDate?: string;
  hostedInvoiceUrl?: string;
  created: number;
  livemode: boolean;
};

export type StripePaymentLink = {
  id: string;
  object: "payment_link";
  url: string;
  invoiceId: string;
  active: boolean;
  created: number;
  livemode: boolean;
};

export type StripeCustomer = {
  id: string;
  object: "customer";
  email?: string;
  name?: string;
  currency: string;
  balance: number;
  created: number;
  livemode: boolean;
  metadata: Record<string, string>;
};

export type StripeSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "trialing"
  | "incomplete";

export type StripeSubscription = {
  id: string;
  object: "subscription";
  customerId: string;
  status: StripeSubscriptionStatus;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt?: number;
  items: Array<{
    id: string;
    priceId: string;
    quantity: number;
  }>;
  created: number;
  livemode: boolean;
};

export type StripeRefund = {
  id: string;
  object: "refund";
  invoiceId: string;
  amount: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  created: number;
  livemode: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Input types                                                               */
/* -------------------------------------------------------------------------- */

export type StripeClientConfig = {
  /** Stripe secret key (test or live). Falls back to env var STRIPE_SECRET_KEY. */
  apiKey?: string;
  /** Base URL for API calls. Defaults to https://api.stripe.com */
  apiBase?: string;
  /** Whether to use live mode. Defaults to false (test mode). */
  livemode?: boolean;
};

export type CreateInvoiceInput = {
  customerId: string;
  amount: number;
  currency: string;
  description?: string;
  dueInDays?: number;
  subscriptionId?: string;
};

export type CreatePaymentLinkInput = {
  invoiceId: string;
};

export type CreateSubscriptionInput = {
  customerId: string;
  priceId: string;
  quantity?: number;
  trialDays?: number;
};

export type CancelSubscriptionInput = {
  cancelAtPeriodEnd?: boolean;
};

export type CreateRefundInput = {
  invoiceId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
};

export type ListInvoicesInput = {
  customerId?: string;
  subscriptionId?: string;
  status?: StripeInvoice["status"];
  limit?: number;
};

/* -------------------------------------------------------------------------- */
/*  Client interface (mirrors real Stripe SDK resource namespacing)           */
/* -------------------------------------------------------------------------- */

export type StripeClient = {
  readonly config: Readonly<Pick<StripeClientConfig, "apiBase" | "livemode">>;

  /** Invoices resource — create, retrieve, list, void, and pay invoices. */
  invoices: {
    create(input: CreateInvoiceInput): StripeInvoice;
    retrieve(invoiceId: string): StripeInvoice;
    list(params?: ListInvoicesInput): { data: StripeInvoice[]; hasMore: boolean };
    voidInvoice(invoiceId: string): StripeInvoice;
    pay(invoiceId: string): StripeInvoice;
  };

  /** Payment links resource — create hosted payment links. */
  paymentLinks: {
    create(input: CreatePaymentLinkInput): StripePaymentLink;
  };

  /** Customers resource — retrieve and update customers. */
  customers: {
    retrieve(customerId: string): StripeCustomer;
    update(customerId: string, params: { email?: string; name?: string; metadata?: Record<string, string> }): StripeCustomer;
  };

  /** Subscriptions resource — create, retrieve, cancel, and list subscriptions. */
  subscriptions: {
    create(input: CreateSubscriptionInput): StripeSubscription;
    retrieve(subscriptionId: string): StripeSubscription;
    cancel(subscriptionId: string, params?: CancelSubscriptionInput): StripeSubscription;
    list(params?: { customerId?: string; status?: StripeSubscriptionStatus; limit?: number }): { data: StripeSubscription[]; hasMore: boolean };
  };

  /** Refunds resource — create and retrieve refunds. */
  refunds: {
    create(input: CreateRefundInput): StripeRefund;
    retrieve(refundId: string): StripeRefund;
  };

  // ── Legacy convenience methods (kept for backward compatibility) ──

  /** @deprecated Use `invoices.create()` instead. */
  createInvoice(input: CreateInvoiceInput): StripeInvoice;
  /** @deprecated Use `paymentLinks.create()` instead. */
  createPaymentLink(input: CreatePaymentLinkInput): StripePaymentLink;
  /** @deprecated Use `customers.retrieve()` instead. */
  getCustomer(customerId: string): StripeCustomer;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const stripeId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

const nowUnix = () => Math.floor(Date.now() / 1000);

/* -------------------------------------------------------------------------- */
/*  Factory                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Creates a StripeClient instance with resource-namespaced methods that mirror
 * the official Stripe Node SDK.
 *
 * In this MVP the client simulates Stripe API responses with realistic shapes
 * and IDs. Replace the method bodies with actual `fetch` calls to
 * `api.stripe.com` (or use the official `stripe` npm package) for production.
 */
export const createStripeClient = (
  clientConfig?: StripeClientConfig
): StripeClient => {
  const apiKey =
    clientConfig?.apiKey ?? process.env.STRIPE_SECRET_KEY ?? "sk_test_demo";
  const apiBase = clientConfig?.apiBase ?? "https://api.stripe.com";
  const livemode = clientConfig?.livemode ?? apiKey.startsWith("sk_live_");

  const config: StripeClient["config"] = { apiBase, livemode };

  // ── In-memory store (simulates Stripe's server-side state) ──

  const invoiceStore = new Map<string, StripeInvoice>();
  const subscriptionStore = new Map<string, StripeSubscription>();
  const refundStore = new Map<string, StripeRefund>();
  const customerStore = new Map<string, StripeCustomer>();

  // ── Validation helpers ──

  const requireInvoice = (invoiceId: string): StripeInvoice => {
    const inv = invoiceStore.get(invoiceId);
    if (!inv) {
      throw new StripeError({
        type: "invalid_request_error",
        code: "resource_missing",
        message: `No such invoice: '${invoiceId}'`,
        statusCode: 404,
        param: "invoice",
      });
    }
    return inv;
  };

  const requireSubscription = (subscriptionId: string): StripeSubscription => {
    const sub = subscriptionStore.get(subscriptionId);
    if (!sub) {
      throw new StripeError({
        type: "invalid_request_error",
        code: "resource_missing",
        message: `No such subscription: '${subscriptionId}'`,
        statusCode: 404,
        param: "subscription",
      });
    }
    return sub;
  };

  const requireRefund = (refundId: string): StripeRefund => {
    const ref = refundStore.get(refundId);
    if (!ref) {
      throw new StripeError({
        type: "invalid_request_error",
        code: "resource_missing",
        message: `No such refund: '${refundId}'`,
        statusCode: 404,
        param: "refund",
      });
    }
    return ref;
  };

  // ── Invoices ──

  const createInvoice = (input: CreateInvoiceInput): StripeInvoice => {
    if (input.amount <= 0) {
      throw new StripeError({
        type: "invalid_request_error",
        code: "amount_too_small",
        message: "Amount must be greater than 0",
        statusCode: 400,
        param: "amount",
      });
    }

    const now = nowUnix();
    const id = stripeId("in");
    const dueDate = input.dueInDays
      ? new Date(Date.now() + input.dueInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const invoice: StripeInvoice = {
      id,
      object: "invoice",
      customerId: input.customerId,
      subscriptionId: input.subscriptionId,
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      status: "open",
      description: input.description,
      dueDate,
      hostedInvoiceUrl: `https://invoice.stripe.com/i/${id}`,
      created: now,
      livemode,
    };

    invoiceStore.set(id, invoice);
    return invoice;
  };

  const retrieveInvoice = (invoiceId: string): StripeInvoice =>
    requireInvoice(invoiceId);

  const listInvoices = (
    params?: ListInvoicesInput
  ): { data: StripeInvoice[]; hasMore: boolean } => {
    let results = Array.from(invoiceStore.values());

    if (params?.customerId) {
      results = results.filter((i) => i.customerId === params.customerId);
    }
    if (params?.subscriptionId) {
      results = results.filter((i) => i.subscriptionId === params.subscriptionId);
    }
    if (params?.status) {
      results = results.filter((i) => i.status === params.status);
    }

    results.sort((a, b) => b.created - a.created);
    const limit = params?.limit ?? 10;
    const hasMore = results.length > limit;
    return { data: results.slice(0, limit), hasMore };
  };

  const voidInvoice = (invoiceId: string): StripeInvoice => {
    const inv = requireInvoice(invoiceId);
    if (inv.status !== "open" && inv.status !== "draft") {
      throw new StripeError({
        type: "invalid_request_error",
        code: "invoice_not_open",
        message: `Invoice ${invoiceId} has status '${inv.status}' and cannot be voided`,
        statusCode: 400,
        param: "invoice",
      });
    }
    const voided: StripeInvoice = { ...inv, status: "void" };
    invoiceStore.set(invoiceId, voided);
    return voided;
  };

  const payInvoice = (invoiceId: string): StripeInvoice => {
    const inv = requireInvoice(invoiceId);
    if (inv.status !== "open") {
      throw new StripeError({
        type: "invalid_request_error",
        code: "invoice_not_open",
        message: `Invoice ${invoiceId} has status '${inv.status}' and cannot be paid`,
        statusCode: 400,
        param: "invoice",
      });
    }
    const paid: StripeInvoice = { ...inv, status: "paid" };
    invoiceStore.set(invoiceId, paid);
    return paid;
  };

  // ── Payment Links ──

  const createPaymentLink = (input: CreatePaymentLinkInput): StripePaymentLink => {
    const now = nowUnix();
    const id = stripeId("plink");
    const url = `https://checkout.stripe.com/c/pay/${id}`;

    return {
      id,
      object: "payment_link",
      url,
      invoiceId: input.invoiceId,
      active: true,
      created: now,
      livemode,
    };
  };

  // ── Customers ──

  const retrieveCustomer = (customerId: string): StripeCustomer => {
    const existing = customerStore.get(customerId);
    if (existing) return existing;

    // Auto-create stub customer (mirrors Stripe behavior with existing customers)
    const customer: StripeCustomer = {
      id: customerId,
      object: "customer",
      currency: "nok",
      balance: 0,
      created: nowUnix(),
      livemode,
      metadata: {},
    };
    customerStore.set(customerId, customer);
    return customer;
  };

  const updateCustomer = (
    customerId: string,
    params: { email?: string; name?: string; metadata?: Record<string, string> }
  ): StripeCustomer => {
    const customer = retrieveCustomer(customerId);
    const updated: StripeCustomer = {
      ...customer,
      ...(params.email !== undefined ? { email: params.email } : {}),
      ...(params.name !== undefined ? { name: params.name } : {}),
      metadata: { ...customer.metadata, ...params.metadata },
    };
    customerStore.set(customerId, updated);
    return updated;
  };

  // ── Subscriptions ──

  const createSubscription = (input: CreateSubscriptionInput): StripeSubscription => {
    const now = nowUnix();
    const id = stripeId("sub");
    const periodEnd = now + 30 * 24 * 60 * 60; // 30 days

    const isTrialing = input.trialDays !== undefined && input.trialDays > 0;
    const trialEnd = isTrialing ? now + input.trialDays! * 24 * 60 * 60 : undefined;

    const sub: StripeSubscription = {
      id,
      object: "subscription",
      customerId: input.customerId,
      status: isTrialing ? "trialing" : "active",
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd ?? periodEnd,
      cancelAtPeriodEnd: false,
      items: [
        {
          id: stripeId("si"),
          priceId: input.priceId,
          quantity: input.quantity ?? 1,
        },
      ],
      created: now,
      livemode,
    };

    subscriptionStore.set(id, sub);
    return sub;
  };

  const retrieveSubscription = (subscriptionId: string): StripeSubscription =>
    requireSubscription(subscriptionId);

  const cancelSubscription = (
    subscriptionId: string,
    params?: CancelSubscriptionInput
  ): StripeSubscription => {
    const sub = requireSubscription(subscriptionId);
    if (sub.status === "canceled") {
      throw new StripeError({
        type: "invalid_request_error",
        code: "subscription_inactive",
        message: `Subscription ${subscriptionId} is already canceled`,
        statusCode: 400,
        param: "subscription",
      });
    }

    const cancelAtPeriodEnd = params?.cancelAtPeriodEnd ?? false;
    const canceled: StripeSubscription = {
      ...sub,
      status: cancelAtPeriodEnd ? sub.status : "canceled",
      cancelAtPeriodEnd,
      canceledAt: cancelAtPeriodEnd ? undefined : nowUnix(),
    };
    subscriptionStore.set(subscriptionId, canceled);
    return canceled;
  };

  const listSubscriptions = (
    params?: { customerId?: string; status?: StripeSubscriptionStatus; limit?: number }
  ): { data: StripeSubscription[]; hasMore: boolean } => {
    let results = Array.from(subscriptionStore.values());

    if (params?.customerId) {
      results = results.filter((s) => s.customerId === params.customerId);
    }
    if (params?.status) {
      results = results.filter((s) => s.status === params.status);
    }

    results.sort((a, b) => b.created - a.created);
    const limit = params?.limit ?? 10;
    const hasMore = results.length > limit;
    return { data: results.slice(0, limit), hasMore };
  };

  // ── Refunds ──

  const createRefund = (input: CreateRefundInput): StripeRefund => {
    const invoice = requireInvoice(input.invoiceId);

    if (invoice.status !== "paid") {
      throw new StripeError({
        type: "invalid_request_error",
        code: "invoice_not_open",
        message: `Invoice ${input.invoiceId} has status '${invoice.status}' — only paid invoices can be refunded`,
        statusCode: 400,
        param: "invoice",
      });
    }

    const refundAmount = input.amount ?? invoice.amount;
    if (refundAmount > invoice.amount) {
      throw new StripeError({
        type: "invalid_request_error",
        code: "refund_exceeds_charge",
        message: `Refund amount (${refundAmount}) exceeds invoice amount (${invoice.amount})`,
        statusCode: 400,
        param: "amount",
      });
    }

    const now = nowUnix();
    const id = stripeId("re");

    const refund: StripeRefund = {
      id,
      object: "refund",
      invoiceId: input.invoiceId,
      amount: refundAmount,
      currency: invoice.currency,
      status: "succeeded",
      reason: input.reason,
      created: now,
      livemode,
    };

    refundStore.set(id, refund);
    return refund;
  };

  const retrieveRefund = (refundId: string): StripeRefund =>
    requireRefund(refundId);

  // ── Assemble client ──

  return {
    config,

    invoices: {
      create: createInvoice,
      retrieve: retrieveInvoice,
      list: listInvoices,
      voidInvoice,
      pay: payInvoice,
    },

    paymentLinks: {
      create: createPaymentLink,
    },

    customers: {
      retrieve: retrieveCustomer,
      update: updateCustomer,
    },

    subscriptions: {
      create: createSubscription,
      retrieve: retrieveSubscription,
      cancel: cancelSubscription,
      list: listSubscriptions,
    },

    refunds: {
      create: createRefund,
      retrieve: retrieveRefund,
    },

    // Legacy convenience methods
    createInvoice,
    createPaymentLink,
    getCustomer: retrieveCustomer,
  };
};
