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
        
        # -> Open the Habits management UI by clicking the 'Habits' button.
        # button "Habits" title="Manage custom habits"
        elem = page.locator("xpath=/html/body/div[5]/div[2]/div[2]/button[2]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # -> Fill the new habit name, set an invalid weekly target (0), and click Add to trigger validation.
        # text input placeholder="Habit name"
        elem = page.locator("xpath=/html/body/div[6]/div/div[4]/input").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("InvalidWeekly")
        
        # -> Fill the new habit name, set an invalid weekly target (0), and click Add to trigger validation.
        # number input title="Days per week target"
        elem = page.locator("xpath=/html/body/div[6]/div/div[4]/input[2]").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("0")
        
        # -> Fill the new habit name, set an invalid weekly target (0), and click Add to trigger validation.
        # button "Add"
        elem = page.locator("xpath=/html/body/div[6]/div/div[4]/button").nth(0)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.click()
        
        # --> Test failed (AST guard fallback)
        raise AssertionError("Test failed during agent run: " + "TEST FAILURE A habit was present in the habits list after attempting to add it with an invalid weekly target, so the app did not prevent the save as expected. Observations: - The weekly target input (#habitTargetInput) shows value=0 and is marked invalid (invalid=true). - The habits list contains an entry named 'InvalidWeekly' showing '5\u00d7/wk' after the Add attempt.")
        await asyncio.sleep(5)
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    