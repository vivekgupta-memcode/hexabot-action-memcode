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
    title: 'Query',
    description: 'Natural-language memory search query.',
  }),
  actor_id: z.string().trim().min(1).max(256).optional().meta({
    title: 'Actor ID',
    description: 'Optional opaque Memcode actor ID for this Hexabot user.',
  }),
  top_k: z.int().min(1).max(100).default(10).meta({
    title: 'Memory limit',
    description: 'Maximum extracted-memory results.',
  }),
  original_top_k: z.int().min(1).max(100).default(10).meta({
    title: 'Chunk limit',
    description: 'Maximum original stored-chunk results.',
  }),
  include_original_chunks: z.boolean().default(true).meta({
    title: 'Include original chunks',
    description: 'Include eligible original stored chunks in default mode.',
  }),
  minimum_score: z.number().min(0).max(1).default(0).meta({
    title: 'Minimum score',
    description: 'Minimum similarity score from zero to one.',
  }),
});

const outputSchema = z.union([
  z.object({
    success: z.literal(true),
    results: z.array(sourceSchema),
    total: z.number(),
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

export const MemcodeSearchMemoryAction = createAction<
  Input,
  Output,
  WorkflowRuntimeContext,
  Settings
>({
  name: 'memcode_search_memory',
  description: 'Searches the configured Memcode space without expanding into inherited spaces.',
  group: 'memory',
  icon: 'Search',
  color: '#6d5efc',
  inputSchema,
  outputSchema,
  settingsSchema: memcodeSettingsSchema,
  async execute({ input, context, settings, signal }) {
    const client = await createMemcodeClient(context, settings);
    try {
      const result = await client.search(
        {
          context_space_id: settings.space_id,
          actor_id: input.actor_id,
          scope: 'context_only',
          search_mode: 'default',
          query: input.query,
          top_k: input.top_k,
          original_top_k: input.original_top_k,
          include_original_chunks: input.include_original_chunks,
          minimum_score: input.minimum_score,
        },
        { signal },
      );
      return {
        success: true,
        results: result.results,
        total: result.total,
        searched_space_ids: result.searched_space_ids,
        failed_space_ids: result.failed_space_ids,
        partial: result.partial,
        request_id: result.request_id,
      };
    } catch (error) {
      return safeFailure(context, 'memcode_search_memory', error, {
        space_id: settings.space_id,
      });
    }
  },
});

export default MemcodeSearchMemoryAction;
