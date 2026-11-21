import type { ReactNode } from "react";
import { Ikona, type NazwaIkony } from "./Ikona";
import znak from "./hipopotam/hipopotam-stoi.webp";

/**
 * Powłoka CAOO w układzie Kompasu (mObywatel): menu boczne z hipopotamem jako znakiem i treść.
 * Do 1279 px menu zwija się do ikon, na telefonie jest dolnym paskiem (krótkie nazwy).
 */
export type Widok = "pracownicy" | "zrodla" | "import" | "braki" | "przepisy" | "rola";

export const POZYCJE: { widok: Widok; ikona: NazwaIkony; nazwa: string; krotko: string }[] = [
  { widok: "pracownicy", ikona: "osoby", nazwa: "Pracownicy", krotko: "Pracownicy" },
  { widok: "zrodla", ikona: "ksiazka", nazwa: "Panel źródeł", krotko: "Źródła" },
  { widok: "import", ikona: "gora", nazwa: "Import arkuszy", krotko: "Import" },
  { widok: "braki", ikona: "pytanie", nazwa: "Panel braków", krotko: "Braki" },
  { widok: "przepisy", ikona: "dokument", nazwa: "Aktualizacja przepisów", krotko: "Przepisy" },
];

interface Props {
  widok: Widok;
  onWidok: (w: Widok) => void;
  /** Bieżąca rola: [rola, opis], np. ["oceniający", "naczelnik (K-002)"]. */
  rola: [string, string];
  children: ReactNode;
}

export function Powloka({ widok, onWidok, rola, children }: Props) {
  return (
    <div className="powloka">
      <nav className="menu" aria-label="Menu">
        <button type="button" className="znak" onClick={() => onWidok("pracownicy")}>
          <img src={znak} alt="" width={40} height={49} />
          <span className="napis">
            Cyfrowy Asystent
            <br />
            Ocen Okresowych
          </span>
        </button>
        {POZYCJE.map((p) => (
          <button
            key={p.widok}
            type="button"
            className="poz"
            aria-current={widok === p.widok ? "page" : undefined}
            onClick={() => onWidok(p.widok)}
          >
            <Ikona nazwa={p.ikona} rozmiar={22} />
            <span className="napis">
              <span className="pelna">{p.nazwa}</span>
              <span className="krotka">{p.krotko}</span>
            </span>
          </button>
        ))}
        <button
          type="button"
          className="poz tylko-zwiniete"
          aria-current={widok === "rola" ? "page" : undefined}
          onClick={() => onWidok("rola")}
        >
          <Ikona nazwa="konto" rozmiar={22} />
          <span className="napis">Rola</span>
        </button>
        <div className="menu-dol">
          <div className="konto">
            <span className="inicjaly" aria-hidden="true">
              {rola[0].slice(0, 2).toUpperCase()}
            </span>
            <span className="napis">
              <strong>{rola[0]}</strong>
              <span className="meta">{rola[1]}</span>
              <button type="button" className="link" onClick={() => onWidok("rola")}>
                Zmień rolę
              </button>
            </span>
          </div>
        </div>
      </nav>

      <main className="tresc">
        <div className="kolumna">{children}</div>
      </main>
    </div>
  );
}
