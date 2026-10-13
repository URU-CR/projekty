# Zkratky „Zavolat“, „Napsat“, „SMS“, „WhatsApp“ – návod pro macOS 15 (Sequoia)

Aplikace při klepnutí na ikonu u položky ToDo otevře adresu
`shortcuts://run-shortcut?name=<název>&input=text&text=<vstup>` – u telefonu je vstup `jméno`,
u ostatních `jméno|text položky`. Zkratky vytvoříte jednou na Macu; přes iCloud se objeví i na iPhonu.
Názvy lze změnit v menu ⋯ → „Zkratky: volání, e‑mail, SMS, WhatsApp“.

## Jak vypadá editor zkratek na Macu (abychom mluvili o tomtéž)
- Zkratky → tlačítko **+** vlevo nahoře (nebo ⌘N). Otevře se prázdná zkratka; **vpravo je knihovna akcí** s polem **„Hledat akce“** nahoře.
- Akci přidáte **poklepáním** na ni v knihovně (nebo přetažením doleva). Řadí se pod sebe.
- **Název** se nezadává předem: nahoře uprostřed okna je text **„Název zkratky“** – klepněte na něj a přepište (nebo později v přehledu zkratek pravým tlačítkem → Přejmenovat).
- Modré „bubliny“ v akcích jsou proměnné. Klepnutím na bublinu (nebo pravým tlačítkem do pole → **Vybrat proměnnou**) vyberete výstup některé z předchozích akcí; výstup předchozí akce se často doplní sám.
- Hotovo = jen zavřít okno (ukládá se průběžně). Vyzkoušet lze tlačítkem ▶ vpravo nahoře.

---

## 1) Zavolat
Pořadí akcí (hledejte v poli „Hledat akce“ přesně tato slova):

1. **Přijmout vstup** – akce „Přijmout *Jakýkoli* vstup z *Rychlé akce*“ (ve skupině *Skriptování*).
   Klepněte na slovo **Jakýkoli** → nechte jen **Text**. Rozbalte šipkou **▸** a v řádku **Pokud není vstup** zvolte **Požádat o text** (hodí se při ručním spuštění).
2. **Najít kontakty** (skupina *Kontakty*). Rozbalte **▸**:
   - **Přidat filtr** → levý výběr nastavte na **Jméno**, prostřední na **obsahuje**, do pravého pole vložte proměnnou **Vstup zkratky** (klepnout do pole → pravé tlačítko → Vybrat proměnnou, nebo bublinu přetáhnout z první akce).
   - **Omezit** zapnout → **Získat 1 kontakt**.
3. **Zavolat** (skupina *Telefon*; akce se jmenuje „Zavolat“, uvnitř je výběr *Telefon / FaceTime audio*). Do pole kontaktu vložte výstup předchozí akce (bublina **Kontakty**) – obvykle se doplní sám.
4. Název nahoře přepište na **Zavolat**.

Na Macu hovor proběhne přes iPhone: na iPhonu musí být **Nastavení → Aplikace → Telefon → Hovory na jiných zařízeních → Povolit hovory na jiných zařízeních → Mac**.

## 2) Napsat (e‑mail)
1. **Přijmout vstup** – jako výše (Text).
2. **Rozdělit text** (skupina *Text*): rozdělit **Vstup zkratky** podle **Vlastní** oddělovač → do pole napište `|` (svislá čára).
3. **Získat položku ze seznamu** → **První položka** ze *Rozdělený text*. Pak pravým tlačítkem na tuto akci → **Přejmenovat** → `Jméno` (jen pro přehlednost).
4. **Získat položku ze seznamu** (znovu) → **Poslední položka** ze *Rozdělený text* → přejmenovat `Předmět`.
5. **Najít kontakty** → filtr **Jméno obsahuje** *Jméno* (vyberte proměnnou z kroku 3), **Omezit → 1**.
6. **Odeslat e‑mail** (skupina *Mail*). Rozbalte ▸: **Komu** = bublina *Kontakty* z kroku 5, **Předmět** = proměnná *Předmět*, **Zobrazit návrh** zapnuto, tělo nechte prázdné.
   - Otevře se koncept ve výchozím poštovním programu. Aby to byl Outlook: **Outlook → Nastavení → Obecné → Výchozí e‑mailová aplikace** (nebo Mail → Nastavení → Obecné → Výchozí e‑mailová aplikace).
   - Pokud by „Odeslat e‑mail“ otevíral vždy Apple Mail, nahraďte krok 6 dvěma akcemi: **Získat podrobnosti kontaktu** → *E‑mailová adresa* z *Kontakty*; **Otevřít URL**: `mailto:` + bublina *E‑mailová adresa* + `?subject=` + *Předmět*.
7. Název: **Napsat**.

## 3) SMS
1. **Přijmout vstup** (Text).
2. **Rozdělit text** podle `|`.
3. **Získat položku ze seznamu** → **První** → přejmenovat `Jméno`; znovu **Poslední** → `Text`.
4. **Najít kontakty** → Jméno obsahuje *Jméno*, Omezit → 1.
5. **Odeslat zprávu** (skupina *Zprávy*): **Komu** = *Kontakty*, **Zpráva** = *Text*; rozbalit ▸ → **Zobrazit při spuštění** zapnuto (zprávu před odesláním uvidíte a případně upravíte).
6. Název: **SMS**.
Na Macu se zpráva pošle přes Zprávy – jako SMS odejde, když máte na iPhonu zapnuté **Nastavení → Aplikace → Zprávy → Přeposílání textových zpráv → Mac**.

## 4) WhatsApp
1. **Přijmout vstup** (Text).
2. **Rozdělit text** podle `|`.
3. **Získat položku ze seznamu** → **První** → `Jméno`; **Poslední** → `Text`.
4. **Najít kontakty** → Jméno obsahuje *Jméno*, Omezit → 1.
5. **Získat podrobnosti kontaktu** → **Telefonní číslo** z *Kontakty*.
6. **Nahradit text**: nahradit ` ` (mezera) za nic v *Telefonní číslo*; přidejte druhou **Nahradit text**: nahradit `+` za nic. (WhatsApp chce `420777123456`.)
7. **Kódovat URL** → *Text* (aby mezery a diakritika v adrese nevadily).
8. **Adresa URL**: `https://wa.me/` + bublina *Aktualizovaný text* (výsledek kroku 6) + `?text=` + bublina *Zakódovaný text URL* (krok 7).
9. **Otevřít adresy URL** – otevře WhatsApp (Mac i iPhone) s rozepsanou zprávou pro daný kontakt.
10. Název: **WhatsApp**.

---

## První spuštění z aplikace
- Prohlížeč se zeptá „Otevřít aplikaci Zkratky?“ → **Povolit** (u Safari zaškrtněte „Vždy povolit“).
- Zkratky se zeptají, zda smí zkratka číst **Kontakty**, posílat zprávy, volat → **Vždy povolit**.
- Pokud zkratka s daným názvem neexistuje, Zkratky zobrazí chybu; jméno kontaktu je v tu chvíli i ve **schránce** (⌘V do Kontaktů/Outlooku).
- Když jméno odpovídá více kontaktům, vezme se první. Řešení: v kroku „Najít kontakty“ vypnout **Omezit** a před další akci vložit **Vybrat ze seznamu** – zkratka se zeptá, koho myslíte.
