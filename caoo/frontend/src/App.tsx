import { useEffect, useState } from "react";
import AktualizacjaPrzepisow from "./AktualizacjaPrzepisow";
import ImportArkuszy from "./ImportArkuszy";
import Pracownicy from "./Pracownicy";
import { PanelBrakow } from "./PierwszaOcena";
import { Ikona } from "./Ikona";
import { POZYCJE, Powloka, type Widok } from "./Powloka";
import { pobierzReguly, pobierzZrodla, ROLE, ustawRole, zapisanaRola, type RegulaPanelu, type WersjaRegul, type Zrodla } from "./api";

function Regula({ r }: { r: RegulaPanelu }) {
  return (
    <article className="regula">
      <h3>{r.nazwa ?? r.id}</h3>
      <p className="opis">{r.opis}</p>
      {r.adnotacje.map((a, i) => (
        <div key={i} className="adnotacja">
          <div className="zrodlo">
            <span className={`kategoria ${a.adnotacja.kategoria === "PRZEPIS" ? "przepis" : ""}`}>{a.adnotacja.kategoria}</span>
            {a.dokument}
            {a.adnotacja.lokalizator && <> · {a.adnotacja.lokalizator}</>}
            {a.adnotacja.strona && <> · s. {a.adnotacja.strona}</>}
            {a.cytat_w_korpusie === true && <span className="ok">cytat w korpusie</span>}
            {a.cytat_w_korpusie === false && <span className="blad">brak pokrycia</span>}
          </div>
          {a.adnotacja["cytat_dosłowny"] && <blockquote>{a.adnotacja["cytat_dosłowny"]}</blockquote>}
          {a.adnotacja.uzasadnienie && <p className="opis">{a.adnotacja.uzasadnienie}</p>}
        </div>
      ))}
    </article>
  );
}

export default function App() {
  const [wersje, setWersje] = useState<WersjaRegul[] | null>(null);
  const [zrodla, setZrodla] = useState<Zrodla | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zakladka, setZakladka] = useState<Widok>("pracownicy");
  const [rola, setRola] = useState<string>(zapisanaRola);
  const [gotowa, setGotowa] = useState(false);

  // Przełącznik roli (#10): logowanie kontem demo; uprawnienia egzekwuje API.
  useEffect(() => {
    setGotowa(false);
    ustawRole(rola).then(() => setGotowa(true)).catch(() => setBlad("Nie udało się przełączyć roli (API port 8001)."));
  }, [rola]);

  const wczytajReguly = () => {
    pobierzReguly().then(setWersje).catch(() => setBlad("Brak połączenia z API (port 8001)."));
    pobierzZrodla().then(setZrodla).catch(() => undefined);
  };
  useEffect(wczytajReguly, []);

  // Ta sama reguła jest w każdej wersji przepisów (#25) – pokaż ją raz, z najnowszej wersji.
  const pytania = [...new Map((wersje ?? []).flatMap((w) => w.reguly)
    .filter((r) => r.id === "termin.pytanie-zmiana-oceniajacego").map((r) => [r.id, r] as const)).values()];

  // Nazwa roli z ROLE: „oceniający – naczelnik (K-002)” → ["oceniający", "naczelnik (K-002)"].
  const podziel = (nazwa: string): [string, string] => {
    const [glowna, ...reszta] = nazwa.split(" – ");
    return [glowna, reszta.join(" – ")];
  };
  const biezaca = podziel(ROLE.find((x) => x.login === rola)?.nazwa ?? rola);
  const tytul = zakladka === "rola" ? "Rola w demo" : POZYCJE.find((p) => p.widok === zakladka)?.nazwa;

  return (
    <Powloka widok={zakladka} onWidok={setZakladka} rola={biezaca}>
      <h1 className="tytul-widoku">{tytul}</h1>

      {zakladka === "rola" && (
        <section>
          <p className="opis">Konta demonstracyjne. Uprawnienia sprawdza API, więc każda rola widzi tylko swoje dane.</p>
          <div className="lista">
            {ROLE.map((x) => {
              const [glowna, opis] = podziel(x.nazwa);
              return (
                <button
                  key={x.login}
                  type="button"
                  className="pozycja mala"
                  aria-pressed={x.login === rola}
                  onClick={() => { setRola(x.login); setZakladka("pracownicy"); }}
                >
                  <span className="pozycja-srodek">
                    <span className="pozycja-tytul">{glowna}</span>
                    {opis && <span className="pozycja-opis">{opis}</span>}
                  </span>
                  <span className="pozycja-strzalka"><Ikona nazwa={x.login === rola ? "ok" : "dalej"} /></span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {zakladka === "pracownicy" && gotowa && <Pracownicy key={rola} />}
      {zakladka === "import" && gotowa && <ImportArkuszy key={rola} />}

      {zakladka === "braki" && <PanelBrakow />}
      {zakladka === "przepisy" && gotowa && <AktualizacjaPrzepisow key={rola} onOpublikowano={wczytajReguly} />}

      {zakladka === "zrodla" && blad && <p className="blad">{blad}</p>}

      {zakladka === "zrodla" && pytania.length > 0 && (
        <section>
          <h2>Braki i pytania do organizatorów</h2>
          {pytania.map((r) => <Regula key={r.id} r={r} />)}
        </section>
      )}

      {zakladka === "zrodla" && wersje?.map((w) => (
        <section key={w.wersja}>
          <h2>Reguły · {w.wersja}</h2>
          <p className="opis">Obowiązuje od {w.obowiazuje_od} · plik {w.plik}</p>
          <Regula r={w.data_obowiazywania} />
          {w.reguly.filter((r) => r.id !== "termin.pytanie-zmiana-oceniajacego").map((r) => <Regula key={r.id} r={r} />)}
          {w.rozbieznosci.length > 0 && <h2 className="odstep">Rozbieżności materiałów</h2>}
          {w.rozbieznosci.map((r) => (
            <div key={r.id} className="rozbieznosc">
              <span className="demo">ROZBIEŻNOŚĆ</span>
              <Regula r={r} />
              <p className="opis">{r.rozbieznosc.opis} Zastosowano: {r.rozbieznosc.uzasadnienie}</p>
            </div>
          ))}
        </section>
      ))}

      {zakladka === "zrodla" && zrodla && (
        <section>
          <h2>Źródła</h2>
          <table>
            <thead><tr><th>Dokument</th><th>Kategoria</th><th>Fragmenty</th><th>Status</th></tr></thead>
            <tbody>
              {zrodla.dokumenty.map((d) => (
                <tr key={d.doc_id} className={d.status !== "OK" ? "uwaga" : ""}>
                  <td>{d.nazwa}</td><td>{d.kategoria}</td><td>{d.fragmenty}</td>
                  <td>{d.status === "BRAK_TEKSTU" ? "brak tekstu" : d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {zrodla.pominiete.map((p) => <p key={p.wzorzec} className="opis">Pominięte: {p.wzorzec} – {p.powod}</p>)}
        </section>
      )}
    </Powloka>
  );
}
