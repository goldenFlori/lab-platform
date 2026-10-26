# Marrëveshje për përpunimin e të dhënave personale (model)

> **Model, versioni 1 (19 tetor 2026).** Duhet shqyrtuar nga një jurist para se të nënshkruhet.
> Nuk është këshillë ligjore. Teksti në [kllapa katrore] plotësohet për çdo institucion. Ky version
> në shqip është ai që nënshkruhet; versioni anglisht (`dpa-template.en.md`) e ndjek.
>
> Çdo pohim teknik më poshtë përshkruan atë që platforma bën sot. Kur platforma ndryshon, ky model
> ndryshon në të njëjtin pull request.

## Palët

- **Kontrolluesi:** [emri i institucionit], [adresa], [NIPT ose numri i regjistrimit], përfaqësuar
  nga [emri, detyra] ("Institucioni").
- **Përpunuesi:** [emri i operatorit], [adresa], [NIPT], operatori i Lab Platform ("Operatori").

## 1. Qëllimi dhe ligji

1.1. Institucioni përdor Lab Platform për të dhënë lëndë programimi dhe algoritmesh. Në këtë
kuadër Operatori përpunon të dhëna personale në emër të Institucionit. Kjo marrëveshje përcakton
kushtet e këtij përpunimi, siç kërkon neni 26 i ligjit nr. 124/2024 "Për mbrojtjen e të dhënave
personale" ("Ligji").

1.2. Termat si të dhëna personale, përpunim, kontrollues, përpunues, nënpërpunues dhe cenim i
sigurisë së të dhënave personale kanë kuptimin e nenit 5 të Ligjit.

1.3. Shtojca 1 përshkruan përpunimin: objektin, natyrën, qëllimet, llojet e të dhënave personale
dhe kategoritë e subjekteve të të dhënave. Përpunimi zgjat sa marrëveshja e shërbimit, plus afati
i kthimit dhe fshirjes në pikën 10.

## 2. Udhëzimet e Institucionit

2.1. Operatori i përpunon të dhënat personale vetëm sipas udhëzimeve të dokumentuara të
Institucionit, edhe për transferimet, përveç kur e kërkon ndryshe ligji të cilit i nënshtrohet
Operatori. Në atë rast Operatori e njofton Institucionin para përpunimit, përveç kur ai ligj e
ndalon (neni 26, pika 3, shkronja "a").

2.2. Udhëzimet janë kjo marrëveshje dhe zgjedhjet që Institucioni bën në platformë: cilat llogari
ekzistojnë, kush ka cilin rol në cilin kurs ose grup, cilët laboratorë janë të hapur dhe nëse
veçoritë e AI-së janë të ndezura për çdo kurs. Çdo zgjedhje e tillë është udhëzim.

2.3. Operatori e njofton menjëherë Institucionin nëse, sipas tij, një udhëzim shkel Ligjin
(neni 26, pika 3, shkronja "f").

2.4. Operatori nuk i përdor të dhënat personale për qëllimet e veta. Nuk i shet, nuk i ndan, nuk
profilizon përdoruesit për reklama dhe nuk trajnon modele AI me to.

## 3. Konfidencialiteti

3.1. Qasje kanë vetëm personat që u duhet për shërbimin, mbështetjen ose kopjet rezervë. Ata janë
të detyruar për konfidencialitet sipas nenit 30 të Ligjit ose me kontratë (neni 26, pika 3,
shkronja "b").

3.2. Sot ky është vetëm pronari i Operatorit. Kushdo tjetër që merr qasje i bëhet i ditur
Institucionit më parë.

## 4. Siguria

4.1. Operatori merr masat teknike dhe organizative të Shtojcës 2, siç kërkon neni 28 i Ligjit
(neni 26, pika 3, shkronja "c").

4.2. Operatori mund t'i përmirësojë këto masa, por kurrë të ulë mbrojtjen që japin.

## 5. Nënpërpunuesit

5.1. Institucioni jep autorizim të përgjithshëm me shkrim për nënpërpunuesit e Shtojcës 3
(neni 26, pika 2).

5.2. Operatori e njofton Institucionin të paktën 30 ditë para se të shtojë ose zëvendësojë një
nënpërpunues. Brenda këtij afati Institucioni mund të kundërshtojë me arsye të bazuara në mbrojtjen
e të dhënave. Nëse palët nuk e zgjidhin kundërshtimin, Institucioni mund ta përfundojë marrëveshjen
e shërbimit pa penalitet dhe zbatohet pika 10.

5.3. Çdo nënpërpunues detyrohet me kontratë për të njëjtat detyrime të mbrojtjes së të dhënave.
Operatori mbetet plotësisht përgjegjës ndaj Institucionit për nënpërpunuesit e vet (neni 26,
pika 4).

## 6. Ku ndodhen të dhënat dhe transferimet

6.1. **Ruhen në BE.** Baza e të dhënave dhe seancat Live Lab përdorin juridiksionin e BE-së të
Cloudflare, ndaj ruhen dhe përpunohen vetëm në qendra të dhënash në Bashkimin Evropian. Vendimi nr.
1, datë 30.4.2025, i Komisionerit i rendit shtetet anëtare të BE-së si vende me nivel të
mjaftueshëm mbrojtjeje (neni 40).

6.2. **Kërkesat.** Kërkesat drejt platformës kalojnë, sa kohë shërbehen, nëpër qendrën e të
dhënave të Cloudflare më të afërt me përdoruesin. Të dhënat ruhen vetëm siç thuhet në pikën 6.1.

6.3. **AI.** Kur AI-ja është e ndezur për një kurs, teksti i një kërkese AI (kodi i studentit,
gabimi dhe teksti i laboratorit, ose pyetja e një anëtari të stafit) shkon te Cloudflare Workers
AI. Cloudflare nuk ofron kufizim në BE për Workers AI, ndaj kërkesa mund të përpunohet jashtë
BE-së. Cloudflare, Inc. është e certifikuar sipas Kuadrit të Privatësisë së të Dhënave BE–SHBA, dhe
Vendimi nr. 1 i rendit Shtetet e Bashkuara si të mjaftueshme për shoqëritë në këtë kuadër. Një
kërkesë AI nuk përmban kurrë emër, emër përdoruesi ose adresë email-i. AI-ja është e fikur derisa
stafi ta ndezë për një kurs.

6.4. **Kopjet rezervë.** Kopja rezervë javore enkriptohet me çelësin e Operatorit para se të dalë
nga Cloudflare. Ruhet te GitHub, Inc. (Shtetet e Bashkuara) për 90 ditë, dhe GitHub mban vetëm
skedarin e enkriptuar.

6.5. Operatori nuk bën asnjë transferim tjetër jashtë Shqipërisë dhe BE-së pa udhëzim me shkrim të
Institucionit dhe pa garancitë e neneve 39–41 të Ligjit.

## 7. Të drejtat e subjekteve të të dhënave

7.1. Operatori e ndihmon Institucionin t'u përgjigjet kërkesave të subjekteve sipas kreut II të
Ligjit (neni 26, pika 3, shkronja "d"). Platforma ofron këto mjete:

- **Qasja dhe transferueshmëria** (nenet 14 dhe 18): çdo përdorues shkarkon të gjitha të dhënat
  që ruhen për të si skedar JSON, te "Të dhënat e mia".
- **Korrigjimi** (neni 15): stafi korrigjon emrat dhe rolet; Operatori korrigjon çdo gjë tjetër me
  kërkesë të Institucionit.
- **Fshirja** (nenet 15 dhe 16): përdoruesi dërgon një kërkesë për fshirje, të cilën e shohin
  administratorët e Institucionit. Një administrator fshin të dhënat e personit në Institucion,
  pasi të ketë shkarkuar notat e publikuara që Institucioni duhet të mbajë. Të dhënat e personit
  në institucione të tjera nuk preken. Llogaria fshihet kur nuk i përket asnjë institucioni
  tjetër.
- **Informimi** (neni 13): faqja publike e privatësisë së platformës, te e cila Institucioni mund
  t'i drejtojë studentët.

7.2. Një kërkesë që i vjen drejtpërdrejt Operatorit i kalohet Institucionit brenda 5 ditëve pune.
Operatori nuk i përgjigjet vetë.

## 8. Cenimi i sigurisë së të dhënave personale

8.1. Operatori e njofton Institucionin për një cenim menjëherë pasi merr dijeni, dhe në çdo rast
brenda 24 orëve (neni 29, pika 2). Kështu Institucioni mund të njoftojë Komisionerin brenda 72
orëve të nenit 29, pika 1.

8.2. Njoftimi jep atë që kërkon neni 29, pika 4, për aq sa dihet, dhe pjesën tjetër sa më shpejt:
- natyrën e cenimit;
- kategoritë dhe numrin e përafërt të personave dhe të regjistrimeve të prekura;
- një pikë kontakti;
- pasojat e mundshme;
- masat e marra ose të propozuara.

8.3. Operatori dokumenton çdo cenim dhe e ndihmon Institucionin të informojë subjektet kur e
kërkon neni 29, pika 3.

## 9. Ndihmë tjetër

Operatori e ndihmon Institucionin me detyrimet e kreut III të Ligjit, sipas informacionit që ka
(neni 26, pika 3, shkronja "e"). Kjo përfshin sigurinë, vlerësimin e ndikimit në mbrojtjen e të
dhënave (neni 31) dhe konsultimin paraprak (neni 32).

## 10. Përfundimi i shërbimit

10.1. Kur shërbimi përfundon, administratori i Institucionit shkarkon të dhënat e Institucionit nga
platforma (Shtojca 1, pika 5). Operatori jep ndihmë të arsyeshme për këtë.

10.2. Brenda 30 ditëve pas përfundimit, Operatori fshin të dhënat e Institucionit nga platforma,
përveç kur ligji kërkon ruajtjen e tyre (neni 26, pika 3, shkronja "ë"). Kopjet në kopjet rezervë
zhduken kur u mbaron afati, brenda 90 ditëve. Operatori e konfirmon fshirjen me shkrim.

## 11. Ruajtja

11.1. Gjatë shërbimit platforma i mban të dhënat për afatet e Shtojcës 4. Një punë e përnatshme
fshin vetë atë që ka kaluar afatin.

11.2. Institucioni vendos sa kohë mbahen kurset dhe puna e studentëve në to, duke fshirë kurset.

## 12. Informacioni dhe auditimet

12.1. Operatori i jep Institucionit informacionin që i duhet për të treguar përputhjen me këtë
marrëveshje (neni 26, pika 3, shkronja "f"). Kjo përfshin këtë dokument, shtojcat e tij dhe
përgjigjet ndaj pyetjeve të arsyeshme me shkrim.

12.2. Operatori lejon auditime nga Institucioni ose nga një auditues i caktuar prej tij, me
njoftim të paktën 30 ditë përpara, jo më shumë se një herë në vit, përveç kur e kërkon një cenim
ose Komisioneri. Secila palë mban kostot e veta.

## 13. Detyrimet e Institucionit

Institucioni:
- ka bazë ligjore për përpunimin (nenet 6 dhe 7 të Ligjit) dhe informon studentët e vet;
- krijon llogari dhe jep role vetëm për ata që u duhen;
- nuk vendos kategori të veçanta të dhënash (neni 9) në fletore, emra ose shënime;
- i bën të ditur Operatorit kush mund të japë udhëzime në emër të tij.

## 14. Përgjegjësia, kohëzgjatja dhe ligji

14.1. Përgjegjësia ndjek nenin 88 të Ligjit dhe marrëveshjen e shërbimit.

14.2. Kjo marrëveshje zgjat sa marrëveshja e shërbimit dhe, pas saj, derisa të përmbushet pika 10.

14.3. Ajo rregullohet nga ligji i Republikës së Shqipërisë. Mosmarrëveshjet i zgjidhin gjykatat e
Tiranës [ose siç parashikon marrëveshja e shërbimit].

[Vendi, data, nënshkrimet]

---

## Shtojca 1: Përpunimi

**1. Subjektet e të dhënave**
- studentët e Institucionit;
- stafi mësimor (pedagogët, asistentët, koordinatorët);
- administratorët e Institucionit.

**2. Të dhënat personale**

| Kategoria | Çfarë |
|---|---|
| Llogaria | Emri i plotë, emri i përdoruesit, email-i (jo i detyrueshëm), gjuha e zgjedhur e ndërfaqes. Fjalëkalimi ruhet vetëm si hash. |
| Rolet | Institucionet, kurset dhe grupet ku bën pjesë një person, dhe roli i tij. |
| Puna mësimore | Kodi që studenti ndryshon në fletore (e sheh vetëm ai derisa ta dorëzojë), ushtrimet e zgjidhura, puna e dorëzuar, notat dhe komentet. |
| Aktiviteti | Të shumtën një shënim për student, laborator, lloj dhe ditë: e hapi, e shkarkoi, provoi një vizualizim, zgjidhi një ushtrim, ekzekutoi kod, mori pjesë në një Live Lab. |
| Përgjigjet e para | Përgjigjja e parë e studentit te çdo vendim i një vizualizimi të përfshirë ose rresht i një tabele gjurmimi: nëse ishte e saktë, çfarë u përgjigj, pyetja dhe dita. Ushtrim, kurrë notë; stafi i sheh vetëm si numra, nga pesë studentë e lart. |
| AI | Pyetjet "Shpjego gabimin" (kodi, gabimi, përgjigjja); numri i kërkesave AI për person dhe ditë. |
| Live Lab | Gjatë mësimit: kush është i lidhur, kërkesat për ndihmë, reagimet, përgjigjet e pyetjeve dhe rezultatet e sfidave. |
| Anketat | Përgjigjet e fundit të semestrit, anonime: vlerësimet vetëm si numra, komentet pa autor dhe pa kohë. |
| Të drejtat | Kërkesat për fshirje dhe shënimet e tyre; një shënim për çdo fshirje pa identitetin e personit. |
| Teknike | Një seancë për çdo hyrje (hash-i i token-it, emri i shfletuesit, përdorimi i fundit); hyrjet e dështuara, të numëruara sipas emrit të përdoruesit dhe adresës së rrjetit për pak minuta. |

Nuk synohet përpunimi i kategorive të veçanta të të dhënave.

**3. Qëllimet**
- mësimdhënia dhe mësimi në kurset e Institucionit: laboratorët dhe fletoret që ekzekutohen në
  shfletues, dorëzimet dhe vlerësimi, Live Lab, udhëzimet e AI-së;
- raporte vetëm me numra për stafin e Institucionit;
- siguria e shërbimit;
- kopjet rezervë.

**4. Natyra e përpunimit**
- ruajtje, organizim, konsultim dhe fshirje, në një shërbim në internet;
- kodi i studentëve ekzekutohet në shfletuesit e tyre, jo në serverët e Operatorit.

**5. Eksporti i vetë Institucionit**

Administratori shkarkon në çdo kohë të dhënat e Institucionit si një skedar JSON. Ai përmban:
- njerëzit (pa hash-e fjalëkalimesh) dhe anëtarësimet;
- strukturën e kurseve;
- fletoret me skedarët origjinalë;
- ushtrimet, dorëzimet (me orët e nisjes së kolokiumeve) dhe notat;
- aktivitetin, përgjigjet e para, të dhënat e AI-së, historinë e Live Lab, anketat, kërkesat për fshirje dhe
  fshirjet.

Kodi i padorëzuar i studentëve mbetet privat për ta dhe nuk përfshihet.

## Shtojca 2: Masat teknike dhe organizative

- **Vendndodhja:** baza e të dhënave dhe seancat Live Lab përdorin juridiksionin e BE-së të
  Cloudflare (pika 6).
- **Transmetimi:** vetëm HTTPS.
- **Fjalëkalimet:** hash me PBKDF2-SHA256 dhe salt të rastësishëm. Fjalëkalimet e studentëve të
  importuar krijohen në shfletuesin e pedagogut dhe nuk ruhen kurrë si tekst i hapur.
- **Seancat:**
  - ruhet vetëm hash-i SHA-256 i token-it të seancës;
  - cookie-ja është `__Host-`, HttpOnly, Secure dhe SameSite=Lax;
  - seancat mbarojnë pas 30 ditësh pa përdorim.
- **Kufizimi i hamendësimeve:** hyrjet e dështuara kufizohen për emër përdoruesi dhe për adresë
  rrjeti.
- **Kontrolli i qasjes:**
  - aftësi sipas rolit, të kontrolluara nga serveri në çdo kërkesë, për kursin ose grupin përkatës;
  - studentët shohin vetëm punën e tyre;
  - stafi sheh vetëm grupet e veta.
- **Ndarja e institucioneve:** çdo pyetje në bazën e të dhënave kufizohet në një institucion. Këtë
  e zbatojnë çelësat e bazës së të dhënave dhe e provojnë testet automatike.
- **Siguria e përmbajtjes:**
  - skedarët e ngarkuar shërbehen me Content Security Policy që i izolon;
  - HTML-ja e fletoreve pastrohet para se të shfaqet;
  - kodi i studentëve ekzekutohet në shfletuesin e tyre, i izoluar nga serveri.
- **Të dhëna minimale:**
  - pa gjurmues të palëve të treta dhe pa reklama;
  - aktiviteti regjistrohet si numra;
  - kërkesat AI nuk mbajnë emra.
- **Ruajtja:** një punë e përnatshme fshin të dhënat që kanë kaluar afatet e Shtojcës 4.
- **Kopjet rezervë:**
  - rikthim në çdo moment të 7 ditëve të fundit (Cloudflare D1);
  - eksporte javore, të enkriptuara me çelësin e Operatorit (age) para se të dalin nga Cloudflare,
    që mbahen 90 ditë.
- **Kontrolli i ndryshimeve:**
  - çdo ndryshim kalon nga shqyrtimi dhe testet automatike (lejet, privatësia dhe ndarja e
    institucioneve) para se të publikohet;
  - ndryshimet e bazës së të dhënave vetëm shtojnë.

## Shtojca 3: Nënpërpunuesit

| Nënpërpunuesi | Vendndodhja | Çfarë bën | Çfarë merr | Garancia |
|---|---|---|---|---|
| Cloudflare, Inc. | Shtetet e Bashkuara; qendra të dhënash në gjithë botën | Strehimi: Workers (aplikacioni), D1 (baza e të dhënave, juridiksioni i BE-së), Durable Objects (Live Lab, juridiksioni i BE-së), Workers AI (veçoritë e AI-së) | Të gjitha të dhënat e platformës, të ruajtura në BE; tekstin e kërkesave AI pa emra | Cloudflare Customer DPA; Kuadri i Privatësisë së të Dhënave BE–SHBA; Vendimi nr. 1/2025 |
| GitHub, Inc. | Shtetet e Bashkuara | Kodi burimor, testet automatike, kopjet rezervë javore | Vetëm kopjet rezervë të enkriptuara, që nuk mund t'i lexojë | Enkriptimi me çelësin e Operatorit; Kuadri i Privatësisë së të Dhënave [të konfirmohet certifikimi aktual] |

## Shtojca 4: Afatet e ruajtjes

Të njëjtat afate si `src/shared/retention.ts`, që përdorin puna e përnatshme dhe faqja e
privatësisë:

| Të dhënat | Mbahen |
|---|---|
| Hyrja (seanca) | 30 ditë pa përdorim |
| Pyetjet "Shpjego gabimin" me përgjigjet | 180 ditë |
| Aktiviteti ditor, përgjigjet e para, numërimet e AI-së, shënimet e Live Lab | 2 vjet |
| Një kërkesë për fshirje e trajtuar | 1 vit pasi u trajtua |
| Numëruesit e hyrjeve të dështuara | pak minuta |
| Kodi i studentëve, dorëzimet, notat, anketat, pjesa tjetër | sa kohë ekziston kursi; Institucioni fshin kurset |
| Kopjet rezervë | 90 ditë |
