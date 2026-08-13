type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: 'local' | 'loopback';
};

function isLoopbackTarget(input: RequestInfo | URL): boolean {
  try {
    const rawUrl = typeof Request !== 'undefined' && input instanceof Request
      ? input.url
      : input.toString();
    const url = new URL(rawUrl, window.location.href);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '[::1]') return true;

    const ipv4 = hostname.split('.').map(part => Number(part));
    return ipv4.length === 4
      && ipv4.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
      && ipv4[0] === 127;
  } catch {
    return false;
  }
}

/**
 * Marks browser requests that intentionally target a service on the user's LAN.
 * Chromium uses this hint when deciding whether to request Local Network Access.
 * Browsers that do not implement the option safely ignore it.
 */
export function fetchLocalNetwork(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const localInit: LocalNetworkRequestInit = {
    ...init,
    // LNA treats 127.0.0.0/8, localhost and ::1 as the more-private
    // `loopback` space. A mismatched declaration makes Chromium reject it.
    targetAddressSpace: isLoopbackTarget(input) ? 'loopback' : 'local',
  };
  return fetch(input, localInit);
}
