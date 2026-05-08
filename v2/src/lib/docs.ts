/**
 * Docs link helpers for API responses.
 *
 * Goal: keep deprecation/migration guidance consistent without polluting JSON bodies.
 */

export function docsHeaders(docsUrl: string): HeadersInit {
  const safeUrl = encodeURI(docsUrl);
  // Link header is a standard way to point to a description of a resource/response.
  // Some clients ignore headers, so we also provide a dedicated x-ms-docs header.
  return {
    link: `<${safeUrl}>; rel="describedby"`,
    'x-ms-docs': safeUrl,
  };
}

