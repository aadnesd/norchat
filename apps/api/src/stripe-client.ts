/**
 * Stripe client abstraction with SDK-like interface.
 *
 * This module provides a realistic Stripe integration pattern used by the
 * billing/stripe_billing action type. In production this would wrap the
 * official Stripe SDK; here it simulates the key operations needed by the
 * platform: creating invoices, generating payment links, and retrieving
 * customer billing info.
 *
 * All IDs follow the Stripe `obj_xxxxx` naming convention.
 */

export type StripeInvoice = {
  id: string;
  object: "invoice";
  customerId: string;
  amount: number;
  currency: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible";
  description?: string;
  dueDate?: string;
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
};

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
};

export type CreatePaymentLinkInput = {
  invoiceId: string;
};

export type StripeClient = {
  readonly config: Readonly<Pick<StripeClientConfig, "apiBase" | "livemode">>;

  /** Create a draft invoice for a customer. */
  createInvoice(input: CreateInvoiceInput): StripeInvoice;

  /** Generate a hosted payment link for an invoice. */
  createPaymentLink(input: CreatePaymentLinkInput): StripePaymentLink;

  /** Retrieve basic customer billing info. */
  getCustomer(customerId: string): StripeCustomer;
};

/**
 * Creates a StripeClient instance.
 *
 * In this MVP the client simulates Stripe API responses with realistic
 * shapes and IDs. Replace the method bodies with actual `fetch` calls to
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

  const createInvoice = (input: CreateInvoiceInput): StripeInvoice => {
    const now = Math.floor(Date.now() / 1000);
    const id = `in_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const dueDate = input.dueInDays
      ? new Date(
          Date.now() + input.dueInDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : undefined;

    return {
      id,
      object: "invoice",
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      status: "open",
      description: input.description,
      dueDate,
      created: now,
      livemode
    };
  };

  const createPaymentLink = (
    input: CreatePaymentLinkInput
  ): StripePaymentLink => {
    const now = Math.floor(Date.now() / 1000);
    const id = `plink_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const url = `https://checkout.stripe.com/c/pay/${id}`;

    return {
      id,
      object: "payment_link",
      url,
      invoiceId: input.invoiceId,
      active: true,
      created: now,
      livemode
    };
  };

  const getCustomer = (customerId: string): StripeCustomer => {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: customerId,
      object: "customer",
      currency: "nok",
      balance: 0,
      created: now,
      livemode
    };
  };

  return { config, createInvoice, createPaymentLink, getCustomer };
};
