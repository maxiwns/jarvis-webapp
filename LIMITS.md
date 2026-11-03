# Modellkontingente im Ressourcenmonitor

Die Pages-Einstellungen der verwendeten Umgebung benötigen für den Cloudflare-
Kontoverbrauch die Variable CF_ACCOUNT_ID und das Secret CF_ANALYTICS_TOKEN
(Account Analytics Read, nur für das betroffene Konto). Nach der Einrichtung
die Pages-Version erneut bereitstellen. Keine Zugangsdaten im Chat posten.

Der geschützte Pages-Endpunkt liest beim Öffnen und Aktualisieren des Monitors
die Kontosumme aus Workers AI Analytics seit 00:00 UTC. Die Schätzung
bezieht sich auf das gemeinsame kostenlose Tagesbudget. Andere Nutzer und
Anwendungen desselben Kontos zählen mit. Die Statistik kann verzögert sein.
Der Wert ist kein Kostendeckel für einen Paid-Tarif.

Für Groq muss der Worker mit Quota-Unterstützung aktiv sein. Pages speichert
die gelieferten Rate-Limit-Header erfolgreicher Berichtsaufrufe (auch bei
erfolgreichem Cloudflare-Fallback nach Groq 429) mit Zeitstempel in D1.
Die Tabelle report_quota wird beim ersten Messwert angelegt. Die Anzeige
verwendet immer den letzten vorhandenen Stand. Beim Öffnen des Monitors
wird kein Modell aufgerufen. Groq-Tages-Tokens und exakte verbleibende
Berichtszahlen sind aus diesen Headern nicht ableitbar.
