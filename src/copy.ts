/**
 * Every user-facing string lives here, in Icelandic. Components never
 * hard-code text, so a second locale can be added without touching them.
 */
import type { PresetKind } from "./lib/profiles";

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
    inline: "Reiknað í tækinu þínu — launin þín fara hvergi.",
  },

  payoff: {
    // (declinePct, monthlyLoss, peakMonth)
    peakTitle: (declinePct: string, loss: string, peakMonth: string) =>
      `Kaupmáttur þinn náði hámarki í ${peakMonth}. Síðan hefur hann rýrnað um ${declinePct} — eða ${loss} á mánuði.`,
    // (verb, pct, firstMonth)
    lifetime: (verb: string, pct: string, firstMonth: string) =>
      `Frá ${firstMonth} hefur kaupmátturinn samt ${verb} um ${pct}.`,
    verbUp: "aukist",
    verbDown: "rýrnað",
    atPeak: "Kaupmáttur þinn hefur aldrei verið hærri.",
    cta: "Prófa með mínum launum",
    pickLabel: "Berðu tapið saman við:",
  },

  profiles: {
    yourProfiles: "Þín snið",
    presetsGroup: "Almenn snið",
    newProfile: "Nýtt snið",
    importFile: "Flytja inn skrá…",
    rename: "Endurnefna",
    exportFile: "Flytja út (skrá)",
    duplicate: "Afrita",
    delete: "Eyða",
    deleteConfirm: (name: string) => `Eyða sniðinu „${name}"? Þessu er ekki hægt að afturkalla.`,
    presetLockedBanner: (source: string) => `Almennt snið (læst) · heimild: ${source}`,
    forkCta: "Afrita og breyta",
    renameTitle: "Endurnefna snið",
    save: "Vista",
    cancel: "Hætta við",
    emptyState: "Skráðu fyrstu launin þín hér að neðan til að sjá kaupmáttinn.",
    importError: "Gat ekki lesið skrána.",
    importErrors: {
      notJson: "Skráin er ekki gild JSON-skrá.",
      notObject: "Skráin er ekki gild.",
      wrongFormat: "Þetta er ekki gilt sniðsskjal.",
      noEntries: "Engar gildar færslur fundust í skránni.",
      tooManyEntries: "Of margar færslur í skránni.",
    } as Record<string, string>,
    limitReached: "Hámarksfjölda sniða náð.",
    fileTooLarge: "Skráin er of stór.",
    switchLabel: "Veldu snið",
    presetKinds: {
      minimum: {
        badge: "lágmark",
        banner: "Lágmarkstekjur fyrir fullt starf — kjarasamningsbundið lágmark.",
      },
      taxi: {
        badge: "grunntaxti",
        banner:
          "Grunntaxti kjarasamnings — raunveruleg laun eru oft hærri (vaktaálag, yfirvinna).",
      },
      survey: {
        badge: "miðgildi",
        banner:
          "Miðgildi raunverulegra heildarlauna úr launarannsókn — ekki taxti; helmingur er yfir og helmingur undir.",
      },
    } as Record<PresetKind, { badge: string; banner: string }>,
  },

  lenses: {
    chips: {
      raise: "Launahækkun",
      rent: "Leiga",
      food: "Matur",
      life: "Lífsgæði",
    },
    basisExact: "nákvæmt",
    basisApprox: "um það bil",
    // pct e.g. "12,4%", days e.g. "2,5"
    raise: (pct: string, days: string) =>
      `Þú þyrftir ${pct} launahækkun til að ná fyrri kaupmætti — eða að vinna ${days} daga til viðbótar í hverjum mánuði.`,
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


  ai: {
    button: "Fylla út með AI",
    describeTitle: "Lýstu launasögunni þinni",
    placeholder:
      "t.d. Byrjaði á 650þ í jan 2020, hækkaði í 720þ 2022, og er á 800þ í dag. (íslensku eða ensku)",
    privacy: "Allt keyrt í tækinu þínu — ekkert sent neitt.",
    analyze: "Greina",
    cancel: "Hætta við",
    micStart: "Tala inn",
    micStop: "Stöðva upptöku",
    langLabel: "Tungumál talgreiningar",
    downloadTitle: "Sæki AI-líkan…",
    downloadBody: "Þarf að sækja AI líkanið (~nokkur GB). Geymist svo í tækinu.",
    previewTitle: "AI las úr textanum:",
    replaceNote: "Þetta kemur í stað núverandi færslna í töflunni.",
    dropped: (n: number) =>
      n === 1
        ? "Einni færslu var sleppt (utan gildissviðs)."
        : `${n} færslum var sleppt (utan gildissviðs).`,
    refinePlaceholder: "Lagfæra… t.d. „hækkunin 2022 var 730þ“",
    refineSend: "Senda lagfæringu",
    apply: "Setja í töfluna",
    errorNoParse:
      "Náði ekki að lesa úr textanum — prófaðu að orða það öðruvísi eða sláðu inn handvirkt.",
    errorGeneric: "Eitthvað fór úrskeiðis. Þú getur slegið inn handvirkt.",
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
    compareToday: "Virði í dag",
    compareOrigin: "Raunvirði (á verðlagi þá)",
    compareKeepPace: "Til að halda kaupmætti",
    tooltipGain: "Umfram",
    noteToday:
      "Græna línan sýnir hvað eldri laun væru virði í dag — hæsti punktur er kaupmáttar-hámarkið þitt.",
    noteKeepPace: (month: string) =>
      `Græna línan sýnir launin sem þyrfti hverju sinni til að halda kaupmætti frá ${month}.`,
    frameToday: "Á verðlagi í dag",
    frameOrigin: "Á verðlagi þá",
    frameKeepPace: "Hélt í við verðbólgu?",
    peakLabel: (month: string) => `hámark · ${month}`,
    framePickLabel: "Sýn:",
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
