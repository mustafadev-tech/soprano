function getFallbackRandomSegment(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const values = cryptoApi.getRandomValues(new Uint32Array(2));
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  }

  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export function createClientId(prefix = ''): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const baseId =
    cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : `${getFallbackRandomSegment()}-${getFallbackRandomSegment()}`;

  return `${prefix}${baseId}`;
}
