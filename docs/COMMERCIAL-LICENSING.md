# Commercial Licensing Strategy

Release: **v1.6.37**

## Current repository licence

The public repository currently contains a root **GNU GPL v2** licence.

That does **not** prevent charging money for the software, hosted access, setup, support, department configuration, training content, analytics, updates or professional services. It does mean that recipients of GPL-covered copies receive the GPL rights that accompany those copies, including source/redistribution rights under the licence.

Do not simply delete or replace the GPL file and assume previously released copies become proprietary. Existing recipients keep the rights already granted to them.

## Recommended department-first commercial model now

Until copyright ownership and relicensing are fully audited, sell the value around the software rather than relying on code secrecy:

- hosted department access
- city/department deployment setup
- station/base/hospital configuration
- approved training-call/location configuration
- onboarding and instructor support
- updates and maintenance
- department-level analytics
- support/SLA options
- custom features and integrations
- scenario authoring/content services

This can support a strong B2B product even while the current public project remains GPL-covered.

## Before creating a proprietary or dual-licensed edition

Complete a copyright/contribution audit first.

For every material source file or subsystem:

1. Identify the original author/copyright holder.
2. Identify whether code came from a third-party project/example/snippet.
3. Record the applicable licence.
4. Confirm whether modifications are yours or contributor-owned.
5. For contributed custom code you want to relicense, obtain the necessary copyright assignment or relicensing permission where required.
6. Keep permissive third-party licence notices with distributions as required.
7. Keep open-data attribution/licence obligations separate from code licensing.
8. Have a Canadian software/IP lawyer review the proposed proprietary/dual-licensing structure before the first proprietary customer contract.

If you are the sole copyright owner of particular original files, you can generally choose additional licences for **your own copyrightable work**, while still respecting third-party components and prior GPL distributions. Do not assume that applies to code owned by contributors or third parties.

## Suggested future repository structure

If the ownership audit supports it, consider:

```text
public-demo/                 GPL/open public demonstration
commercial-core/             privately maintained proprietary code you own
third-party/                 separately licensed dependencies
cities/<department>/         private customer configuration/data where appropriate
legal/                       customer-specific licence/privacy/terms
```

Another option is a dual-licensing model for code you fully own: GPL for the public/open edition and a separate commercial licence for customers who need different redistribution/support terms.

## Department and municipal branding

Use geographic names descriptively, but do not imply official endorsement unless the organization has actually approved the relationship.

Recommended public wording:

> Independent training simulator. Not affiliated with or endorsed by the named municipality, fire service, paramedic service or other agency unless expressly stated.

Before using official department logos, crests, patches, branded apparatus graphics or municipality marks in a paid product, obtain written permission/licence as appropriate.

For commercial branding, prefer a neutral master product brand plus deployment name, for example:

> Response Training — Peterborough Scenario

rather than making the product look like an official municipal system before a formal agreement exists.

## Customer agreement items

Before the first paid department deployment, have a lawyer help finalize a software/service agreement covering at least:

- licence/subscription scope
- number of departments/users/sites as applicable
- hosting/support/maintenance commitments
- training-only/not-for-operational-use limitation
- no warranty of route/map/dispatch accuracy
- acceptable use
- customer-supplied data/content responsibility
- privacy/security schedule
- confidentiality where required
- intellectual-property ownership
- custom-development ownership
- payment/renewal/termination
- limitation of liability/indemnity/insurance as appropriate
- governing law and procurement requirements

## Simulated incidents and real landmarks

Real business/place names may be valuable geographic landmarks for training. The product policy is therefore to preserve useful landmark names while clearly separating them from fictional incidents.

Player-facing wording should communicate:

> All incidents are simulated. Business and organization names are used solely as geographic landmarks. No affiliation, endorsement or actual incident is implied.

Sensitive incidents should be framed as “outside/near” identifiable businesses/landmarks where practical, rather than unnecessarily implying the fictional event occurred inside that business.

## Third-party components

See the repository root `THIRD_PARTY_NOTICES.md` and the City Explorer-specific `city-explorer/THIRD_PARTY_NOTICES.md`.

Third-party open-source/open-data rights do not automatically determine the licence of every original part of the product, but their notice/redistribution requirements must be preserved.

## Not legal advice

This document is an engineering/commercial-readiness checklist, not a legal opinion. Use qualified Canadian/Ontario counsel before changing the project’s licensing structure or signing a paid municipal/department agreement.
