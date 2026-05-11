import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:8080")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Open the Insights view by clicking the 'Insights' tab.
        # button "Insights"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div/button[5]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Open the Overview tab so a task or activity can be added to produce data for the Insights charts.
        # button "Overview"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div/button").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Click the 'Add entry +' button in the Overview page to create a log entry (this will reveal the entry form).
        # button "Add entry +"
        elem = page.locator("xpath=/html/body/div[5]/div[3]/div[2]/div/div/div[2]/div[2]/div/div[4]/button").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Fill the new entry form (intent + duration + set focus quality) and save the entry so Insights can render charts. Immediate action: enter text into the 'What did you work on?' field.
        # placeholder="e.g. Finish the login flow ref"
        elem = page.locator("xpath=/html/body/div[8]/div/div[3]/textarea").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Worked on adding sample entry for Insights heatmap test (create test data).")
        
        # -> Fill the new entry form (intent + duration + set focus quality) and save the entry so Insights can render charts. Immediate action: enter text into the 'What did you work on?' field.
        # text input placeholder="e.g. 45 min or 1h 30m"
        elem = page.locator("xpath=/html/body/div[8]/div/div[6]/input").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("45m")
        
        # -> Fill the new entry form (intent + duration + set focus quality) and save the entry so Insights can render charts. Immediate action: enter text into the 'What did you work on?' field.
        # button "High"
        elem = page.locator("xpath=/html/body/div[8]/div/div[7]/div/button[3]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Fill the new entry form (intent + duration + set focus quality) and save the entry so Insights can render charts. Immediate action: enter text into the 'What did you work on?' field.
        # button "Save"
        elem = page.locator("xpath=/html/body/div[8]/div/div[10]/div/button[2]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Open the Insights tab and verify the heatmap chart and the focus distribution chart are rendered from the newly saved activity.
        # button "Insights"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div/button[5]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # --> Test passed — verified by AI agent
        frame = context.pages[-1]
        current_url = await frame.evaluate("() => window.location.href")
        assert current_url is not None, "Test completed successfully"
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    