# Objective
Build a Norway-first AI support agent platform competing with Chatbase, optimized for fastest setup, broad integrations, and GDPR-aligned security.

# Key Requirements
- Target: Norway-based companies (SMBs and enterprises) with customer service needs.
- Primary outcome: fastest possible setup of support agents for new customers.
- Data sources: broad coverage (files, website crawl, Q&A, text snippets, Notion, ticketing, etc.).
- Channels: web widget + help page, plus email, Slack, WhatsApp, Messenger, Instagram, Zendesk, Salesforce, Shopify, Zapier, WordPress.
- Actions: custom actions, lead capture, escalation to human, web search, Slack, Stripe, Calendly/Cal.com, Salesforce/Shopify.
- Security: GDPR-aligned controls; enterprise-ready security posture.
- UI: use shadcn/ui MCP and 8starlabs UI component libraries.
- Testing: include Playwright-based visual testing for key UI flows.

# Acceptance Criteria (Given-When-Then)
- Given a new tenant, when they create an agent and add a website URL, then the system ingests and retrains successfully within a defined SLA.
- Given an agent with multiple sources, when a user asks a relevant question, then the response cites or references the correct source chunk.
- Given an agent with an escalation rule, when confidence is low, then a ticket is created in the configured CRM.
- Given a web widget on an allowed domain, when a user opens it, then it loads and can stream responses.
- Given a Notion source, when content changes, then auto-retrain updates the KB within 24 hours.
- Given an action integration (e.g., Stripe), when a user asks about billing, then the action executes and returns structured results.
- Given GDPR mode enabled, when a user requests deletion, then the system deletes stored conversation data.

# References
- See specs/chatbase-competitor-norway/ for full requirements, research, design, and plan.

# Concrete Tasks
1) Initialize the project structure for a multi-tenant AI support agent platform (api, web, worker, shared libs).
2) Implement ingestion MVP for files + website crawl, with job queue and status tracking.
3) Implement knowledge base + retrieval service (chunking, embeddings, retrieval API).
4) Implement agent runtime + chat API with streaming responses.
5) Build web widget + hosted help page deployment, including domain allowlist.
6) Build admin console onboarding flow (create agent → add sources → deploy widget).
7) Implement actions framework and first integrations (escalation to CRM, Slack notify, Stripe billing).
8) Add multi-channel connectors (email, Slack, WhatsApp, Zendesk, Salesforce).
9) Add analytics and observability dashboards.
10) Add GDPR controls (deletion, retention), RBAC, audit logging.
11) Add Playwright visual tests for onboarding, widget, help page.


