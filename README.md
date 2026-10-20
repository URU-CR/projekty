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
| řešitel (`editor`) | upravovat úkoly, kde je odpovědný nebo spolupracovník; deník, odkazy, dokumenty a ToDo v projektu; přidat jméno do týmu. Volitelně omezen na skupiny (nastavení projektu → Přístup): pak vidí jen zvolené skupiny, zapisuje jen tam, kde má „návrhy úprav/úpravy“ |
| čtenář (`viewer`) | jen číst |
| navrhovatel (`proposer`) | vidí jen skupiny, které mu vedoucí povolí (nastavení projektu → Přístup); u skupin s právem „návrhy úprav“ pracuje ve sdíleném **návrhu** (kopie skupiny); aktuální harmonogram, plnění a deník vidí jen pro čtení |

Osobní ToDo (Můj inbox) vidí pouze jejich vlastník.

## Návrhy změn skupiny
V harmonogramu klepněte na skupinu v legendě → objeví se „+ Otevřít návrh pro …“. Návrh je kopie skupiny, kterou upravují navrhovatelé i vedoucí společně (modrá lišta nahoře, značky *nový* / *≠* u změněných úkolů). Vedoucí návrh **Schválí a promítne** (odpovídající úkoly se aktualizují a ponechají si ToDo, deník, dokumenty a plnění; nové se založí, zrušené smažou) nebo **Zamítne**. Pro skupinu existuje vždy nejvýš jeden otevřený návrh. Vyžaduje `supabase/005_proposals.sql`.

## Jak funguje ukládání
Aplikace drží celý stav v paměti (stejně jako prototyp). Po každé změně porovná stav se snímkem posledního uložení a odešle do Supabase jen rozdíly. Změny od kolegů se přes realtime promítnou do minuty bez obnovení stránky. Kopie stavu je v prohlížeči (localStorage) jako záloha pro čtení bez připojení; export JSON zůstává v menu.

## Aktualizace
Nová verze = nahradit `index.html`, `app.js`, `db.js` v repu. Změny schématu budou vždy jako další `.sql` skript ve složce `supabase/`.

## Denní řízení (od 1.5.0, čtvereček od 1.6.2)
Vedoucí projektu vidí za každým barem šedý čtvereček denní kontroly. Klepnutí: **✓ zelená** = dnes zkontrolováno (drží 3 dny a slábne: včera 60 %, předevčírem 30 %; klepnutí na vybledlou ✓ ji obnoví na dnešek) → **☐ modrá** = v mém ToDo jako „Kontrola …“ (drží, dokud položku v ToDo neodškrtnu; červená po termínu) → prázdný. Dvojklik na bar otevře detail úkolu. Vyžaduje `supabase/018_daily_check.sql`.

## ToDo panel (od 1.8.0; dříve denní seznam)
ToDo se otevírá tlačítkem **ToDo** vpravo nahoře (s počtem otevřených a po termínu) jako plovoucí panel v pravém horním rohu; „–“ ho zmenší na malou lištu s počtem, ✕ zavře, Esc zmenší. Jeden seznam bez sekcí Dnes/Zítra (termín je u položky štítkem), nové položky nahoru, mimo projekty.

## Denní seznam (1.6.0–1.7.x)
Vzhled podle Poznámek: kulaté zaškrtávátko, **nadpisy skupin** (tlačítko „Nadpis“ u sekce), ★ důležité a trojúhelník priority přímo v řádku (klepnutím A → C → B), **přetažení za ⠿** mění pořadí i den (sekci). Vyžaduje `supabase/019_daily_list.sql`.

## Rychlá poznámka (od 1.7.0)
Za čtverečkem denní kontroly je nenápadné „+“: klepnutím se otevře jednořádkový editor (Enter uloží, Esc zavře). Uložená poznámka se zobrazí jako žlutý lísteček ✎, text je v bublině při najetí; ✕ v editoru poznámku zruší. Vyžaduje `supabase/020_quick_note.sql`.

## Deadline projektu (od 1.9.0)
V nastavení projektu lze zadat **Deadline** – finální termín (úkoly ho mohou přesahovat). V grafu je plná červená linka s 🔥 v časové ose (bublina říká, kolik dní zbývá). Volba „zobrazovat odpočet“ přidá do záhlaví živý odpočet **D d HH:MM** do půlnoci na začátku dne deadline (červeně vyplněný pod 14 dní, šedý po uplynutí). Vyžaduje `supabase/022_deadline.sql`.

## 1.10.0 – Denní kontrola, cizí termíny, nápověda
- **Kontrola** (záhlaví, od 1.13.0 jako filtr harmonogramu): zůstanou jen úkoly čekající dnes na kontrolu včetně nadřazených fází; zkontrolované z filtru mizí.
- **Cizí termín**: zaškrtnutí v detailu úkolu/milníku → fialová svislá linka přes graf + název v časové ose. Vyžaduje `supabase/023_external.sql`.
- **Rychlá poznámka** se při přepsání/zrušení zapíše do deníku úkolu.
- **Nápověda** (tlačítko „?“ nebo klávesa ?): zásuvka vlevo, hledání, sbalené skupiny, ikony. Každou novou funkci doplnit do pole `HELP` v app.js.
- Deadline: jednobarevný plamen, odpočet digitálním písmem. Volby „Levá tabulka“ a „Lišta rychlých filtrů“ přesunuty do menu ⋯.

## 1.11.0 – Telefonát / e‑mail z ToDo, iPhone
- Zadání „tel Kozák – …“ / „mail Jandová: …“ označí položku 📞/✉️ a uloží jméno kontaktu (ⓘ v ⋯ lze upravit). Klepnutí spustí zkratku **Zavolat** / **Napsat** (viz `ZKRATKY.md`), jméno je i ve schránce. Vyžaduje `supabase/024_todo_kind.sql`.
- Na úzké obrazovce (iPhone) se otevře ToDo panel přes celou obrazovku.

## 1.14.0 – Urgovat
Čtvereček denní kontroly má 4. stav: prázdný → ✓ → ☐ ToDo → **! urgovat** (okénko s datem, výchozí dnes; Shift+klepnutí datum změní) → prázdný. Oranžový obrys = urgence v budoucnu, červený plný = dnes/po termínu. Filtr „Urgovat dnes“ v liště. Vyžaduje `supabase/025_urge.sql`.

## 1.15.0 – Poznámky
- Malá ikonka vedle tlačítka ToDo otevře plovoucí panel **Poznámky** (nadpis + volný text / odrážky). Poznámky vidí a upravuje **jen jejich autor** (RLS `owner = auth.uid()`), ukládají se do tabulky `notes`.
- Enter v nadpisu založí poznámku, tělo se ukládá samo (1,2 s po dopsání nebo při odchodu z pole). Řádek začínající `- `, `• ` nebo `1. ` po Enteru pokračuje další odrážkou; prázdná odrážka ji ukončí; Shift+Enter = obyčejný řádek.
- ▸/▾ sbalí poznámku na jeden řádek, nad 3 poznámky je hledání. Esc zavře panel; otevřený spolu s ToDo se posune vlevo od něj. Na mobilu přes celou obrazovku.
- Vyžaduje migraci `supabase/026_notes.sql`.

## 1.15.1 – Užší horní lišta
- Horní lišta je vždy jednořádková: záložky projektů se nezalamují; co se nevejde, skryje se do tlačítka „▾ +N“ se seznamem všech projektů (aktivní projekt zůstává vidět vždy). „Všechny projekty“ → „Vše“, „+ projekt“ → „+“.
- Tlačítko „Harmonogram“ zrušeno – „Podle lidí“ je přepínač (vypnuto = celý harmonogram).
- Menší odsazení tlačítek a záložek; jméno uživatele u loga se skrývá pod 1280 px.

## 1.15.2 – Formátování v poznámkách
- Řádek začínající `# ` je tučný mezinadpis uvnitř poznámky (`## `, `### ` menší), `**text**` nebo ⌘B / Ctrl+B nad výběrem je tučně (opakované ⌘B zruší). Mimo editaci se tělo zobrazuje naformátované (nadpisy, odrážky, číslování); klepnutím do textu se otevře editor s kurzorem na konci. Prázdná poznámka je rovnou v editoru.

## 1.15.3 – Poznámky WYSIWYG
- Tělo poznámky je rovnou formátovaný editor (contenteditable) – žádné přepínání mezi náhledem a zdrojem, tučné zůstává tučné i při psaní a kopírování. ⌘B / Ctrl+B = tučně; „- “ / „1. “ na začátku řádku založí seznam; „# “ / „## “ mezinadpis (Enter za ním pokračuje obyčejným řádkem). Vkládání ze schránky jako prostý text (víceřádkový se převede na odstavce/odrážky). ⌘+klik otevře odkaz.
- Ukládá se očištěné HTML (b, i, u, br, div, ul/ol/li, h4/h5, a). Starší poznámky psané značkami (`# `, `**x**`, `- `) se při prvním zobrazení převedou.
- Globální klávesové zkratky (l, n, ?) se nespouštějí při psaní v editoru.

## 1.15.4 – Oprava: „task_log … row-level security“
- Kopírování/vkládání úkolu (klon) přenášelo záznamy deníku a odkazy se stejnými id → při uložení šlo o UPDATE cizího řádku, který RLS zamítla. Klon teď dostává nová id.
- Migrace `027_log_update.sql`: deník úkolu smí aktualizovat každý, kdo smí upravovat úkol (dosud byl povolen jen INSERT), mazat autor nebo editor úkolu.

## 1.16.0 – Export grafu (PNG / PDF k tisku)
- Menu ⋯ → „Export grafu“: výřez projektu **od úkolu – do úkolu** (v pořadí harmonogramu; podúkoly posledního a nadřazené fáze prvního se doplní, hloubku lze omezit), období se předvyplní podle vybraných úkolů (lze přepsat), měřítko auto/týdny/měsíce, volitelné sloupce Odpovědný a %, popisky u krátkých barů, čára „dnes“, deadline projektu. Živý náhled v dialogu.
- „Stáhnout PNG“ (2× rozlišení, do prezentace) nebo „Otevřít k tisku / PDF“ (stránka na šířku s tlačítkem Tisk).

## 1.17.0 – Rozhodovací bod a varianty navazujících úkolů
- V detailu úkolu „Tento úkol je rozhodnutí“: varianty A/B s vlastními názvy (např. Ano/Ne) a která zatím platí (předpoklad). U navazujících úkolů sekce „Varianta podle rozhodnutí“: termíny pro obě varianty; úkol se drží platné varianty, druhá se v grafu kreslí čárkovaně (`.vghost`). Posun baru mění termíny platné varianty (`syncVariants` při commitu).
- „Rozhodnuto: A/B“ přepne navazující úkoly, zapíše deník, štítek ⑂ zezelená (✓); „Znovu otevřít“ vrátí předpoklad.
- Data: `tasks.decision` jsonb `{a,b,pick,resolved,on}`, `tasks.variants` jsonb `{dec,a:{start,end},b:{start,end}}` – migrace `028_decision.sql`. Import/export JSON je přenáší.

## 1.18.0 – Export grafu jako věrný výřez harmonogramu
- Export už nekreslí vlastní zjednodušený SVG, ale vyrenderuje skutečný harmonogram s dočasným nastavením (projekt, měřítko den/týden/měsíc, levá tabulka plná/úzká/žádná, jen vybrané úkoly přes `XP.ids` v `buildRows`) a vezme klon `#gantt` oříznutý na období; stav `V` se vzápětí vrátí. Výsledek má stejné sloupce, osoby, stavy, štítky rozhodnutí, šrafované varianty, vazby i linky dnes/deadline/cizí termíny.
- PNG: SVG `foreignObject` → canvas 2× (formulářové prvky jsou nahrazené textem, jinak by canvas „zašpinily“; Google fonty se vloží jako data URL). Tisk/PDF: samostatná stránka s CSS aplikace, přizpůsobení šířce A4 (na šířku / na výšku).
