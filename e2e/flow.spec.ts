import { test, expect } from "@playwright/test";

const DEV_HEADER = { "X-Test-Email": "a@farleap.co.jp" };

test("upload then preview renders the document inside the sandboxed iframe", async ({ page, request, baseURL }) => {
  const html =
    "<!DOCTYPE html><html><head><title>Deck</title></head><body><h1 id=t>Hello Deck</h1></body></html>";
  const up = await request.post(`${baseURL}/api/files`, {
    headers: DEV_HEADER,
    multipart: { file: { name: "d.html", mimeType: "text/html", buffer: Buffer.from(html) } },
  });
  expect(up.ok()).toBeTruthy();
  const { id } = (await up.json()) as { id: string };

  await page.goto(`${baseURL}/f/${id}`);
  await expect(page.frameLocator("iframe").locator("#t")).toHaveText("Hello Deck");
});

test("share link redirects to the file detail page", async ({ page, request, baseURL }) => {
  const html = "<!DOCTYPE html><html><head><title>Shared</title></head><body><h1 id=t>Shared Deck</h1></body></html>";
  const up = await request.post(`${baseURL}/api/files`, {
    headers: DEV_HEADER,
    multipart: { file: { name: "s.html", mimeType: "text/html", buffer: Buffer.from(html) } },
  });
  const { id, shareUrl } = (await up.json()) as { id: string; shareUrl: string };

  await page.goto(`${baseURL}${shareUrl}`);
  await expect(page).toHaveURL(new RegExp(`/f/${id}$`));
  await expect(page.frameLocator("iframe").locator("#t")).toHaveText("Shared Deck");
});
