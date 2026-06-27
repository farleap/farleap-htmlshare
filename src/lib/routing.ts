// Decide whether a request should be served by the Content face (R2 HTML) instead
// of the App. Two modes:
//  - Two-host: Content lives on a separate hostname (prod custom domain, or local
//    dev). Any request on that host is Content.
//  - Single-host: App and Content share one hostname (e.g. behind Cloudflare Access
//    on the workers.dev URL). Only `/p/*` is Content; everything else is the App.
export function isContentRequest(opts: {
  host: string;
  pathname: string;
  appHost: string;
  contentHost: string;
}): boolean {
  const isContentHost = opts.host === opts.contentHost;
  const singleHost = opts.appHost === opts.contentHost;
  return isContentHost && (!singleHost || opts.pathname.startsWith("/p/"));
}
