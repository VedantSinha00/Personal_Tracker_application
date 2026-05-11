
# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** weekly-tracker
- **Date:** 2026-05-12
- **Prepared by:** TestSprite AI Team

---

## 2️⃣ Requirement Validation Summary

#### Test TC001 Complete Google sign-in and enter the workspace
- **Test Code:** [TC001_Complete_Google_sign_in_and_enter_the_workspace.py](./TC001_Complete_Google_sign_in_and_enter_the_workspace.py)
- **Test Error:** TEST BLOCKED

The Google sign-in flow could not be started — the application is already showing a signed-in workspace when accessed at http://localhost:8080, so there is no way to initiate the auth flow from this page.

Observations:
- The top-right shows "Account" and "Sign out" buttons, indicating a signed-in state.
- No "Sign in" or "Sign in with Google" button was visible on the page.
- The main workspace with tabs (Overview, Weekly log, Stack, Review, Insights) is displayed, confirming login was bypassed.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/06216ba2-9ec3-4a73-8cb8-cbaf81a30678
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC002 Create a work block from weekly log and see it in the timeline
- **Test Code:** [TC002_Create_a_work_block_from_weekly_log_and_see_it_in_the_timeline.py](./TC002_Create_a_work_block_from_weekly_log_and_see_it_in_the_timeline.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/a8f6c35b-26b0-4a33-ae06-1f0040289b67
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC003 Switch between main tabs without losing the workspace state
- **Test Code:** [TC003_Switch_between_main_tabs_without_losing_the_workspace_state.py](./TC003_Switch_between_main_tabs_without_losing_the_workspace_state.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/36f13d54-a0a0-4041-b930-350f9558a2be
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC004 Open the main workspace from a returning session
- **Test Code:** [TC004_Open_the_main_workspace_from_a_returning_session.py](./TC004_Open_the_main_workspace_from_a_returning_session.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/9e817196-4c36-4cab-91b8-8dc313fe2abe
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC005 Create a habit with a weekly target and track it from a daily card
- **Test Code:** [TC005_Create_a_habit_with_a_weekly_target_and_track_it_from_a_daily_card.py](./TC005_Create_a_habit_with_a_weekly_target_and_track_it_from_a_daily_card.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/6caa7cfb-5e13-4254-8f14-72729e511c1f
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC006 View insights charts for weekly activity
- **Test Code:** [TC006_View_insights_charts_for_weekly_activity.py](./TC006_View_insights_charts_for_weekly_activity.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/075fa2dc-6801-4c73-85fb-e00bceb61e1c
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC007 View productivity insights charts
- **Test Code:** [TC007_View_productivity_insights_charts.py](./TC007_View_productivity_insights_charts.py)
- **Test Error:** TEST BLOCKED

No stored activity was available — the Insights page shows a placeholder instructing the user to start logging, so the visualizations cannot be verified.

Observations:
- The Insights view is open and displays: "No data yet for this time range. Start logging to see patterns here."
- No heatmap or focus distribution chart elements are present on the page

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/e091ed7b-e499-43cc-8310-c02887ded871
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC008 Review existing habits and confirm daily tracking remains available
- **Test Code:** [TC008_Review_existing_habits_and_confirm_daily_tracking_remains_available.py](./TC008_Review_existing_habits_and_confirm_daily_tracking_remains_available.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/be600351-d2b8-4a44-a734-3826e0b73810
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC009 Keep insights visible after switching tabs
- **Test Code:** [TC009_Keep_insights_visible_after_switching_tabs.py](./TC009_Keep_insights_visible_after_switching_tabs.py)
- **Test Error:** TEST BLOCKED

The test could not be run to completion — the Insights visualizations could not be verified because there is no logged data for the selected time range.

Observations:
- The Insights page displays: "No data yet for this time range. Start logging to see patterns here."
- No heatmap or focus distribution chart elements are visible on the page.
- Tab switching succeeded and the Insights tab is active, but the required visualizations are absent due to missing data.
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/95e07425-9df2-4850-adff-9e8ba9959bca
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC010 Return to the app and keep cached weekly activity after restart
- **Test Code:** [TC010_Return_to_the_app_and_keep_cached_weekly_activity_after_restart.py](./TC010_Return_to_the_app_and_keep_cached_weekly_activity_after_restart.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/adf2b355-bfe6-4f5c-87ab-0af1183bdf92
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC011 Review productivity trends over time
- **Test Code:** [TC011_Review_productivity_trends_over_time.py](./TC011_Review_productivity_trends_over_time.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/af91c30c-3686-4a31-9489-d54a0632f55d
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC012 Return to insights without losing workspace context
- **Test Code:** [TC012_Return_to_insights_without_losing_workspace_context.py](./TC012_Return_to_insights_without_losing_workspace_context.py)
- **Test Error:** TEST BLOCKED

The insights visuals could not be verified — no logged data is available for the selected time range, so the heatmap and focus distribution charts are not rendered.

Observations:
- The Insights tab is active and timeframe controls are visible
- The page displays: 'No data yet for this time range. Start logging to see patterns here.'
- No heatmap or focus distribution charts are rendered on the page

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/c038f46a-700b-4b3b-b222-2e183bf0b90a
- **Status:** BLOCKED
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC013 View an empty insights state when no activity exists
- **Test Code:** [TC013_View_an_empty_insights_state_when_no_activity_exists.py](./TC013_View_an_empty_insights_state_when_no_activity_exists.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/c8403b4a-6d33-43ff-ad99-fe1ac5d31b15
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC014 Handle an empty first launch state
- **Test Code:** [TC014_Handle_an_empty_first_launch_state.py](./TC014_Handle_an_empty_first_launch_state.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/f11e61a7-d095-4e0e-84d4-4421132ce821
- **Status:** ✅ Passed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---

#### Test TC015 Reject an invalid habit target before saving
- **Test Code:** [TC015_Reject_an_invalid_habit_target_before_saving.py](./TC015_Reject_an_invalid_habit_target_before_saving.py)
- **Test Error:** TEST FAILURE

A habit was present in the habits list after attempting to add it with an invalid weekly target, so the app did not prevent the save as expected.

Observations:
- The weekly target input (#habitTargetInput) shows value=0 and is marked invalid (invalid=true).
- The habits list contains an entry named 'InvalidWeekly' showing '5×/wk' after the Add attempt.

- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/c8321aa3-a195-47ba-8613-001f69d4ec8e/7c7a31c8-9d50-4876-91ec-9481ba1367d5
- **Status:** ❌ Failed
- **Analysis / Findings:** {{TODO:AI_ANALYSIS}}.
---


## 3️⃣ Coverage & Matching Metrics

- **66.67** of tests passed

| Requirement        | Total Tests | ✅ Passed | ❌ Failed  |
|--------------------|-------------|-----------|------------|
| ...                | ...         | ...       | ...        |
---


## 4️⃣ Key Gaps / Risks
{AI_GNERATED_KET_GAPS_AND_RISKS}
---