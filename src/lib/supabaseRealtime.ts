import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from '@supabase/supabase-js';

import { getSupabaseBrowserClient } from '@/lib/supabaseClient';

type RealtimeEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE';

interface RealtimeBinding<Row extends Record<string, unknown>> {
  event: RealtimeEvent;
  schema: string;
  table: string;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<Row>) => void;
}

interface SubscribeToRealtimeChannelOptions {
  channelName: string;
  bindings: Array<RealtimeBinding<Record<string, unknown>>>;
  onStatusChange?: (status: REALTIME_SUBSCRIBE_STATES, error?: Error) => void;
}

export interface RealtimeChannelSubscription {
  channel: RealtimeChannel;
  unsubscribe: () => Promise<void>;
}

function sanitizeChannelSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '-');
}

export function buildRealtimeChannelName(...parts: string[]): string {
  return ['soprano', ...parts.filter(Boolean).map(sanitizeChannelSegment)].join(':');
}

export async function subscribeToRealtimeChannel(
  options: SubscribeToRealtimeChannelOptions,
): Promise<RealtimeChannelSubscription> {
  const supabase = getSupabaseBrowserClient();
  const channel = supabase.channel(options.channelName);

  for (const binding of options.bindings) {
    channel.on(
      'postgres_changes',
      {
        event: binding.event,
        schema: binding.schema,
        table: binding.table,
        filter: binding.filter,
      },
      (payload) => {
        binding.callback(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
      },
    );
  }

  channel.subscribe((status, error) => {
    options.onStatusChange?.(status, error);
  });

  return {
    channel,
    unsubscribe: async () => {
      const result = await supabase.removeChannel(channel);

      if (result === 'error') {
        console.error('Realtime channel kaldirilamadi', {
          channelName: options.channelName,
        });
      }
    },
  };
}
