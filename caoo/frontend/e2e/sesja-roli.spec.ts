import { expect, test, type Page, type Request, type Route } from "@playwright/test";

/**
 * Test regresyjny sesji roli w przeglądarce (App.tsx + api.ts), na makiecie API – bez backendu.
 *
 * Kroki scenariusza:
 * 1. Logowanie roli startowej się przeciąga – w tym czasie lista pracowników nie może pójść bez sesji.
 * 2. Pierwsza próba logowania kończy się błędem 503.
 * 3. Ponowienie się udaje. Test przyjmuje oba warianty: aplikacja ponawia sama albo pokazuje
 *    przycisk „Spróbuj ponownie” (wzorzec PONOW), który test klika.
 * 4. Dwie szybkie zmiany roli; odpowiedzi logowania wracają w odwrotnej kolejności
 *    (najpierw ostatnio wybranej roli, potem porzuconej).
 * 5. Po wszystkim lista pracowników jest pobierana z sesją ostatnio wybranej roli – również po
 *    ponownym wejściu w widok i po odświeżeniu strony.
 *
 * Testy: kroki 1–3, kroki 4–5 (start bez błędu) i pełny scenariusz 1–5. Dzięki temu na kodzie bez
 * ponowienia widać też osobno błąd kolejności odpowiedzi.
 *
 * Kolejność odpowiedzi ustalają bramki, nie opóźnienia czasowe, więc wynik nie zależy od szybkości maszyny.
 * Makieta wydaje token `token-<login>`, a dane zwraca tylko z ważnym tokenem (inaczej 401) – jak API.
 */

const PONOW = /spróbuj ponownie|ponów|zaloguj ponownie/i;
const START = "oceniajacy"; // ROLE[0] z api.ts – rola, gdy sessionStorage jest pusty
const PORZUCONA = "kierownik";
const OSTATNIA = "kadry";

const token = (login: string) => `token-${login}`;
const sesja = (t: string | null) => (t?.startsWith("token-") ? t.slice("token-".length) : null);
const jednostka = (login: string) => `Urząd testowy – sesja ${login}`;

const listaPracownikow = (login: string) => ({
  demo: true,
  znacznik: "DANE FIKCYJNE",
  jednostka: jednostka(login),
  pracownicy: [{
    id: "K-900", imie: "Tomasz", nazwisko: "Testowy", stanowisko: "specjalista", komorka: "Wydział testów",
    przelozony_id: null, demo: true,
  }],
});

const PROCES = {
  proces: "OKRESOWA", arkusz: "C", przeslanki: [], braki: [], komunikat: "", wersja_regul: "test", termin_oceny: null,
};

const tokenZapytania = (r: Request) => r.headers()["authorization"]?.replace(/^Bearer\s+/i, "") ?? null;
const bezSesji = (route: Route) => route.fulfill({ status: 401, json: { detail: "Brak lub nieznany token" } });

interface Bramka {
  status: number;
  otworz: () => void;
  otwarta: Promise<void>;
  obsluzone: Promise<void>[];
}

class MakietaApi {
  /** Loginy z kolejnych POST /api/auth/login, w kolejności przyjścia. */
  readonly logowania: string[] = [];
  /** Tokeny kolejnych GET /api/kadry/pracownicy (null = zapytanie bez sesji). */
  readonly lista: (string | null)[] = [];
  /** Tokeny pozostałych zapytań widoku Pracownicy (kalendarz: /api/pracownicy/{id}/proces). */
  readonly widok: (string | null)[] = [];
  private readonly bramki = new Map<string, Bramka>();

  /** Logowania tej roli czekają, aż test je zwolni, a potem dostają `status`. */
  zatrzymaj(login: string, status = 200) {
    let otworz!: () => void;
    const otwarta = new Promise<void>((r) => { otworz = r; });
    this.bramki.set(login, { status, otworz, otwarta, obsluzone: [] });
  }

  /**
   * Wypuszcza zatrzymane logowania roli i czeka, aż odpowiedzi dotrą do przeglądarki.
   * Logowania tej roli, które przyjdą później (ponowienie), dostają od razu 200.
   */
  async zwolnij(login: string) {
    const b = this.bramki.get(login);
    if (!b) throw new Error(`Brak zatrzymanych logowań roli ${login}`);
    this.bramki.delete(login);
    b.otworz();
    await Promise.all(b.obsluzone);
  }

  ile(login: string) {
    return this.logowania.filter((l) => l === login).length;
  }

  async podlacz(page: Page) {
    // Playwright sprawdza trasy od ostatnio dodanej, więc „reszta API” idzie pierwsza.
    await page.route((u) => u.pathname.startsWith("/api/"), (r) => r.fulfill({ status: 404, json: { detail: "Brak w makiecie testu" } }));
    await page.route((u) => u.pathname === "/api/reguly", (r) => r.fulfill({ json: [] }));
    await page.route((u) => u.pathname === "/api/zrodla", (r) => r.fulfill({ json: { dokumenty: [], pominiete: [] } }));
    await page.route((u) => /^\/api\/pracownicy\/[^/]+\/proces$/.test(u.pathname), (r) => {
      const t = tokenZapytania(r.request());
      this.widok.push(t);
      return sesja(t) ? r.fulfill({ json: PROCES }) : bezSesji(r);
    });
    await page.route((u) => u.pathname === "/api/kadry/pracownicy", (r) => {
      const t = tokenZapytania(r.request());
      this.lista.push(t);
      const login = sesja(t);
      return login ? r.fulfill({ json: listaPracownikow(login) }) : bezSesji(r);
    });
    await page.route((u) => u.pathname === "/api/auth/login", (r) => this.zaloguj(r));
  }

  private zaloguj(route: Route): Promise<void> {
    const { login } = route.request().postDataJSON() as { login: string };
    this.logowania.push(login);
    const b = this.bramki.get(login);
    const obsluga = (async () => {
      if (b) await b.otwarta;
      const status = b?.status ?? 200;
      try {
        await route.fulfill(status === 200
          ? { json: { token: token(login) } }
          : { status, json: { detail: "Logowanie chwilowo niedostępne" } });
      } catch {
        // Aplikacja przerwała porzucone zapytanie (np. AbortController) – to też poprawne zachowanie.
      }
    })();
    b?.obsluzone.push(obsluga);
    return obsluga;
  }
}

const naglowekListy = (page: Page, login: string) =>
  page.getByRole("heading", { name: `Pracownicy · ${jednostka(login)}` });

async function wybierzRole(page: Page, nazwa: RegExp) {
  await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: "Zmień rolę" }).click();
  await page.getByRole("main").getByRole("button", { name: nazwa }).click();
}

/** Ponowienie: czeka na samoczynną drugą próbę albo na przycisk ponowienia i go klika. */
async function ponowLogowanie(page: Page, ponowionoSamo: () => boolean) {
  const przycisk = page.getByRole("button", { name: PONOW }).first();
  await expect.poll(async () => ponowionoSamo() || (await przycisk.isVisible()), {
    message: "Po błędzie logowania aplikacja nie ponowiła próby ani nie pokazała przycisku ponowienia",
    timeout: 10_000,
  }).toBe(true);
  if (!ponowionoSamo()) await przycisk.click();
}

/** Daje aplikacji chwilę na obsłużenie odpowiedzi (mikrozadania i render), gdy sprawdzamy, że nic się nie zmieniło. */
const chwila = (page: Page) => page.waitForTimeout(300);

const obce = (tokeny: (string | null)[], login: string) => tokeny.filter((t) => t !== token(login));

// --- Kroki scenariusza (wspólne dla testów poniżej) ---------------------------------------------

const BRAK_LISTY = /^Pracownicy · /;

/** Kroki 1–3: opóźnione logowanie roli startowej, 503 przy pierwszej próbie, udane ponowienie. */
async function startZBledemIPonowieniem(page: Page, api: MakietaApi) {
  await test.step("opóźnione logowanie: bez sesji nie ma zapytania o listę", async () => {
    api.zatrzymaj(START, 503);
    await page.goto("/");
    await expect.poll(() => api.ile(START), { message: "Aplikacja nie zaczęła logowania roli startowej" }).toBeGreaterThan(0);
    await chwila(page); // logowanie wciąż trwa (StrictMode w trybie dev może wysłać dwa)
    expect(api.lista, "Lista pracowników poszła, zanim logowanie się skończyło").toEqual([]);
    await expect(page.getByRole("heading", { name: BRAK_LISTY })).toHaveCount(0);
  });

  const logowaniaPrzedBledem = api.logowania.length;

  await test.step("pierwsza próba logowania kończy się błędem 503", async () => {
    await api.zwolnij(START);
    await chwila(page);
    expect(api.lista, "Po błędzie logowania lista pracowników nie może iść bez sesji").toEqual([]);
    await expect(page.getByRole("heading", { name: BRAK_LISTY })).toHaveCount(0);
  });

  await test.step("ponowienie logowania się udaje i lista przychodzi z tą sesją", async () => {
    await ponowLogowanie(page, () => api.logowania.length > logowaniaPrzedBledem);
    await expect(naglowekListy(page, START)).toBeVisible();
    expect(api.logowania.slice(logowaniaPrzedBledem).filter((l) => l !== START), "Ponowienie zalogowało inną rolę").toEqual([]);
    expect(api.lista.length).toBeGreaterThan(0);
    expect(obce(api.lista, START), "Lista po ponowieniu z inną sesją niż rola startowa").toEqual([]);
    await expect(page.getByRole("button", { name: PONOW }), "Przycisk ponowienia nie znika po udanym logowaniu").toHaveCount(0);
  });
}

/** Start bez błędu: rola startowa loguje się od razu i lista przychodzi z jej sesją. */
async function startBezBledu(page: Page, api: MakietaApi) {
  await test.step("rola startowa loguje się bez błędu", async () => {
    await page.goto("/");
    await expect(naglowekListy(page, START)).toBeVisible();
    expect(obce(api.lista, START), "Lista z inną sesją niż rola startowa").toEqual([]);
  });
}

/** Krok 4: dwie zmiany roli, odpowiedzi logowania wracają w odwrotnej kolejności. Zwraca, od których zapytań liczyć rolę kadry. */
async function odwroconeOdpowiedzi(page: Page, api: MakietaApi) {
  const od = { lista: 0, widok: 0 };
  await test.step("dwie zmiany roli: odpowiedzi logowania wracają w odwrotnej kolejności", async () => {
    api.zatrzymaj(PORZUCONA);
    api.zatrzymaj(OSTATNIA);

    await wybierzRole(page, /kierownik urzędu/);
    await expect.poll(() => api.ile(PORZUCONA), { message: "Brak logowania roli kierownik" }).toBeGreaterThan(0);

    await wybierzRole(page, /^kadry/);
    await expect.poll(() => api.ile(OSTATNIA), {
      message: "Logowanie roli kadry nie wyszło, choć logowanie roli kierownik wciąż trwa",
    }).toBeGreaterThan(0);

    // Liczymy od chwili tuż przed odpowiedzią logowania kadr: wcześniej sesja kadr nie istnieje,
    // a zapytania z przełączania ról (np. chwilowy montaż widoku ze starą sesją) nie są przedmiotem kroku 5.
    od.lista = api.lista.length;
    od.widok = api.widok.length;
    await api.zwolnij(OSTATNIA); // najpierw odpowiedź ostatnio wybranej roli…
    await expect(naglowekListy(page, OSTATNIA)).toBeVisible();

    await api.zwolnij(PORZUCONA); // …a dopiero potem spóźniona odpowiedź porzuconej
    await chwila(page);
    await expect(naglowekListy(page, OSTATNIA)).toBeVisible();
    await expect(naglowekListy(page, PORZUCONA)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Menu" })).toContainText("kadry / zarządzający");
  });
  return od;
}

/** Krok 5: po wszystkim lista idzie z sesją ostatnio wybranej roli – po powrocie do widoku i po odświeżeniu. */
async function sesjaOstatniejRoli(page: Page, api: MakietaApi, od: { lista: number; widok: number }) {
  await test.step("po wszystkim lista pracowników idzie z sesją ostatnio wybranej roli", async () => {
    const przedPowrotem = api.lista.length;
    const menu = page.getByRole("navigation", { name: "Menu" });
    await menu.getByRole("button", { name: /Panel źródeł/ }).click();
    await menu.getByRole("button", { name: /^Pracownicy/ }).click();
    await expect.poll(() => api.lista.length, {
      message: "Po powrocie do widoku Pracownicy lista nie została pobrana ponownie",
    }).toBeGreaterThan(przedPowrotem);

    expect(api.lista, "Sesja porzuconej roli nie może posłużyć do pobrania listy").not.toContain(token(PORZUCONA));
    expect(obce(api.lista.slice(od.lista), OSTATNIA), "Lista po wyborze roli kadry z inną sesją").toEqual([]);
    await expect(naglowekListy(page, OSTATNIA)).toBeVisible();
    expect(obce(api.widok.slice(od.widok), OSTATNIA), "Kalendarz ocen po wyborze roli kadry z inną sesją").toEqual([]);
  });

  await test.step("po odświeżeniu strony zostaje ostatnio wybrana rola", async () => {
    const logowania = api.logowania.length;
    const lista = api.lista.length;
    await page.reload();
    await expect.poll(() => api.lista.length, { message: "Po odświeżeniu lista nie została pobrana" }).toBeGreaterThan(lista);
    expect(api.logowania.slice(logowania).filter((l) => l !== OSTATNIA), "Po odświeżeniu zalogowano inną rolę").toEqual([]);
    expect(obce(api.lista.slice(lista), OSTATNIA), "Lista po odświeżeniu z inną sesją").toEqual([]);
    await expect(naglowekListy(page, OSTATNIA)).toBeVisible();
  });
}

async function makieta(page: Page) {
  const api = new MakietaApi();
  await api.podlacz(page);
  return api;
}

// --- Testy ------------------------------------------------------------------------------------
// Każdy błąd ma własny test, więc brak ponowienia nie zasłania błędu kolejności odpowiedzi (i odwrotnie).

test("opóźnione logowanie, błąd pierwszej próby i udane ponowienie", async ({ page }) => {
  const api = await makieta(page);
  await startZBledemIPonowieniem(page, api);
});

test("odpowiedzi logowania w odwrotnej kolejności: lista z sesją ostatnio wybranej roli", async ({ page }) => {
  const api = await makieta(page);
  await startBezBledu(page, api);
  await sesjaOstatniejRoli(page, api, await odwroconeOdpowiedzi(page, api));
});

test("pełny scenariusz: błąd i ponowienie, potem odwrócone odpowiedzi – lista z sesją ostatnio wybranej roli", async ({ page }) => {
  const api = await makieta(page);
  await startZBledemIPonowieniem(page, api);
  await sesjaOstatniejRoli(page, api, await odwroconeOdpowiedzi(page, api));
});
