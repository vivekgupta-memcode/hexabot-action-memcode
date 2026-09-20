# hexabot-action-memcode

Memcode long-term-memory actions for Hexabot v3 workflows. The package emits
four Nest-discoverable `*.action.js` files under the required
`hexabot-action-*` npm convention:

- `memcode_save_memory` — durable, idempotent memory ingest;
- `memcode_ingest_status` — poll the ingest receipt;
- `memcode_search_memory` — context-only semantic search;
- `memcode_retrieve_memory` — grounded answer with sources.

## Install

```bash
npm install hexabot-action-memcode
```

Restart Hexabot after installation so its dynamic action loader discovers the
compiled action files. No separate registration hook is required.

## Configure

Create a Hexabot Credential containing the Memcode API key. In each action's
settings, select that Credential and enter the pre-provisioned Memcode
`space_id`. The secret is resolved at execution time through
`context.services.credentials.findOneValue`; it is never placed in workflow
YAML, action inputs, outputs, or logs.

For organization deployments, bind the optional `actor_id` input to the opaque
Memcode actor associated with the current Hexabot user. Do not pass external
email addresses or usernames in place of a Memcode actor ID. The Memory API
remains authoritative for actor and space access.

## Example workflow fragment

```yaml
defs:
  remember_preference:
    kind: task
    action: memcode_save_memory
    inputs:
      content: =$input.preference
      actor_id: =$input.memcode_actor_id
      idempotency_key: =$input.turn_id
```

Configure `credential_id` and `space_id` in the action settings through the
visual editor. Writes require a stable idempotency key so Hexabot retry settings
cannot duplicate the ingest.

## Security and failure behavior

- The hosted API origin is fixed to `https://memory.memcode.in`; workflow input
  cannot redirect credentials to another host.
- Reads use `scope: context_only` and the configured space ID.
- Integration attribution is assigned by Memcode. The package does not send an
  `orgSource` header or allow attribution fields in inputs/metadata.
- Cancellation and `timeout_ms` are passed to the SDK. Reads are retry-safe;
  writes remain safe only because `idempotency_key` is required.
- Provider failures return a small `error_code` suitable for workflow
  branching. Raw upstream messages, response bodies, authorization headers, and
  credentials are not logged or returned.
- Missing credentials are configuration errors and stop execution before a
  network request.
- The package has no background tasks, telemetry, browser code, native code, or
  postinstall scripts.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Tests mock the Memcode client and do not require credentials or network access.
