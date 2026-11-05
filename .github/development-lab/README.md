# JARVIS-Code-Labor einrichten

Der Code-Labor-Bereich unter Skills generiert drei Dateien als Textbericht und
kann sie nach Einrichtung in einen eigenen Branch eines separaten GitHub-Repos
schreiben. Er führt keinen generierten Code in Pages aus und merged keinen PR.
Die Verbindung des Codex-Arbeitsplatzes wird nicht an JARVIS weitergegeben.

## Einmalige Kontoeinrichtung

1. Separates Repository anlegen, z. B. `maxiwns/jarvis-code-lab`, mit README und
   Hauptbranch. Keine Secrets, privaten Daten oder JARVIS-Datenbank darin ablegen.
   Dieses Repo nicht an das laufende Cloudflare-Pages-Projekt anbinden.
2. Den Workflow aus `lab-tests.yml.template` als `.github/workflows/lab-tests.yml`
   im Hauptbranch des Labors installieren. Er führt Modellcode in einem Container
   ohne Netzwerk, Credentials oder Schreibzugriff auf das Repository aus.
3. Einen auf genau dieses Repo begrenzten GitHub Fine-grained Token erstellen:
   Metadata Read, Contents Read/Write, Pull requests Read/Write. Kein Workflow-
   Schreibrecht. Alternativ einen passenden kurzlebigen GitHub-App-Token verwenden
   (automatische Erneuerung ist noch nicht implementiert).
4. In der JARVIS-Pages-Testumgebung Secret `JARVIS_GITHUB_TOKEN` setzen, Variablen
   `JARVIS_DEV_REPO=maxiwns/jarvis-code-lab` und `JARVIS_DEV_WRITES=yes`.
5. Optional für die Cloudflare-Statusanzeige: Secret `JARVIS_CF_PAGES_TOKEN` mit
   Pages Read im richtigen Account, Variablen `CF_ACCOUNT_ID` und
   `JARVIS_CF_PROJECT=jarvis-08-test`. Das ist nur ein Lesezugriff. Die vorhandene
   GitHub-Pages-Veröffentlichung benötigt diesen zusätzlichen Zugang nicht.
6. Testversion nach Variablenänderung neu deployen. In Skills → Code-Labor
   „Verbindungen prüfen“, kleine reine Funktion generieren, JSON-Code prüfen,
   „Als GitHub-Entwurf ablegen“ wählen und anschließend GitHub-Tests prüfen.

## Fähigkeiten und Grenzen

- Erlaubte Dateien: `src/skill.js`, `test/skill.test.mjs`, `README.md`.
- Jeder Codeauftrag hat genau einen deterministischen Branch `jarvis/code-ID`.
  Wiederholung verwendet den vorhandenen Branch und PR, auch bei geschlossenen PRs.
- Vorhandene JARVIS-Webapp-/Backend-Repositories werden als Labor abgelehnt.
- Modell-Tests sind Vorschläge. Ein grüner Lauf beweist weder fachliche Richtigkeit
  noch die Eignung für Echtgeldhandel oder Zugriff auf persönliche Konten.
- Die App verifiziert noch keine GitHub-Check-Ergebnisse und aktiviert keinen Code.
  Unabhängige Abnahmetests, kontrollierte Skill-Installation und getrennte
  Cloudflare-Testdeployments sind die nächsten Ausbauschritte.
- Keine Tokens im Browser, Chat, Bericht oder Repository speichern.

Anbieterreferenzen:
https://docs.github.com/en/rest/repos/repos
https://developers.cloudflare.com/pages/configuration/api/
