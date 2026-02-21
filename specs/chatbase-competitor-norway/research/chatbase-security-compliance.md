# Chatbase Security & Compliance (Research)

## Scope
Security posture and compliance claims.

## Key Findings
- Claims SOC 2 Type II and GDPR compliance.
- Encryption at rest and in transit.
- Controls: rate limiting, domain allowlist, user roles.

## Architecture Sketch (Security Controls)
```mermaid
flowchart TD
  U[User] --> W[Widget/Channels]
  W --> A[Agent Runtime]
  A --> S[Security Controls]
  S --> D[Encrypted Data Stores]
```

## Implications for Norway Competitor
- Must provide GDPR alignment and security controls as baseline.
- Norway/EU data residency and DPA expectations likely a differentiator.

## Sources
- https://www.chatbase.co/security
