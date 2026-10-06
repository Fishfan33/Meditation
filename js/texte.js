// Meditation – Sprüche je Phase in ihrer Standard-Reihenfolge (reine Daten, Vorschläge von Claude).
// Teil der App in js/: klassische Skripte, die sich einen gemeinsamen Gültigkeitsbereich teilen und in der
// Reihenfolge aus index.html geladen werden (Phasen zuerst, Start zuletzt). Übersicht: CLAUDE.md, „Aufbau“.
//
// Das ist der Grundbestand. Im Admin-Bereich (nur lokal) bearbeitet der Inhaber die Sprüche; seine Fassung steht dann in
// config.js und gilt statt dieser Liste. Die Stimme liest die aktiven Sprüche einer Phase in dieser Reihenfolge,
// danach wieder von vorn, solange die Zeit der Phase reicht.
// Je Phase eine Liste aus Sprüchen { id, text } und optionalen Gruppen { id, name, items: [Sprüche] } (Wahl B des Inhabers):
// Sprüche, die zusammengehören (z. B. ein Ort am Kraftort), stehen in einer Gruppe und bleiben dort immer in ihrer
// Reihenfolge. Kommt später der Zufall, mischt er nur die Gruppen (Wunsch des Inhabers; ihn dann ausdrücklich darauf hinweisen).
// Ton (Vorschlag, mit dem Inhaber abstimmen): ruhig und bestimmt. Anleitungen mit „du“, Affirmationen mit „ich“.
// Die id eines Spruchs oder einer Gruppe nie ändern; neue bekommen eine neue id.

const DEFAULT_SAYINGS = {
  einstimmung: [   // Einstimmung
    { id: "e0", text: "Setz dich bequem hin und schließe die Augen. Nimm einen tiefen Atemzug, und lass ihn langsam wieder los." },
    { id: "e1", text: "Spüre, wie du sitzt. Der Boden trägt dich." },
    { id: "e2", text: "Alles, was heute war, darf jetzt draußen bleiben." },
    { id: "e3", text: "Mit jedem Ausatmen wirst du ein wenig ruhiger." },
    { id: "e4", text: "Du bist hier. Genau jetzt. Mehr ist nicht zu tun." },
    { id: "e5", text: "Atme ein und zähle innerlich bis vier. Und atme langsam aus, bis sechs." },
    { id: "e6", text: "Wenn Gedanken kommen, lass sie ziehen wie Wolken am Himmel." },
    { id: "e7", text: "Atme tief in den Bauch. Spüre, wie er sich hebt und wieder senkt." },
    { id: "e8", text: "Lass die Schultern sinken. Lass den Kiefer locker." },
    { id: "e9", text: "Dein Atem fließt von allein, ruhig und gleichmäßig." },
    { id: "e10", text: "Mit jedem Atemzug kommst du mehr bei dir an." },
  ],
  bodyscan: [   // Bodyscan
    { id: "g-aufwaerts", name: "Von den Füßen aufwärts", items: [
      { id: "aufwaerts1", text: "Wir wandern jetzt mit der Aufmerksamkeit durch deinen Körper." },
      { id: "aufwaerts2", text: "Beginne bei deinen Füßen. Spüre die Zehen, die Sohlen, die Fersen." },
      { id: "aufwaerts3", text: "Wandere weiter zu den Unterschenkeln und den Knien. Lass sie schwer werden." },
      { id: "aufwaerts4", text: "Spüre deine Oberschenkel und dein Becken. Alles darf sich lösen." },
      { id: "aufwaerts5", text: "Richte die Aufmerksamkeit auf deinen Bauch. Er hebt und senkt sich mit dem Atem." },
      { id: "aufwaerts6", text: "Spüre deinen Rücken. Wirbel für Wirbel wird er weich." },
      { id: "aufwaerts7", text: "Nimm deine Brust wahr und dein Herz, das ruhig schlägt." },
      { id: "aufwaerts8", text: "Lass die Schultern los. Spüre deine Arme bis in die Fingerspitzen." },
      { id: "aufwaerts9", text: "Wandere zum Nacken und zum Hals. Hier darf alle Spannung gehen." },
      { id: "aufwaerts10", text: "Spüre dein Gesicht. Die Stirn, die Augen, den Kiefer. Alles wird weich." },
      { id: "aufwaerts11", text: "Nimm jetzt deinen ganzen Körper wahr. Ruhig, schwer und warm." },
    ] },
    { id: "g-abwaerts", name: "Vom Kopf zu den Füßen", items: [
      { id: "abwaerts1", text: "Wir wandern jetzt durch deinen Körper, vom Scheitel bis zu den Füßen." },
      { id: "abwaerts2", text: "Spüre deine Kopfhaut und deine Stirn. Lass sie glatt und weit werden." },
      { id: "abwaerts3", text: "Lass die Augen ruhen. Lockere den Kiefer, die Zunge liegt entspannt." },
      { id: "abwaerts4", text: "Spüre deinen Nacken und deine Schultern. Lass sie sinken." },
      { id: "abwaerts5", text: "Wandere durch die Arme bis in die Hände. Sie werden schwer." },
      { id: "abwaerts6", text: "Spüre deine Brust. Der Atem kommt und geht von allein." },
      { id: "abwaerts7", text: "Nimm deinen Bauch wahr und deinen unteren Rücken. Alles darf loslassen." },
      { id: "abwaerts8", text: "Spüre dein Becken und deine Oberschenkel, schwer und getragen." },
      { id: "abwaerts9", text: "Wandere zu den Knien und den Unterschenkeln." },
      { id: "abwaerts10", text: "Und zuletzt zu den Füßen, bis in jeden Zeh." },
      { id: "abwaerts11", text: "Dein ganzer Körper ist jetzt ruhig und entspannt." },
    ] },
    { id: "g-schwere", name: "Schwere und Wärme", items: [
      { id: "schwere1", text: "Richte deine Aufmerksamkeit auf deinen rechten Arm." },
      { id: "schwere2", text: "Dein rechter Arm wird schwer. Ganz schwer." },
      { id: "schwere3", text: "Auch dein linker Arm wird schwer. Angenehm schwer." },
      { id: "schwere4", text: "Beide Beine werden schwer. Sie sinken in die Unterlage." },
      { id: "schwere5", text: "Spüre, wie Wärme in deine Arme strömt." },
      { id: "schwere6", text: "Die Wärme fließt weiter in deine Beine, bis in die Füße." },
      { id: "schwere7", text: "Dein Atem geht ruhig und gleichmäßig." },
      { id: "schwere8", text: "Dein Herz schlägt ruhig und kräftig." },
      { id: "schwere9", text: "Dein ganzer Körper ist schwer, warm und entspannt." },
    ] },
  ],
  kraftort: [   // Kraftort
    { id: "g-strand", name: "Strand", items: [
      { id: "strand1", text: "Stell dir jetzt einen Ort vor, an dem du dich vollkommen sicher fühlst." },
      { id: "strand2", text: "Du gehst barfuß über einen warmen Sandstrand." },
      { id: "strand3", text: "Du hörst das gleichmäßige Rauschen der Wellen." },
      { id: "strand4", text: "Die Sonne wärmt dein Gesicht. Eine leichte Brise streicht über deine Haut." },
      { id: "strand5", text: "Mit jeder Welle, die kommt und geht, wirst du ruhiger." },
      { id: "strand6", text: "Setz dich in den warmen Sand. Hier ist dein Kraftort." },
      { id: "strand7", text: "Nimm die Ruhe dieses Ortes ganz in dich auf." },
    ] },
    { id: "g-wald", name: "Wald", items: [
      { id: "wald1", text: "Stell dir einen Ort vor, an dem du ganz bei dir bist." },
      { id: "wald2", text: "Du gehst über einen weichen Waldweg. Es riecht nach Moos und Erde." },
      { id: "wald3", text: "Sonnenlicht fällt in Strahlen durch die Blätter." },
      { id: "wald4", text: "Du hörst Vögel und das leise Rauschen der Bäume." },
      { id: "wald5", text: "Vor dir steht ein alter, mächtiger Baum. Lehn dich an ihn." },
      { id: "wald6", text: "Spüre, wie seine Kraft und seine Ruhe auf dich übergehen." },
      { id: "wald7", text: "Hier ist dein Kraftort. Du kannst jederzeit hierher zurückkehren." },
    ] },
    { id: "g-berg", name: "Berggipfel", items: [
      { id: "berg1", text: "Stell dir vor, du stehst auf einem Berggipfel." },
      { id: "berg2", text: "Die Luft ist klar und frisch. Du atmest sie tief ein." },
      { id: "berg3", text: "Unter dir liegt das weite Land, ruhig und still." },
      { id: "berg4", text: "Alles, was dich beschäftigt, ist von hier oben klein und fern." },
      { id: "berg5", text: "Du stehst fest und sicher, getragen vom Felsen unter dir." },
      { id: "berg6", text: "Spüre die Weite und die Kraft dieses Ortes." },
      { id: "berg7", text: "Hier ist dein Kraftort. Nimm dir, was du brauchst." },
    ] },
    { id: "g-see", name: "Bergsee", items: [
      { id: "see1", text: "Stell dir einen stillen Bergsee vor, umgeben von Wiesen und Wald." },
      { id: "see2", text: "Das Wasser ist klar und glatt wie ein Spiegel." },
      { id: "see3", text: "Du setzt dich ans Ufer. Die Sonne wärmt dich." },
      { id: "see4", text: "Jeder Gedanke ist wie ein kleiner Stein, der ins Wasser fällt. Die Wellen glätten sich wieder." },
      { id: "see5", text: "Dein Inneres wird so ruhig und klar wie dieser See." },
      { id: "see6", text: "Hier ist dein Kraftort. Du bist sicher und geborgen." },
    ] },
    { id: "g-garten", name: "Garten", items: [
      { id: "garten1", text: "Stell dir einen Garten vor, der nur dir gehört." },
      { id: "garten2", text: "Du gehst durch ein Tor und siehst Blumen in allen Farben." },
      { id: "garten3", text: "Es duftet nach Rosen und frischem Gras." },
      { id: "garten4", text: "Irgendwo plätschert ein kleiner Brunnen." },
      { id: "garten5", text: "Du findest einen Platz, der genau für dich gemacht ist. Setz dich." },
      { id: "garten6", text: "Spüre die Geborgenheit dieses Ortes." },
      { id: "garten7", text: "Hier ist dein Kraftort. Hier tankst du neue Kraft." },
    ] },
  ],
  unterbewusst: [   // Die Arbeit im Unterbewussten
    { id: "u01", text: "Du bist jetzt tief entspannt. Dein Unterbewusstsein ist offen für neue Gedanken." },
    { id: "u02", text: "Ich spreche dir einige Sätze vor. Wiederhole sie innerlich, ganz ruhig." },
    { id: "u1", text: "Ich vertraue mir." },
    { id: "u2", text: "Ich bin genug, so wie ich bin." },
    { id: "u3", text: "Ich traue mir Großes zu." },
    { id: "u4", text: "Ich stehe zu mir und zu meinen Entscheidungen." },
    { id: "u5", text: "Jeden Tag wächst mein Vertrauen in mich." },
    { id: "u6", text: "Ich bin ruhig und gelassen." },
    { id: "u7", text: "Ich lasse los, was ich nicht ändern kann." },
    { id: "u8", text: "In mir ist ein Ort tiefer Ruhe." },
    { id: "u9", text: "Mein Körper ist stark und gesund." },
    { id: "u10", text: "Mit jedem Atemzug tanke ich neue Kraft." },
    { id: "u11", text: "Ich achte gut auf mich." },
    { id: "u12", text: "Ich bin dankbar für mein Leben." },
    { id: "u13", text: "Ich sehe das Gute in jedem Tag." },
    { id: "u14", text: "Ich lasse los, was mir nicht guttut." },
    { id: "u15", text: "Ich mache Platz für Neues." },
    { id: "u16", text: "Mein Geist ist klar und wach." },
    { id: "u17", text: "Ich weiß, was mir wichtig ist." },
    { id: "u18", text: "Ich bin ganz bei dem, was ich tue." },
    { id: "u91", text: "Diese Sätze wirken in dir weiter, auch wenn du nicht an sie denkst." },
  ],
  rueckkehr: [   // Rückkehr
    { id: "g-zaehlen", name: "Zählen bis fünf", items: [
      { id: "zaehlen1", text: "Es ist Zeit, langsam zurückzukehren. Ich zähle von eins bis fünf." },
      { id: "zaehlen2", text: "Eins. Du nimmst den Raum um dich wieder wahr." },
      { id: "zaehlen3", text: "Zwei. Dein Atem wird tiefer und kräftiger." },
      { id: "zaehlen4", text: "Drei. Bewege sanft deine Finger und deine Zehen." },
      { id: "zaehlen5", text: "Vier. Strecke dich, wenn du magst." },
      { id: "zaehlen6", text: "Fünf. Öffne die Augen. Du bist wach, klar und erfrischt." },
    ] },
    { id: "g-sanft", name: "Sanft zurückkommen", items: [
      { id: "sanft1", text: "Lass die Bilder langsam ziehen. Alles Gute nimmst du mit." },
      { id: "sanft2", text: "Spüre wieder den Boden unter dir und den Raum um dich." },
      { id: "sanft3", text: "Atme ein paar Mal tief ein und aus." },
      { id: "sanft4", text: "Bewege langsam deine Hände und deine Füße." },
      { id: "sanft5", text: "Wenn du so weit bist, öffne die Augen." },
      { id: "sanft6", text: "Willkommen zurück. Du bist ausgeruht und voller Kraft." },
    ] },
  ],
};

// Steht nach der letzten Phase auf dem Bildschirm (wird nicht vorgelesen)
const END_LINE = "Die Meditation ist zu Ende. Schön, dass du dir diese Zeit genommen hast.";
