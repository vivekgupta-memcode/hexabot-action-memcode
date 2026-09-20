import { createAction, type WorkflowRuntimeContext } from '@hexabot-ai/api';
import { z } from 'zod';

import {
  createMemcodeClient,
  memcodeFailureSchema,
  memcodeSettingsSchema,
  safeFailure,
  sourceSchema,
} from './common';

const inputSchema = z.strictObject({
  query: z.string().trim().min(1).max(4_000).meta({
    title: 'Question',
    description: 'Question to answer from Memcode memory.',
  }),
  actor_id: z.string().trim().min(1).max(256).optional().meta({
    title: 'Actor ID',
    description: 'Optional opaque Memcode actor ID for this Hexabot user.',
  }),
  top_k: z.int().min(1).max(100).default(5).meta({
    title: 'Source limit',
    description: 'Maximum number of memory sources considered.',
  }),
});

const outputSchema = z.union([
  z.object({
    success: z.literal(true),
    answer: z.string(),
    sources: z.array(sourceSchema),
    confidence: z.number(),
    searched_space_ids: z.array(z.string()),
    failed_space_ids: z.array(z.string()),
    partial: z.boolean(),
    request_id: z.string().optional(),
  }),
  memcodeFailureSchema,
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;
type Settings = z.infer<typeof memcodeSettingsSchema>;

export const MemcodeRetrieveMemoryAction = createAction<
  Input,
  Output,
  WorkflowRuntimeContext,
  Settings
>({
  name: 'memcode_retrieve_memory',
  description: 'Answers a question from the configured Memcode space with attributed sources.',
  group: 'memory',
  icon: 'MessageSquareText',
  color: '#6d5efc',
  inputSchema,
  outputSchema,
  settingsSchema: memcodeSettingsSchema,
  async execute({ input, context, settings, signal }) {
    const client = await createMemcodeClient(context, settings);
    try {
      const result = await client.retrieve(
        {
          context_space_id: settings.space_id,
          actor_id: input.actor_id,
          scope: 'context_only',
          query: input.query,
          top_k: input.top_k,
        },
        { signal },
      );
      return {
        success: true,
        answer: result.answer,
        sources: result.sources,
        confidence: result.confidence,
        searched_space_ids: result.searched_space_ids,
        failed_space_ids: result.failed_space_ids,
        partial: result.partial,
        request_id: result.request_id,
      };
    } catch (error) {
      return safeFailure(context, 'memcode_retrieve_memory', error, {
        space_id: settings.space_id,
      });
    }
  },
});

export default MemcodeRetrieveMemoryAction;
