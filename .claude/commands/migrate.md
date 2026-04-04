# /migrate

Create a new Supabase migration file for the described schema change.

Steps:
1. Generate filename: current timestamp + description
   Format: YYYYMMDDHHMMSS_description.sql
2. Create file in supabase/migrations/
3. Write the migration following the database agent rules
4. Show the command to apply it: supabase db reset
5. Remind me to commit the migration file to git
