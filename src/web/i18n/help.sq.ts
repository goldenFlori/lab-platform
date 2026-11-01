// The guides in the app (#194), for students and pedagogs who were not there when the platform was
// built. Albanian is the source; help.en.ts is typed against it. Their own module, loaded only by the
// help pages, so the app's bundle stays small. **Bold** marks a button or a name on screen, written
// exactly as it shows there.

/** Screenshots of the real app, made by `npm run help:screenshots` into public/help/<locale>/. */
export const SHOTS = [
  'course-student',
  'lab-student',
  'run-output',
  'submission-bar',
  'progress',
  'ready',
  'course-staff',
  'import',
  'lab-staff',
  'submissions',
] as const;
export type Shot = (typeof SHOTS)[number];

export type HelpStep = { text: string; shot?: Shot };
export type Guide = {
  id: string;
  audience: 'student' | 'staff';
  title: string;
  summary: string;
  steps: HelpStep[];
};

export const help = {
  pageTitle: 'Ndihmë',
  title: 'Ndihmë',
  lead: 'Udhëzues të shkurtër për çdo gjë që bëhet në platformë, me pamje nga vetë faqet.',
  students: 'Për studentët',
  staff: 'Për pedagogët dhe asistentët',
  back: 'Të gjithë udhëzuesit',
  steps: (n: number) => `${n} hapa`,
  shotAlt: (step: number) => `Pamje e hapit ${step}`,
  missing: 'Ky udhëzues nuk ekziston.',
  open: 'Ndihmë',
  openGuide: (title: string) => `Ndihmë: ${title}`,
  guides: [
    {
      id: 'first-lab',
      audience: 'student',
      title: 'Laboratori i parë',
      summary: 'Hyrja, kursi dhe leximi i një laboratori.',
      steps: [
        {
          text: 'Hyni me **emrin e përdoruesit** dhe **fjalëkalimin** nga fleta që ju dha pedagogu. Nëse ju jep një kod regjistrimi ose kod QR, hapeni dhe shtypni **Bashkohu**.',
        },
        {
          text: 'Te **Kurset e mia** hapni kursin. **Rruga juaj** tregon laboratorët e hapur, me ngjyrë sipas asaj që keni bërë: i panisur, i nisur, i dorëzuar, me notë.',
          shot: 'course-student',
        },
        {
          text: 'Hapni një laborator dhe lexojeni nga lart poshtë: teksti, kodi dhe rezultatet e tij, si në orë. Vizualizimet janë aty ku i vendosi pedagogu.',
          shot: 'lab-student',
        },
        {
          text: 'Para orës së parë, në shtëpi, shtypni **Përgatitni pajisjen për Python** te kursi, që Python të shkarkohet një herë (shihni udhëzuesin "Përgatitni pajisjen").',
        },
      ],
    },
    {
      id: 'run-code',
      audience: 'student',
      title: 'Ekzekutoni dhe ndryshoni kodin',
      summary: 'Python në shfletues, kodi juaj, gabimet dhe kontrollet e ushtrimeve.',
      steps: [
        {
          text: 'Shtypni **Ekzekuto** te një qelizë kodi. Rezultati shfaqet poshtë saj. Qelizat e një fletoreje ndajnë të njëjtat ndryshore, si në Jupyter: ekzekutojini me radhë.',
          shot: 'run-output',
        },
        {
          text: 'Shtypni **Ndrysho kodin** dhe shkruani. Kodi juaj ruhet vetë në llogari dhe e gjeni në çdo pajisje; **Rikthe kodin origjinal** e kthen qelizën siç ishte.',
        },
        {
          text: 'Kur kodi ndalet me gabim, rreshti shënohet me të kuqe. Nëse pedagogu e ka ndezur AI-në, **Shpjego gabimin** jep një udhëzim në shqip, jo zgjidhjen.',
        },
        {
          text: 'Te një ushtrim, kontrolli shfaqet sapo ekzekutohet qeliza: ✓, ose ✗ me rastin që dështoi.',
        },
        { text: 'Kodi që nuk mbaron ndalet me **Ndalo**.' },
      ],
    },
    {
      id: 'visualizations',
      audience: 'student',
      title: 'Vizualizimet dhe tabelat e gjurmimit',
      summary: 'Si ecet hap pas hapi, si parashikohet dhe si plotësohet një tabelë.',
      steps: [
        {
          text: 'Ecni me shigjetat ← dhe → ose me butonat e vizualizimit; hapësira e luan vetë.',
        },
        {
          text: 'Ndizni **Parashiko**: vizualizimi ndalet te çdo vendim i algoritmit dhe ju pyet para se ta tregojë. Është ushtrim, jo notë.',
        },
        {
          text: 'Te një tabelë gjurmimi plotësoni çdo rresht si në letër (∞, A-C, po, ∅) dhe kontrollojeni. Një qelizë e gabuar tregon rregullin që prish, jo vlerën.',
        },
        {
          text: 'Një tabelë me notë nuk kontrollohet gjatë punës: rreshtat ruhen dhe vlerësohen kur dorëzoni fletoren.',
        },
      ],
    },
    {
      id: 'hand-in',
      audience: 'student',
      title: 'Dorëzimi dhe kolokiumi',
      summary: 'Afati, dorëzimi, kolokiumi me kohë dhe notat.',
      steps: [
        {
          text: 'Kur fletorja është hapur për dorëzim, sipër saj shfaqet afati. **Dorëzo punën** dërgon kodin siç është ruajtur, ushtrimet dhe tabelat; deri në afat mund ta dorëzoni sërish.',
          shot: 'submission-bar',
        },
        {
          text: 'Një kolokium ka orën tuaj: e nisni me **Nis kolokiumin** kur të doni para afatit, dhe nga ai çast keni minutat e caktuara. Fletorja hapet vetëm pasi ta nisni.',
        },
        {
          text: 'Kolokiumi dorëzohet një herë. Gjatë tij shihni vetëm atë laborator dhe ndihma e AI është e fikur.',
        },
        {
          text: 'Nëse bie interneti, puna mbetet në pajisje dhe ruhet vetë kur kthehet. Mbajeni faqen hapur: dorëzimi provohet sërish vetë.',
        },
        {
          text: 'Kur pedagogu publikon notat, nota dhe komenti shfaqen sipër fletores dhe te **Progresi im**.',
        },
      ],
    },
    {
      id: 'progress',
      audience: 'student',
      title: 'Progresi im dhe përsëritja',
      summary: 'Çfarë keni bërë, si e kuptoni dhe çfarë të përsërisni.',
      steps: [
        {
          text: '**Progresi im** (te kursi) tregon laboratorët e hapur, ushtrimet e zgjidhura, afatet dhe notat. Vetëm ju e shihni.',
          shot: 'progress',
        },
        {
          text: '**Kuptimi im** tregon sa e gjetët në provën e parë hapat e algoritmeve, sipas temës, dhe çfarë t’ia vlen të përsërisni.',
        },
        {
          text: '**Përsërit** jep deri në tetë pyetje të shkurtra mbi algoritmet e laboratorëve që keni hapur, më shpesh ato ku gaboni.',
        },
      ],
    },
    {
      id: 'get-ready',
      audience: 'student',
      title: 'Përgatitni pajisjen',
      summary: 'Python dhe libraritë, të shkarkuara një herë para orës së parë.',
      steps: [
        {
          text: 'Para orës së parë, në shtëpi ose me Wi-Fi të shpejtë, hapni **Përgatitni pajisjen për Python** te kursi, ose lidhjen që ju dha pedagogu.',
        },
        {
          text: 'Shtypni **Përgatit pajisjen**: Python dhe libraritë e kursit shkarkohen një herë (rreth 31 MB) dhe mbahen në pajisje.',
          shot: 'ready',
        },
        {
          text: 'Kur shfaqet **Gati!**, laboratorët ekzekutohen menjëherë edhe në klasë, pa shkarkuar asgjë.',
        },
        {
          text: 'Nëse thotë që ky shfletues nuk mundet, përdorni versionin e fundit të Chrome, Edge, Firefox ose Safari.',
        },
      ],
    },
    {
      id: 'course',
      audience: 'staff',
      title: 'Kursi dhe grupet',
      summary: 'Kursi i vitit, grupet me kodet e regjistrimit dhe stafi.',
      steps: [
        {
          text: 'Te **Kurset e mia** shtypni **Kurs i ri**. Me **Kopjo laboratorët nga** merrni laboratorët e vitit të kaluar.',
        },
        {
          text: 'Shtoni grupet. Çdo grup ka një **Kod regjistrimi**: **Shfaq në ekran** e tregon me kod QR për projektorin, **Kod i ri** e zëvendëson.',
          shot: 'course-staff',
        },
        {
          text: 'Kursi ka gjuhën e vet për studentët që s’kanë zgjedhur një, dhe ju vendosni nëse ndizet AI.',
        },
        {
          text: 'Te **Stafi i kursit** shtoni pedagogë dhe asistentë, për gjithë kursin ose për një grup.',
        },
        {
          text: 'Te **Ndaje me institucione të tjera** krijoni një lidhje që stafi i një institucioni tjetër e përdor për ta kopjuar kursin si të vetin, me zgjidhjet vetëm nëse i përfshini. Studentët dhe puna e tyre nuk shkojnë kurrë, dhe ju shihni kush e ka kopjuar.',
        },
        {
          text: 'Para orës së parë ndani me studentët lidhjen te **Para orës së parë**, që pajisjet të përgatiten në shtëpi.',
        },
      ],
    },
    {
      id: 'students',
      audience: 'staff',
      title: 'Studentët dhe fletët e hyrjes',
      summary: 'Llogaritë e një grupi, fletët për printim dhe fjalëkalimet e harruara.',
      steps: [
        {
          text: 'Hapni grupin dhe **Importo studentë**: ngjitni listën e emrave, ose ngarkoni një skedar CSV ose Excel.',
          shot: 'import',
        },
        {
          text: 'Kontrolloni emrat. Fjalëkalimet krijohen në shfletuesin tuaj; serveri merr vetëm hash-et e tyre.',
        },
        {
          text: '**Printo fletët**: dhjetë në një faqe A4, me emrin e përdoruesit dhe fjalëkalimin. Fjalëkalimet nuk ruhen askund tjetër, ndaj printojini para se të dilni nga faqja.',
        },
        {
          text: 'Për një fjalëkalim të harruar: **Fjalëkalim i ri** te studenti, dhe printoni fletën e tij.',
        },
      ],
    },
    {
      id: 'labs',
      audience: 'staff',
      title: 'Laboratorët dhe fletoret',
      summary: 'Hapja e laboratorëve, fletoret, vizualizimet dhe prezantimi.',
      steps: [
        {
          text: 'Te kursi, **Hapur** e hap një laborator për të gjithë. **Orari** cakton kur hapet dhe mbyllet dhe datën e zgjidhjeve, për kursin ose për një grup.',
        },
        {
          text: 'Te laboratori, menyja **Më shumë veprime me fletoret** ka **Ngarko fletore**: kryesore, material shtesë ose zgjidhje. Zgjidhja u shfaqet studentëve vetëm pas datës së zgjidhjeve.',
          shot: 'lab-staff',
        },
        {
          text: 'Te **Vizualizimet në këtë fletore** zgjidhni ku shfaqet secili. Një tabelë gjurmimi mund të ketë problemin tuaj, një variant për çdo student, dhe pikë.',
        },
        {
          text: 'Te **Ushtrimet në këtë fletore** shihni ushtrimet që u gjetën vetë dhe shtoni të tjera me një test të dukshëm.',
        },
        {
          text: '**Prezanto** e hap fletoren në ekran të plotë, hap pas hapi, me kodin që e ekzekutoni para klasës.',
        },
      ],
    },
    {
      id: 'live',
      audience: 'staff',
      title: 'Live Lab',
      summary: 'Ora live: ndjekja, sfidat, kërkesat për ndihmë dhe pyetjet e shpejta.',
      steps: [
        {
          text: 'Te laboratori shtypni **Fillo Live Lab**. Studentët bashkohen nga banderola ose duke skanuar **Kodi QR**.',
        },
        {
          text: 'Studentët ndjekin hapin që prezantoni; me **Puno vetë** punojnë vetë dhe me **Ndiq pedagogun** kthehen.',
        },
        {
          text: '**Fillo sfidën** te një ushtrim: tabela tregon kush e zgjidhi, kush jo, dhe gabimin më të shpeshtë. Emrat shfaqen vetëm me **Shfaq emrat**.',
        },
        {
          text: 'Kush shtyp **Jam bllokuar** del në radhë: e merrni me **E marr** dhe e mbyllni me **U zgjidh**. Një **Pyetje e shpejtë për klasën** tregon përgjigjet ndërkohë që vijnë.',
        },
        { text: '**Mbyll sesionin** kur mbaron ora.' },
      ],
    },
    {
      id: 'grading',
      audience: 'staff',
      title: 'Dorëzimi dhe vlerësimi',
      summary: 'Afatet, dorëzimet, vlerësimi në kompjuterin tuaj dhe notat.',
      steps: [
        {
          text: 'Te **Dorëzimi i kësaj fletoreje** (te laboratori) hapeni fletoren për çdo grup me një afat.',
        },
        {
          text: '**Shiko dorëzimet** tregon kush dorëzoi dhe kodin e secilit. Caktoni pikët e ushtrimeve dhe, nëse doni, teste të fshehura.',
          shot: 'submissions',
        },
        {
          text: 'Shtypni **Vlerëso** për grupin: çdo dorëzim ekzekutohet në kompjuterin tuaj, dhe serveri vlerëson tabelat e gjurmimit.',
        },
        {
          text: 'Ndryshoni një notë ose shtoni koment, pastaj **Publiko notat**. **Shkarko notat (CSV)** i jep për regjistrin.',
        },
      ],
    },
    {
      id: 'kolokium',
      audience: 'staff',
      title: 'Kolokiumi',
      summary: 'Një vlerësim me kohë, një herë, për çdo student në orën e tij.',
      steps: [
        {
          text: 'Te **Dorëzimi i kësaj fletoreje** ndizni **Kolokium me kohë** për grupin: nga kur lejohet nisja dhe sa minuta.',
        },
        {
          text: 'Çdo student e nis kur të dojë deri në afat dhe ka minutat e tij, jo më shumë se afati; e dorëzon një herë. Gjatë kolokiumit studentët e grupit shohin vetëm këtë laborator dhe AI është i fikur.',
        },
        {
          text: 'Te **Shiko dorëzimet** shihni kush s’e ka nisur, kush po punon dhe deri kur, dhe kush e dorëzoi. Faqja rifreskohet vetë.',
        },
        {
          text: 'Pas vlerësimit, **Raporti i vlerësimit** tregon sa e gjetën studentët çdo ushtrim dhe çdo rresht tabele, dhe gabimin më të shpeshtë. Vetëm numra.',
        },
      ],
    },
    {
      id: 'reports',
      audience: 'staff',
      title: 'Raportet',
      summary: 'Aktiviteti, kuptimi, raporti i pilotit dhe notat e kursit.',
      steps: [
        {
          text: '**Aktiviteti** (te kursi): studentët aktivë javë pas jave, dhe për çdo laborator hapjet, shkarkimet, ekzekutimet dhe ushtrimet. Vetëm numra, kurrë emra.',
        },
        {
          text: 'Pjesa e kuptimit tregon sa e gjetën studentët në provën e parë hapat e algoritmeve, nga pesë studentë e lart.',
        },
        {
          text: '**Raporti i pilotit** përmbledh një periudhë në dy faqe për printim, me anketën e fundit të semestrit.',
        },
        {
          text: '**Notat (CSV)** te kursi shkarkon notat e publikuara të të gjitha fletoreve, për regjistrin e institucionit.',
        },
      ],
    },
  ] satisfies Guide[] as Guide[],
};

export type HelpText = typeof help;
