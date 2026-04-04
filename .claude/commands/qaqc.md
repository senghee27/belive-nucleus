# /qaqc

Run QA/QC checks on the current state of the build.

Steps:
1. Ask: which trigger level? (1=feature, 2=integration, 3=pre-prod)
2. Ask: which feature or module are we checking?
3. Read the relevant PRD from docs/features/
4. Run the appropriate checklist from the QAQC agent
5. Output the full QAQC report
6. If PASS → confirm safe to proceed to next step
7. If FAIL → list exact fixes needed and which agent owns each
