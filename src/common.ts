import type { WorkflowRuntimeContext } from '@hexabot-ai/api';
import { MemcodeV2Client } from 'memcode-sdk';
import { z } from 'zod';

const MEMCODE_API_URL = 'https://memory.memcode.in';

export const memcodeSettingsSchema = z.strictObject({
  credential_id: z.string().trim().min(1).meta({
    title: 'Memcode credential',
    description: 'Hexabot Credential containing the Memcode API key.',
    'ui:widget': 'AutoCompleteWidget',
    'ui:options': {
      entity: 'Credential',
      valueKey: 'id',
      labelKey: 'name',
      enableEntityAddButton: true,
    },
  }),
  space_id: z.string().trim().min(1).max(256).meta({
    title: 'Memcode space ID',
    description: 'Pre-provisioned Memcode space used by this workflow.',
  }),
});

export type MemcodeSettings = z.infer<typeof memcodeSettingsSchema>;
export type RuntimeMemcodeSettings = MemcodeSettings & { timeout_ms?: number };

export const memcodeFailureSchema = z.object({
  success: z.literal(false),
  error_code: z.enum([
    'authentication',
    'rate_limited',
    'not_ready',
    'validation',
    'request_failed',
  ]),
});

export type MemcodeFailure = z.infer<typeof memcodeFailureSchema>;

export async function createMemcodeClient(
  context: WorkflowRuntimeContext,
  settings: RuntimeMemcodeSettings,
): Promise<MemcodeV2Client> {
  const apiKey = await context.services.credentials.findOneValue(
    settings.credential_id,
  );
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error(
      'Missing Memcode credential. Configure the action credential_id setting.',
    );
  }
  return new MemcodeV2Client({
    apiUrl: MEMCODE_API_URL,
    apiKey: String(apiKey),
    timeoutMs: settings.timeout_ms ?? 20_000,
  });
}

function errorCode(error: unknown): MemcodeFailure['error_code'] {
  const name = error instanceof Error ? error.constructor.name : '';
  if (name === 'AuthenticationError') return 'authentication';
  if (name === 'RateLimitError') return 'rate_limited';
  if (name === 'NotReadyError') return 'not_ready';
  if (name === 'ValidationError') return 'validation';
  return 'request_failed';
}

export function safeFailure(
  context: WorkflowRuntimeContext,
  action: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): MemcodeFailure {
  const error_code = errorCode(error);
  context.services.logger.warn(`${action} failed`, {
    error_code,
    ...metadata,
  });
  return { success: false, error_code };
}

export const sourceSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number(),
  title: z.string().optional(),
  domain: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  space: z.object({
    id: z.string(),
    kind: z.enum(['channel', 'direct_message', 'custom', 'org_shared']),
    visibility: z.enum(['organization', 'members', 'owner']),
    name: z.string(),
  }),
  provenance: z.object({
    type: z.string(),
    source_id: z.string().optional(),
    source_url: z.string().optional(),
    source_record_id: z.string().optional(),
    source_version: z.string().optional(),
    promoted_from_space_id: z.string().optional(),
    promoted_from_memory_id: z.string().optional(),
  }),
});
