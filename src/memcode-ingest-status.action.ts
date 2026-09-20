import { createAction, type WorkflowRuntimeContext } from '@hexabot-ai/api';
import { z } from 'zod';

import {
  createMemcodeClient,
  memcodeFailureSchema,
  memcodeSettingsSchema,
  safeFailure,
} from './common';

const inputSchema = z.strictObject({
  job_id: z.string().trim().min(1).max(256).meta({
    title: 'Ingest job ID',
    description: 'Job ID returned by memcode_save_memory.',
  }),
});

const statusSchema = z.enum(['processing', 'ready', 'partial', 'failed', 'cancelled']);
const outputSchema = z.union([
  z.object({
    success: z.literal(true),
    job_id: z.string(),
    space_id: z.string(),
    status: statusSchema,
    produced_memory_ids: z.array(z.string()),
    affected_memory_ids: z.array(z.string()),
    retryable: z.boolean(),
    request_id: z.string().optional(),
  }),
  memcodeFailureSchema,
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;
type Settings = z.infer<typeof memcodeSettingsSchema>;

export const MemcodeIngestStatusAction = createAction<
  Input,
  Output,
  WorkflowRuntimeContext,
  Settings
>({
  name: 'memcode_ingest_status',
  description: 'Reads the durable status of a Memcode ingest job.',
  group: 'memory',
  icon: 'ListChecks',
  color: '#6d5efc',
  inputSchema,
  outputSchema,
  settingsSchema: memcodeSettingsSchema,
  async execute({ input, context, settings, signal }) {
    const client = await createMemcodeClient(context, settings);
    try {
      const result = await client.getIngestStatus(input.job_id, { signal });
      if (result.space_id !== settings.space_id) {
        context.services.logger.warn('memcode_ingest_status rejected a cross-space receipt', {
          configured_space_id: settings.space_id,
          returned_space_id: result.space_id,
        });
        return { success: false, error_code: 'validation' };
      }
      return {
        success: true,
        job_id: result.id,
        space_id: result.space_id,
        status: result.status,
        produced_memory_ids: result.produced_memory_ids,
        affected_memory_ids: result.affected_memory_ids,
        retryable: result.retryable,
        request_id: result.request_id,
      };
    } catch (error) {
      return safeFailure(context, 'memcode_ingest_status', error, {
        space_id: settings.space_id,
      });
    }
  },
});

export default MemcodeIngestStatusAction;
