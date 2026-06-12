/**
 * Every user-facing string lives here, in Icelandic. Components never
 * hard-code text, so a second locale can be added without touching them.
 */
export const copy = {
  hero: {
    kicker: "Kaupmáttur launa",
    title: "Hvað eru launin þín raunverulega virði?",
    titleAccent: "raunverulega",
    lead: "Verðbólgan vinnur hljóðlega. Sláðu inn launin þín og sjáðu, mánuð fyrir mánuð, hvað þau kaupa í raun og veru í dag.",
  },

  privacy: {
    badge: "Gögnin þín fara aldrei úr vafranum",
    detail: "Engin netumferð, engar vafrakökur, engin greining — allt er reiknað í tækinu þínu.",
    howTitle: "Hvernig get ég sannreynt það?",
    howBody:
      "Opnaðu þróunartól vafrans (F12 eða „Skoða“ → „Þróunartól“), veldu Network-flipann og endurhlaðdu síðunni. Þú sérð að síðan sækir aðeins sínar eigin skrár — launin þín eru aldrei send neitt, hvorki til okkar né annarra. Vísitölugögnin fylgja síðunni sjálfri.",
  },

  form: {
    title: "Launin þín",
    intro: "Skráðu launin þín og hvenær þau voru sett — og bættu við hækkunum eftir því sem þær komu.",
    monthLabel: "Mánuður",
    yearLabel: "Ár",
    amountLabel: "Mánaðarlaun",
    amountPlaceholder: "t.d. 800.000",
    amountSuffix: "kr. á mánuði",
    addButton: "Bæta við launahækkun",
    removeLabel: "Fjarlægja þessa færslu",
    errorAmount: "Þetta lítur ekki út eins og upphæð — prófaðu t.d. 800.000",
    errorAmountTooHigh: "Þessi upphæð er fyrir utan það sem við ráðum við",
    errorDuplicateMonth: "Þú ert nú þegar með breytingu í þessum mánuði",
    exampleTag: "Sýnidæmi",
    exampleCta: "Prófa með mínum launum",
    exampleNote: "Þetta er sýnidæmi — skiptu því út fyrir þín eigin laun.",
  },

  chart: {
    title: "Þróunin, mánuð fyrir mánuð",
    legendNominal: "Launin eins og þau eru greidd",
    legendReal: "Raunvirði launanna",
    legendLoss: "Tapaður kaupmáttur",
    today: "í dag",
    tooltipNominal: "Laun",
    tooltipReal: "Kaupmáttur",
    tooltipLoss: "Tap",
    raiseMarker: "Launabreyting",
  },

  summary: {
    title: "Staðan í dag",
    setIn: (month: string) => `Laun sett í ${month}`,
    realToday: "Kaupmáttur í dag",
    required: (amount: string) =>
      `Til að halda í við verðbólguna þyrftu launin að vera ${amount} í dag.`,
    tooNew: "Of nýtt til að verðbólgan hafi náð að bíta — fylgstu með.",
  },

  method: {
    title: "Hvernig er þetta reiknað?",
    p1: "Við notum vísitölu neysluverðs frá Hagstofu Íslands — sömu vísitölu og er notuð til verðtryggingar. Hún mælir hvað vörur og þjónusta kosta í hverjum mánuði og er áreiðanlegasti mælikvarðinn á það hvað krónan kaupir í raun.",
    p2: "Útreikningurinn er einfaldur: kaupmáttur launa sem voru sett í tilteknum mánuði er launin margfölduð með vísitölunni þá og deilt með vísitölunni nú. Ef vísitalan hefur hækkað um 7% frá því launin voru sett, kaupa þau um 7% minna í dag.",
    formula: "kaupmáttur = laun × vísitala þá ÷ vísitala nú",
    sourceLabel: "Heimild",
    source: "Vísitala neysluverðs, Hagstofa Íslands (tafla VIS01000, grunnur 1988=100)",
    dataThrough: (month: string) => `Gögn til og með ${month}`,
    updatedAt: (date: string) => `Gögn sótt ${date}`,
  },

  footer: {
    privacyReminder:
      "Þessi síða safnar engum upplýsingum. Launin þín verða eftir í vafranum þínum — þar sem þau eiga heima.",
    noscript: "Þessi reiknivél þarf JavaScript — einmitt vegna þess að allt er reiknað í vafranum þínum og ekkert sent annað.",
  },
} as const;
