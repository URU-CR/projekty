# Projekty – Gantt + ToDo (ÚRÚ ČR)

Samostatná aplikace: statické soubory (GitHub Pages) + Supabase (databáze, přihlášení, úložiště souborů).

## Soubory
| soubor | účel |
|---|---|
| `index.html` | stránka, styly, přihlašovací obrazovka |
| `app.js` | logika aplikace (převzato z prototypu gantt.html) |
| `db.js` | datová vrstva: přihlášení, načtení, synchronizace rozdílů, členové, dokumenty, realtime |
| `config.js` | URL a anon klíč Supabase (**doplnit**) |
| `supabase/schema.sql` | tabulky, role, RLS, bucket `task-files` |

## Nasazení – krok za krokem

### 1. Supabase (projekt „projekty“)
1. **SQL Editor → New query** → vložte celý `supabase/schema.sql` → **Run**. Skript lze spouštět opakovaně.
2. **Authentication → Providers → Email**: nechte zapnuté *Email*; volitelně vypněte *Confirm email* (jinak musí každý nový uživatel potvrdit e-mail – bez vlastního SMTP limit ~3 e-maily/hod).
3. **Authentication → Users → Add user**: založte si účet (e-mail + heslo, *Auto confirm* zaškrtnout). Kolegy můžete zakládat stejně, nebo se registrují sami v aplikaci.
4. **Project Settings → API**: zkopírujte *Project URL* a *anon public* klíč do `config.js`.
5. **Authentication → URL Configuration**: *Site URL* = `https://uru-cr.github.io/projekty/` (kvůli odkazům pro reset hesla).

### 2. GitHub (repo `URU-CR/projekty`)
1. Nahrajte soubory `index.html`, `app.js`, `db.js`, `config.js` do kořene repa (složku `supabase/` také, kvůli evidenci schématu).
2. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main` / root → Save.
3. Za minutu běží na `https://uru-cr.github.io/projekty/`.

Anon klíč je určen pro veřejný frontend – bezpečnost zajišťují RLS politiky v databázi, ne utajení klíče.

### 3. První spuštění
1. Přihlaste se. Menu ⋯ → **Moje jméno** – nastavte jméno přesně tak, jak je uvedené v týmech projektů (např. „Aleš Krupa“); podle něj se párují vaše ToDo.
2. Menu ⋯ → **Import JSON** – nahrajte export z prototypu (menu ⋯ → Export JSON v artefaktu). Projekty se přidají, nic se nepřepisuje.
3. Nastavení projektu → **Přístup**: přidejte kolegy e-mailem a rolí. V sekci **Tým** spojte jména (Jakub Míka, Martin Kozák…) s jejich uživatelskými účty – tím řešitel získá právo upravovat své úkoly a vidí své ToDo v přehledu Dnes.

## Role
| role | může |
|---|---|
| vedoucí (`lead`) | vše v projektu: úkoly, skupiny, tým, přístup, mazání |
| řešitel (`editor`) | upravovat úkoly, kde je odpovědný nebo spolupracovník; deník, odkazy, dokumenty a ToDo v projektu; přidat jméno do týmu |
| čtenář (`viewer`) | jen číst |

Osobní ToDo (Můj inbox) vidí pouze jejich vlastník.

## Jak funguje ukládání
Aplikace drží celý stav v paměti (stejně jako prototyp). Po každé změně porovná stav se snímkem posledního uložení a odešle do Supabase jen rozdíly. Změny od kolegů se přes realtime promítnou do minuty bez obnovení stránky. Kopie stavu je v prohlížeči (localStorage) jako záloha pro čtení bez připojení; export JSON zůstává v menu.

## Aktualizace
Nová verze = nahradit `index.html`, `app.js`, `db.js` v repu. Změny schématu budou vždy jako další `.sql` skript ve složce `supabase/`.
