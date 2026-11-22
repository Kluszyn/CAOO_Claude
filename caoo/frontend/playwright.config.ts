import { defineConfig, devices } from "playwright/test";

// Testy przeglądarkowe interfejsu: API jest makietą w teście (page.route), więc backend nie jest potrzebny.
// Pierwsze uruchomienie: npx playwright install chromium
const adres = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: adres,
    // ≥ 1280 px: pełne menu boczne z „Zmień rolę”.
    viewport: { width: 1440, height: 900 },
    locale: "pl-PL",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: adres,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
