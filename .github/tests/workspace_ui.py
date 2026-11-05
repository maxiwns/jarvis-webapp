"""Local browser acceptance test. Uses an isolated Chromium profile and fixture data."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
TITLE = "Kreislaufwirtschaft"


def serve(route):
    url = urlsplit(route.request.url)
    if url.hostname != "jarvis.test":
        route.abort()
        return
    path = url.path
    if path.startswith("/api/"):
        payload = {
            "/api/conversations": {"chats": [{"id": "c1", "title": "Recherche"}]},
            "/api/messages": {"messages": [
                {"role": "user", "content": "Erstelle einen Wikipedia-Bericht über Kreislaufwirtschaft."},
                {"role": "assistant", "content": "Dein Bericht ist fertig.", "report_id": "r1", "report_title": TITLE}
            ]},
            "/api/agent-jobs": {"success": True, "title": TITLE, "text": "Ein Bericht über Stoffkreisläufe.\n\nLanglebige Produkte\nEin reparierbares Gerät lässt sich länger nutzen. Austauschbare Teile können verhindern, dass ein einzelner Defekt das ganze Gerät unbrauchbar macht.\n\nWiederverwendung\nEin Bauteil erneut zu verwenden erhält mehr seiner ursprünglichen Funktion, als es lediglich als Rohstoff zu recyceln.",
                                "sources": [{"title": TITLE, "url": "https://de.wikipedia.org/w/index.php?oldid=42"}]},
            "/api/brain-save": {"saved": True, "title": TITLE},
            "/api/tasks": {"success": True, "tasks": []},
            "/api/brain-library": {"success": True, "categories": [], "entries": []}
        }.get(path, {})
        route.fulfill(content_type="application/json", body=json.dumps(payload))
    else:
        file = ROOT / Path(path).name
        if file.is_file():
            route.fulfill(path=file)
        else:
            route.fulfill(status=404, body="")


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", headless=True)
    for width, height in [(1440, 900), (820, 1180), (390, 844)]:
        page = browser.new_page(viewport={"width": width, "height": height})
        page.clock.install()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("**/*", serve)
        page.add_init_script("""Object.defineProperty(window,'speechSynthesis',{value:{
          getVoices:()=>[{localService:true,lang:'de-DE',voiceURI:'local',name:'Deutsch'}],
          cancel:()=>window.didCancel=true,addEventListener:()=>{},speak:u=>window.didRead=u.text}});
          window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};""")
        page.goto("http://jarvis.test/JARVIS_0_9_Complete_Preview.html")
        nav = page.locator("#sidebar" if width > 880 else "#bottomnav")
        nav.get_by_role("button", name="Chat").click()
        page.get_by_role("button", name="Gespräche", exact=True).click()
        expect(page.locator("#jr-history")).to_be_visible()
        page.locator("#jr-history").get_by_role("button", name="Recherche", exact=True).click()
        expect(page.locator("#jr-history")).to_be_hidden()
        page.get_by_role("button", name="Bericht öffnen").click()
        expect(page.locator(".jr-reader h2")).to_have_text(TITLE)
        expect(page.locator(".jr-links a")).to_have_attribute("href","https://de.wikipedia.org/w/index.php?oldid=42")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        page.get_by_role("button", name="Vorlesen", exact=True).click()
        assert page.evaluate("window.didRead.startsWith('Ein Bericht')")
        page.get_by_role("button", name="Vorlesen stoppen").click()
        assert page.evaluate("window.didCancel")
        if os.environ.get("JARVIS_SCREENSHOTS"):
            page.screenshot(path=str(Path(os.environ["JARVIS_SCREENSHOTS"]) / f"workspace-{width}.png"))
        page.locator(".jr-footer").get_by_role("button",name="Ins Second Brain").click()
        expect(page.locator(".jr-footer")).to_contain_text("Gespeichert: "+TITLE)
        if width <= 1000:
            page.get_by_role("button", name="← Gespräch").click()
            expect(page.locator(".jcm-composer-input")).to_be_visible()
        queue = {"state": "retry_wait", "label": "Vorübergehender Fehler · automatische Wiederholung wartet", "attempts": 1}
        page.route("**/api/messages?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"messages": [
            {"role": "assistant", "content": "Bericht angenommen.", "job_id": "r1", "job_status": "error",
             "job_error": "Vorübergehender Fehler", "job_queue": queue}
        ]})))
        page.get_by_role("button", name="Gespräche", exact=True).click()
        page.locator("#jr-history").get_by_role("button", name="Recherche", exact=True).click()
        expect(page.locator(".jcm-note").filter(has_text=queue["label"])).to_be_visible()
        expect(page.get_by_role("button", name="Bericht erneut starten", exact=True)).to_have_count(0)
        page.locator(".jcm-composer-input").fill("Mein ungesendeter Entwurf")
        page.route("**/api/messages?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"messages": [
            {"role": "assistant", "content": "Dein Bericht ist fertig.", "job_id": "r1", "job_status": "done",
             "report_id": "r1", "report_title": TITLE, "job_queue": None}
        ]})))
        page.clock.run_for(15010)
        expect(page.get_by_role("button", name="Bericht öffnen", exact=True)).to_be_visible()
        expect(page.locator(".jcm-composer-input")).to_have_value("Mein ungesendeter Entwurf")
        page.route("**/api/agent-jobs", lambda route: route.fulfill(content_type="application/json", body=json.dumps({
            "success": True, "jobs": [{"id": "r1", "title": TITLE, "status": "error", "queue": queue}]
        })))
        nav.get_by_role("button", name="Auftragszentrale" if width > 880 else "Aufträge").click()
        if not page.locator("#agent-jobs-refresh").is_visible():
            page.locator("details").filter(has=page.locator("#agent-jobs-refresh")).locator("summary").click()
        page.locator("#agent-jobs-refresh").click()
        expect(page.locator("#agent-jobs-list .pill")).to_have_text(queue["label"])
        expect(page.locator("#agent-jobs-list button")).to_have_count(0)
        page.route("**/api/agent-jobs", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"Testausfall"}'))
        page.clock.run_for(15010)
        expect(page.locator("#agent-jobs-status")).to_contain_text("Bisherige Anzeige bleibt erhalten")
        expect(page.locator("#agent-jobs-list .pill")).to_have_text(queue["label"])
        page.route("**/api/agent-jobs", lambda route: route.fulfill(content_type="application/json", body=json.dumps({
            "success": True, "jobs": [{"id": "r1", "title": TITLE, "status": "done", "queue": None, "result": "Fertig"}]
        })))
        page.clock.run_for(15010)
        expect(page.locator("#agent-jobs-list .pill")).to_have_text("done")
        skill_rows = []
        def skills_api(route):
            if route.request.method == "POST":
                body = route.request.post_data_json
                if body["action"] == "create":
                    skill_rows.append({"id": "test-skill", "title": body["title"], "goal": body["goal"], "version": 0, "active_version": None, "paused": 0})
                elif body["action"] == "learn":
                    skill_rows[0].update(version=1, learning_status="done", material={"text": "Übungsanleitung: Risiken und Kosten erklären."})
                elif body["action"] == "approve":
                    skill_rows[0]["active_version"] = 1
                elif body["action"] == "pause":
                    skill_rows[0]["paused"] = 1
                route.fulfill(content_type="application/json", body='{"success":true}')
            else:
                route.fulfill(content_type="application/json", body=json.dumps({"skills": skill_rows}))
        page.route("**/api/skills", skills_api)
        nav.get_by_role("button", name="Skills").click()
        page.get_by_role("button", name="Vorlage: Trading lernen").click()
        assert "Keine Echtgeld-Trades" in page.locator("#skill-goal").input_value()
        expect(page.locator("#skill-title")).to_have_value("Daytrading verstehen und simulieren")
        page.get_by_role("button", name="Lernziel speichern").click()
        page.get_by_role("button", name="Lernanleitung erstellen").click()
        page.get_by_text("Arbeitsanleitung prüfen", exact=True).click()
        expect(page.locator("#skills-list")).to_contain_text("Risiken und Kosten erklären")
        page.on("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="Geprüfte Version aktivieren").click()
        expect(page.get_by_role("button", name="Skill auf Übungsaufgabe anwenden")).to_be_visible()
        page.get_by_role("button", name="Skill pausieren").click()
        expect(page.locator("#skills-list")).to_contain_text("Pausiert")
        expect(page.get_by_role("button", name="Skill auf Übungsaufgabe anwenden")).to_have_count(0)
        def development_api(route):
            if route.request.method == "POST":
                if route.request.post_data_json["action"] == "publish":
                    route.fulfill(status=409,content_type="application/json",body='{"error":"GitHub-Schreibzugriff fehlt."}')
                else:
                    route.fulfill(content_type="application/json",body='{"success":true,"jobId":"lab-job"}')
            elif "jobId=" in route.request.url:
                route.fulfill(content_type="application/json",body=json.dumps({"status":"done","result":"window.labExecuted = true;"}))
            else:
                route.fulfill(content_type="application/json",body=json.dumps({"github":{"connected":False,"reason":"GitHub-Zugang fehlt."},"cloudflare":{"connected":False,"reason":"Pages-Zugang fehlt."}}))
        page.route("**/api/development**", development_api)
        page.get_by_text("Code-Labor · GitHub & Cloudflare",exact=True).click()
        page.get_by_role("button",name="Verbindungen prüfen").click()
        expect(page.locator("#skills")).to_contain_text("GitHub-Zugang fehlt.")
        page.get_by_label("Entwicklungsziel",exact=True).fill("Eine reine Funktion für Stichwörter erstellen.")
        page.get_by_role("button",name="Codevorschlag erstellen",exact=True).click()
        expect(page.locator("#skills pre")).to_have_text("window.labExecuted = true;")
        assert page.evaluate("window.labExecuted === undefined")
        page.get_by_role("button",name="Als GitHub-Entwurf ablegen").click()
        expect(page.locator("#skills")).to_contain_text("GitHub-Schreibzugriff fehlt.")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        assert not errors, errors
        print(f"OK {width}x{height}: Gespräch, Bericht, Quellen, Sprachausgabe, Warteschlange, Skills und Layout")
        page.close()
    browser.close()
