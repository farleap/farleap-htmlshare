import { test, expect } from "@playwright/test";

const DEV_HEADER = { "X-Test-Email": "a@farleap.co.jp" };

async function uploadHtml(request: any, baseURL: string, html: string, name = "doc.html") {
  const up = await request.post(`${baseURL}/api/files`, {
    headers: DEV_HEADER,
    multipart: { file: { name, mimeType: "text/html", buffer: Buffer.from(html) } },
  });
  expect(up.ok()).toBeTruthy();
  return up.json() as Promise<{ id: string; viewUrl: string; shareUrl: string }>;
}

// Core invariant: an uploaded payload that tries to read the parent page must be
// blocked. The preview iframe is a different origin AND sandboxed without
// allow-same-origin, so it is an opaque origin and cannot reach the parent.
test("sandboxed preview cannot reach the parent document", async ({ page, request, baseURL }) => {
  const evil = `<!DOCTYPE html><html><body>
    <div id="result">PENDING</div>
    <script>
      try {
        var c = window.parent.document.cookie;
        document.getElementById('result').textContent = 'LEAK:' + c;
      } catch (e) {
        document.getElementById('result').textContent = 'BLOCKED';
      }
    </script></body></html>`;
  const { id } = await uploadHtml(request, baseURL!, evil, "evil.html");

  await page.goto(`${baseURL}/f/${id}`);
  const result = page.frameLocator("iframe").locator("#result");
  await expect(result).toHaveText("BLOCKED");
  await expect(result).not.toContainText("LEAK");
});

// The Content origin must refuse to serve without a valid signed token.
test("content origin rejects an unsigned request with 403", async ({ request, baseURL }) => {
  const { id } = await uploadHtml(
    request,
    baseURL!,
    "<!DOCTYPE html><html><head><title>x</title></head><body>x</body></html>",
  );
  // Content面 = localhost:8787 (App面 = 127.0.0.1:8787). Hit it directly, no ?t=.
  const contentBase = (baseURL ?? "").replace("127.0.0.1", "localhost");
  const res = await request.get(`${contentBase}/p/${id}`, { failOnStatusCode: false });
  expect(res.status()).toBe(403);
});
