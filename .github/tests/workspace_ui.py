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
        assert not errors, errors
        print(f"OK {width}x{height}: Gespräch, Bericht, Quellen, Sprachausgabe und Layout")
        page.close()
    browser.close()
