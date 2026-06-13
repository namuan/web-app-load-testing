import { test as base, expect } from '@playwright/test';

// Re-export the test object so we can add a default beforeEach that
// blocks any non-localhost request. Tests import { test, expect } from this module.
export const test = base.extend({});
export { expect };

// Block all non-localhost traffic so tests stay offline.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('about:')
    ) {
      return route.continue();
    }
    return route.abort();
  });
});
