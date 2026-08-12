type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: 'local';
};

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
    targetAddressSpace: 'local',
  };
  return fetch(input, localInit);
}
