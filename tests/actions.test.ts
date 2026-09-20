import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  ingest: vi.fn(),
  getIngestStatus: vi.fn(),
  search: vi.fn(),
  retrieve: vi.fn(),
  constructorOptions: [] as unknown[],
}));

vi.mock('memcode-sdk', () => ({
  MemcodeV2Client: class {
    constructor(options: unknown) {
      sdk.constructorOptions.push(options);
    }
    ingest = sdk.ingest;
    getIngestStatus = sdk.getIngestStatus;
    search = sdk.search;
    retrieve = sdk.retrieve;
  },
}));

import { MemcodeSaveMemoryAction } from '../src/memcode-save-memory.action';
import { MemcodeIngestStatusAction } from '../src/memcode-ingest-status.action';
import { MemcodeRetrieveMemoryAction } from '../src/memcode-retrieve-memory.action';
import { MemcodeSearchMemoryAction } from '../src/memcode-search-memory.action';

class AuthenticationError extends Error {}

function harness(secret = 'test-only-secret') {
  const logs: unknown[] = [];
  const context = {
    services: {
      credentials: { findOneValue: vi.fn().mockResolvedValue(secret) },
      logger: { warn: vi.fn((...args: unknown[]) => logs.push(args)) },
    },
  } as any;
  const settings = {
    credential_id: 'credential-1',
    space_id: 'space-1',
    timeout_ms: 1234,
    retries: {
      enabled: false,
      max_attempts: 1,
      backoff_ms: 0,
      max_delay_ms: 0,
      jitter: 0,
      multiplier: 1,
    },
  } as any;
  return { context, settings, logs, signal: new AbortController().signal };
}

beforeEach(() => {
  sdk.ingest.mockReset();
  sdk.getIngestStatus.mockReset();
  sdk.search.mockReset();
  sdk.retrieve.mockReset();
  sdk.constructorOptions.length = 0;
});

describe('hexabot-action-memcode', () => {
  it('requires a stored Hexabot credential and never accepts a raw key input', async () => {
    const h = harness('');
    const action = new MemcodeSaveMemoryAction({ register: vi.fn() } as any);
    await expect(action.execute({
      input: { content: 'hello', idempotency_key: 'turn-1' },
      context: h.context,
      settings: h.settings,
      bindings: {},
      signal: h.signal,
    } as any)).rejects.toThrow(/Missing Memcode credential/);
    expect(sdk.ingest).not.toHaveBeenCalled();
    expect(JSON.stringify(h.logs)).not.toContain('test-only-secret');
  });

  it('constructs an idempotent, context-only save without attribution spoofing', async () => {
    sdk.ingest.mockResolvedValue({
      id: 'job-1',
      space_id: 'space-1',
      status: 'processing',
      status_url: '/v2/memory/ingest/job-1',
      request_id: 'request-1',
    });
    const h = harness();
    const action = new MemcodeSaveMemoryAction({ register: vi.fn() } as any);
    const output = await action.execute({
      input: {
        content: 'Remember a concise reply style',
        actor_id: 'actor-1',
        idempotency_key: 'turn-1',
      },
      context: h.context,
      settings: h.settings,
      bindings: {},
      signal: h.signal,
    } as any);
    expect(output).toEqual({
      success: true,
      job_id: 'job-1',
      space_id: 'space-1',
      status: 'processing',
      status_url: '/v2/memory/ingest/job-1',
      request_id: 'request-1',
    });
    const [input, options] = sdk.ingest.mock.calls[0];
    expect(input).toMatchObject({
      space_id: 'space-1',
      actor_id: 'actor-1',
      content: 'Remember a concise reply style',
      metadata: { source: 'hexabot', hexabot_actor_id: 'actor-1' },
    });
    expect(JSON.stringify(input)).not.toMatch(/integration_id|integration_channel|attribution_status/);
    expect(options.idempotencyKey).toBe('turn-1');
    expect(options.signal).toBe(h.signal);
    expect(sdk.constructorOptions[0]).toEqual({
      apiUrl: 'https://memory.memcode.in',
      apiKey: 'test-only-secret',
      timeoutMs: 1234,
    });
    expect(JSON.stringify(output)).not.toContain('test-only-secret');
  });

  it('fails closed when an ingest receipt belongs to another space', async () => {
    sdk.getIngestStatus.mockResolvedValue({
      id: 'job-1',
      space_id: 'space-other',
      status: 'ready',
      produced_memory_ids: ['memory-1'],
      affected_memory_ids: [],
      retryable: false,
    });
    const h = harness();
    const action = new MemcodeIngestStatusAction({ register: vi.fn() } as any);
    const output = await action.execute({
      input: { job_id: 'job-1' },
      context: h.context,
      settings: h.settings,
      bindings: {},
      signal: h.signal,
    } as any);
    expect(output).toEqual({ success: false, error_code: 'validation' });
    expect(JSON.stringify(output)).not.toContain('space-other');
  });

  it('uses context_only search and returns safe failure codes without raw errors', async () => {
    sdk.search.mockRejectedValue(new AuthenticationError('Bearer test-only-secret'));
    const h = harness();
    const action = new MemcodeSearchMemoryAction({ register: vi.fn() } as any);
    const output = await action.execute({
      input: {
        query: 'preferences',
        top_k: 5,
        original_top_k: 5,
        include_original_chunks: false,
        minimum_score: 0.4,
      },
      context: h.context,
      settings: h.settings,
      bindings: {},
      signal: h.signal,
    } as any);
    expect(output).toEqual({ success: false, error_code: 'authentication' });
    expect(JSON.stringify(h.logs)).not.toContain('test-only-secret');
    expect(sdk.search.mock.calls[0][0]).toMatchObject({
      context_space_id: 'space-1',
      scope: 'context_only',
      search_mode: 'default',
    });
  });

  it('retrieves from only the configured space and forwards cancellation', async () => {
    sdk.retrieve.mockResolvedValue({
      answer: 'The user prefers concise replies.',
      sources: [],
      confidence: 0.88,
      searched_space_ids: ['space-1'],
      failed_space_ids: [],
      partial: false,
      request_id: 'request-2',
    });
    const h = harness();
    const action = new MemcodeRetrieveMemoryAction({ register: vi.fn() } as any);
    const output = await action.execute({
      input: { query: 'How should I reply?', actor_id: 'actor-1', top_k: 4 },
      context: h.context,
      settings: h.settings,
      bindings: {},
      signal: h.signal,
    } as any);

    expect(sdk.retrieve).toHaveBeenCalledWith({
      context_space_id: 'space-1',
      actor_id: 'actor-1',
      scope: 'context_only',
      query: 'How should I reply?',
      top_k: 4,
    }, { signal: h.signal });
    expect(output).toMatchObject({
      success: true,
      answer: 'The user prefers concise replies.',
      request_id: 'request-2',
    });
  });
});
