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
    howTitle: "Hvernig get ég sannreynt það?",
    howBody:
      "Opnaðu þróunartól vafrans (F12 eða „Skoða“ → „Þróunartól“), veldu Network-flipann og endurhlaðdu síðunni. Það eina sem síðan sendir frá sér er nafnlaus heimsóknartalning (Umami, umami.snjall.is) — engar vafrakökur og engin persónugreinanleg gögn. Launin þín og útreikningarnir fara aldrei neitt, hvorki til okkar né annarra, og vísitölugögnin fylgja síðunni sjálfri.",
    inline: "🔒 Reiknað í tækinu þínu — launin þín fara hvergi.",
  },

  payoff: {
    // (amount) e.g. "88.000 kr." → headline
    title: (amount: string) =>
      `Verðbólgan tók ${amount} af laununum þínum á mánuði`,
    // shown when the salary kept up / is too new
    held: "Launin þín hafa haldið í við verðbólguna — eða eru of ný til að hún hafi bitið.",
    cta: "Prófa með mínum launum",
    pickLabel: "Berðu tapið saman við:",
  },

  lenses: {
    chips: {
      raise: "📈 Launahækkun",
      rent: "🏠 Leiga",
      food: "🛒 Matur",
      life: "✈️ Lífsgæði",
    },
    basisExact: "nákvæmt",
    basisApprox: "um það bil",
    // pct e.g. "12,4%", days e.g. "2,5"
    raise: (pct: string, days: string) =>
      `Þú þyrftir ${pct} launahækkun bara til að standa í stað — eða að vinna ${days} daga til viðbótar í hverjum mánuði.`,
    // pct e.g. "48%"
    rent: (pct: string) =>
      `Það er um ${pct} af mánaðarleigu á 3ja herbergja íbúð á höfuðborgarsvæðinu.`,
    // weeks e.g. "3,8"
    food: (weeks: string) =>
      `Það jafngildir um ${weeks} vikum af mat fyrir fjögurra manna fjölskyldu á mánuði.`,
    // annual e.g. "1.920.000 kr.", trips e.g. "6,4"
    life: (annual: string, trips: string) =>
      `Á ári eru þetta ${annual} — eins og ${trips} utanlandsferðir fyrir tvo (dæmi).`,
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
    anchorNote: (month: string) =>
      `Raunvirðið er sýnt á verðlagi ${month}, þegar fyrstu launin voru sett — þannig sést hvort hækkanir halda í raun og veru í við verðbólguna.`,
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
      "Þessi síða geymir engar persónuupplýsingar. Launin þín verða eftir í vafranum þínum — þar sem þau eiga heima. Við teljum aðeins nafnlausar heimsóknir.",
    noscript: "Þessi reiknivél þarf JavaScript — einmitt vegna þess að allt er reiknað í vafranum þínum og launin þín eru aldrei send neitt.",
  },
} as const;
