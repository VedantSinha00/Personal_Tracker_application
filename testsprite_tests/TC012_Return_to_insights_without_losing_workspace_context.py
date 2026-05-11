import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )
        context = await browser.new_context()
        context.set_default_timeout(15000)
        page = await context.new_page()
        # -> navigate
        await page.goto("http://localhost:8080")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the Weekly log tab (then switch to Insights and check for heatmap and focus distribution visuals).
        # button "Weekly log"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div/button[2]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Click the Weekly log tab (then switch to Insights and check for heatmap and focus distribution visuals).
        # button "Insights"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div/button[5]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # --> Test blocked (AST guard fallback)
        raise AssertionError("Test blocked during agent run: " + "TEST BLOCKED The insights visuals could not be verified \u2014 no logged data is available for the selected time range, so the heatmap and focus distribution charts are not rendered. Observations: - The Insights tab is active and timeframe controls are visible - The page displays: 'No data yet for this time range. Start logging to see patterns here.' - No heatmap or focus distribution charts are ren...")
        await asyncio.sleep(5)
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    