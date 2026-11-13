# Jekyll Commerce API



Serverless commerce backend for the Jekyll Commerce storefront.



The Worker provides checkout, payment handling, authoritative catalog and pricing, order persistence, order status, tax, email, and fulfillment integrations while keeping sensitive commerce operations out of the public storefront.



The intended workflow is:



> Clone the backend â†’ configure the new store and environments â†’ create the store catalog â†’ provision store-specific infrastructure and secrets â†’ validate â†’ deploy.



A new store should not require modifications to the reusable commerce engine.



## Requirements



The backend requires:



\- Node.js/npm

\- Cloudflare Workers

\- Wrangler

\- Cloudflare D1

\- Store-specific provider credentials and secrets

\- A compatible Jekyll Commerce frontend repository



Dependencies are defined in `package.json` and locked by `package-lock.json`.



For a clean clone, install the exact locked dependency tree with:



```powershell

npm.cmd ci

```



## Store Configuration



Store and environment configuration is supplied through `wrangler.jsonc` and Worker environment variables.



Review both the top-level production configuration and every named environment before deployment.



Important store configuration includes:



\- `APP\_ENV`

\- `PAYMENT\_ENV`

\- `EMAIL\_PROVIDER`

\- `STORE\_NAME`

\- `STORE\_EMAIL\_FROM`

\- `STORE\_ADMIN\_EMAIL`

\- `FULFILLMENT\_PROVIDER`

\- `STORE\_CURRENCY`

\- `STORE\_MAX\_QUANTITY`

\- `STOREFRONT\_ORIGIN`

\- `STOREFRONT\_BASE\_PATH`

\- `STORE\_SUCCESS\_URL`

\- `STORE\_FAILED\_URL`

\- `PAYMENT\_RETURN\_URL`



Required configuration is validated by the application and should fail closed when required values are missing.



Do not leave previous-store or clone-test domains, email identities, or return URLs in a production deployment.



## Production and Sandbox Environments



Production and sandbox must be treated as separate deployment environments.



A typical configuration contains:



\- A production Worker

\- A sandbox Worker

\- A production D1 database

\- A sandbox D1 database

\- Production environment variables

\- Sandbox environment variables

\- Environment-appropriate provider credentials/secrets



### Important Wrangler Environment Rule



Named Wrangler environments do not automatically inherit all top-level bindings.



In particular, `d1\_databases` must be configured for the named environment when that environment requires D1.



For example, the sandbox configuration must contain its own sandbox D1 binding under:



```text

env.sandbox

```



Do not assume the production D1 binding will be inherited.



Before deployment, Wrangler validation should show the intended database binding for each environment.



## Infrastructure Isolation



Each real store must provision and configure its own production infrastructure as appropriate.



Store-specific infrastructure includes:



\- Worker deployment names

\- Production D1 database

\- Sandbox D1 database

\- D1 database IDs

\- Public storefront domain

\- Worker/API domain

\- Provider credentials

\- Payment credentials

\- Email credentials

\- Fulfillment credentials

\- Webhook secrets

\- Other sensitive environment secrets



Do not deploy a cloned store while it still references another store's production Worker, D1 database, credentials, or secrets.



The repository supplies the application and infrastructure configuration model. It does not make existing infrastructure safe to reuse across unrelated stores.



## Secrets



Do not commit provider credentials, API keys, webhook secrets, payment credentials, or other sensitive values to the repository.



Configure secrets through the appropriate Cloudflare/production secret-management workflow.



Clone testing should use placeholders or isolated sandbox credentials rather than production secrets.



## Canonical Product Catalog



The store-editable canonical commerce catalog is:



```text

src/catalog/products.js

```



This file defines the store's products, variants, SKUs, prices, options, availability inputs, and fulfillment mappings.



A normal store clone is expected to replace this catalog.



Each product must have:



\- A unique product ID

\- A name

\- One or more variants



Each variant must contain:



\- A unique SKU

\- A positive integer price in cents

\- A non-empty options object



Fulfillment configuration may be `null` when a variant has not been mapped to a fulfillment provider.



Do not invent fulfillment product or variant IDs.



## Catalog Engine Boundary



The following catalog tooling is part of the reusable engine and should not normally be modified merely to create another store:



```text

src/catalog/helpers.js

tools/test-catalog.js

tools/export-commerce-catalog.js

tools/sync-storefront-catalog.js

```



The normal store-editable catalog surface is:



```text

src/catalog/products.js

```



Other backend application source should likewise remain unchanged during a normal clone unless an actual engine feature or defect requires modification.



## Catalog Validation



Validate the canonical catalog with:



```powershell

npm.cmd run catalog:validate

```



Validation checks the catalog contract, including product IDs, SKUs, prices, options, duplicate identifiers, and fulfillment mappings.



## Catalog Export and Frontend Sync



The public storefront catalog is generated from the canonical backend catalog.



The sync process:



1\. Validates the canonical catalog.

2\. Exports a public-safe catalog representation.

3\. Copies the generated catalog to the frontend `\_data/commerce-catalog.json`.

4\. Verifies the copied catalog.



Run:



```powershell

npm.cmd run catalog:sync

```



By default, the sync tooling expects the frontend at its configured relative location.



For a differently named or located clone, set:



```powershell

$env:STOREFRONT\_REPO\_PATH="..\\path-to-storefront"

npm.cmd run catalog:sync

```



This allows the repositories to be renamed or arranged differently without modifying the catalog synchronization engine.



## Database and Migrations



The Worker uses Cloudflare D1 for persistent commerce data.



A new production store should use its own production D1 database. Sandbox should use a separate sandbox D1 database.



Database schema is maintained through the repository migrations.



Before production launch:



\- Provision the intended databases

\- Configure the correct D1 IDs and bindings

\- Apply required migrations

\- Confirm production and sandbox point to different intended databases

\- Never use another store's production database for clone testing



## Backend Validation



After configuring a cloned backend, run the automated tests:



```powershell

npm.cmd test -- --run

```



Validate the store configuration contract:



```powershell

node .\\tools\\test-store-config.js

```



Validate the canonical catalog:



```powershell

npm.cmd run catalog:validate

```



All should pass before deployment validation.



## Wrangler Deployment Validation



A clone should be compiled and checked before any real deployment.



Use the repository-local Wrangler installed by `npm ci`.



Inspect supported options with:



```powershell

.\\node\_modules\\.bin\\wrangler.cmd deploy --help

```



Validate the top-level production configuration without uploading:



```powershell

.\\node\_modules\\.bin\\wrangler.cmd deploy --env="" --dry-run --outdir .\\clone-deploy-check

```



Validate the sandbox environment without uploading:



```powershell

.\\node\_modules\\.bin\\wrangler.cmd deploy --env sandbox --dry-run --outdir .\\clone-deploy-check-sandbox

```



`--dry-run` compiles the Worker and runs deployment checks without uploading the Worker.



Review the reported bindings carefully.



Production validation should show the intended production D1 binding and production configuration.



Sandbox validation should show the intended sandbox D1 binding and sandbox configuration.



A successful compilation is not permission to deploy if the configuration still references placeholder, clone-test, or another store's infrastructure.



## Clone-Safe Editing Boundary



A normal store clone may change:



```text

wrangler.jsonc store/environment configuration

src/catalog/products.js

store-specific provider configuration

store-specific infrastructure identifiers

store-specific secrets through the deployment platform

```



The following are reusable commerce-engine surfaces and should not normally require modification simply to create another store:



```text

src/catalog/helpers.js

checkout engine

payment handling

order-status logic

tax engine

email engine

fulfillment engine

webhook handling

shared backend application source

catalog validation/export/sync tooling

```



If a new store requires commerce-engine modifications solely to accommodate its brand, catalog, domain, or normal infrastructure configuration, treat that as a portability defect rather than standard clone setup.



## Recommended Clone Validation



Before launching a cloned backend:



1\. Run `npm.cmd ci`.

2\. Replace production and sandbox store identity configuration.

3\. Configure the storefront origin and return URLs.

4\. Provision separate store-specific production and sandbox infrastructure.

5\. Configure each environment's D1 binding explicitly.

6\. Configure provider credentials and secrets outside source control.

7\. Replace `src/catalog/products.js` with the new store catalog.

8\. Run catalog validation.

9\. Synchronize the public catalog to the frontend.

10\. Run backend automated tests.

11\. Run store configuration validation.

12\. Perform production and sandbox Wrangler dry-runs.

13\. Inspect the bindings shown by Wrangler.

14\. Search for stale previous-store domains, identities, products, and infrastructure references.

15\. Deploy only after all production resources and credentials have been intentionally configured.

16\. Revalidate the complete customer-facing payment flow and eventual backend order state in the production payment environment.



## Production Boundary



A successful clone test proves that the application can be reconfigured, rebuilt, synchronized, and packaged without changing the commerce engine.



It does not automatically provision or certify:



\- Production domains

\- Cloudflare Workers

\- D1 databases

\- Provider accounts

\- Payment credentials

\- Email credentials

\- Fulfillment credentials

\- Webhook configuration

\- Production payment reliability



Those resources must be configured and validated for each real store before launch.



Production launch testing should verify both the customer-facing payment experience and eventual backend order state.

