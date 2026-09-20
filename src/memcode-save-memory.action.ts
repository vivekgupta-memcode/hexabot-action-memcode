import { createAction, type WorkflowRuntimeContext } from '@hexabot-ai/api';
import { z } from 'zod';

import {
  createMemcodeClient,
  memcodeFailureSchema,
  memcodeSettingsSchema,
  safeFailure,
} from './common';

const inputSchema = z.strictObject({
  content: z.string().trim().min(1).max(20_000).meta({
    title: 'Memory content',
    description: 'User-approved content to store in Memcode.',
  }),
  actor_id: z.string().trim().min(1).max(256).optional().meta({
    title: 'Actor ID',
    description: 'Optional opaque Memcode actor ID for this Hexabot user.',
  }),
  title: z.string().trim().min(1).max(256).optional().meta({
    title: 'Title',
    description: 'Optional short title for the memory source.',
  }),
  occurred_at: z.iso.datetime().optional().meta({
    title: 'Occurred at',
    description: 'Optional ISO-8601 timestamp for the remembered event.',
  }),
  idempotency_key: z.string().trim().min(1).max(256).meta({
    title: 'Idempotency key',
    description: 'Stable key that makes workflow retries safe.',
  }),
});

const outputSchema = z.union([
  z.object({
    success: z.literal(true),
    job_id: z.string(),
    space_id: z.string(),
    status: z.enum(['processing', 'ready', 'partial', 'failed', 'cancelled']),
    status_url: z.string().optional(),
    request_id: z.string().optional(),
  }),
  memcodeFailureSchema,
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;
type Settings = z.infer<typeof memcodeSettingsSchema>;

export const MemcodeSaveMemoryAction = createAction<
  Input,
  Output,
  WorkflowRuntimeContext,
  Settings
>({
  name: 'memcode_save_memory',
  description: 'Starts a durable, idempotent Memcode ingest for one workflow space.',
  group: 'memory',
  icon: 'BrainCircuit',
  color: '#6d5efc',
  inputSchema,
  outputSchema,
  settingsSchema: memcodeSettingsSchema,
  async execute({ input, context, settings, signal }) {
    const client = await createMemcodeClient(context, settings);
    try {
      const result = await client.ingest(
        {
          space_id: settings.space_id,
          content: input.content,
          actor_id: input.actor_id,
          title: input.title,
          occurred_at: input.occurred_at,
          metadata: {
            source: 'hexabot',
            ...(input.actor_id ? { hexabot_actor_id: input.actor_id } : {}),
          },
          tags: ['integration:hexabot'],
        },
        { idempotencyKey: input.idempotency_key, signal },
      );
      return {
        success: true,
        job_id: result.id,
        space_id: result.space_id,
        status: result.status,
        status_url: result.status_url,
        request_id: result.request_id,
      };
    } catch (error) {
      return safeFailure(context, 'memcode_save_memory', error, {
        space_id: settings.space_id,
      });
    }
  },
});

export default MemcodeSaveMemoryAction;
