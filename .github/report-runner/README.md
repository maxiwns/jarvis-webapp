# Hintergrundberichte · Testinstallation

Der Timer-Worker läuft ohne öffentliche Route. Er liest ausschließlich die
Warteschlange neu angenommener, vom Chat-Planer zugelassener Berichte.
Ein alter offener Auftrag wird durch das Deployment nicht gestartet.
Ein ausdrücklich gestarteter oder wiederholter Bericht aus Chat oder Auftragszentrale
wird bei aktivem Timer ebenfalls atomar eingereiht. Mehrfachklicks behalten denselben
Warteschlangeneintrag. Bereits eingereihte Aufträge werden bei fehlendem Heartbeat
nicht zusätzlich synchron gestartet. Die Oberfläche unterscheidet die Annahme zur
Hintergrundbearbeitung vom fertigen Ergebnis.

1. Mit Wrangler im richtigen Cloudflare-Testkonto anmelden. Die ID der **bereits
   an die Pages-Testversion gebundenen** D1 über `wrangler d1 list` nachsehen.
2. In diesem Ordner `wrangler.template.json` als `wrangler.jsonc` kopieren und
   die bestehende Datenbank-ID einsetzen. Keinen neuen Datenbestand erstellen.
3. Aus diesem Ordner `wrangler deploy` ausführen. Mit
   `wrangler secret put JARVIS_BACKEND_API_KEY` denselben serverseitigen
   Backend-Schlüssel wie bei Pages setzen. Für zuvor aktivierte Tavily-Aufträge
   auch TAVILY_API_KEY und JARVIS_TAVILY_FREE wie in Pages konfigurieren.
4. Nach einem erfolgreich ausgeführten Cron-Tick einen neuen Auftrag per Chat
   senden. Erst die Bestätigung „zur Hintergrundbearbeitung gespeichert“ bedeutet,
   dass Auftrag, Nachrichten und Warteschlangeneintrag gemeinsam gespeichert sind.
   Jetzt den Tab schließen. Später den Chat erneut öffnen und das Ergebnis prüfen.

Der Timer prüft minütlich maximal drei Aufträge. Eine Reservierung gilt vier
Minuten. Nach einer unterbrochenen Reservierung übernimmt ein späterer Tick.
Maximal drei automatische Bearbeitungsversuche. Bei einem Berichtstimeout oder
Backend-HTTP 429/502/503/504 wartet die Warteschlange zwei Minuten vor dem nächsten
Versuch. Andere bestätigte Werkzeugstörungen werden ohne automatische Wiederholung
als Fehler sichtbar. Eine nach dem Speichern des Berichts unterbrochene
Chat-Aktualisierung wird ohne erneuten Modellaufruf nachgeholt. Bei einem Abbruch
während des externen Modellaufrufs kann ein neuer Versuch erneut KI-Kontingent
verbrauchen. Es wird höchstens ein Ergebnis pro Auftrag als abgeschlossen gespeichert.

Ohne aktuellen Timer-Heartbeat bleibt der bisherige synchrone Start für neue
Aufträge aktiv. Bei längerem Ausfall bleiben bereits eingereihte Aufträge in D1,
bis der Timer wieder läuft. Beim Abschalten erst die Warteschlange leeren.
