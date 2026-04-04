# /review

Review the current changes before committing.

Steps:
1. Run: git diff to see all changes
2. Apply reviewer agent rules to every changed file
3. Output review in the standard format
4. If APPROVE: suggest commit message in conventional commit format
5. If REQUEST CHANGES: list exact fixes needed before committing
