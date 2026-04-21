# Rotation Web

React + Supabase shared rotation planner.

## Start

```bash
npm install
npm run dev
```

## Supabase setup

1. Open Supabase SQL Editor
2. Run `supabase/schema.sql`
3. The app uses `src/supabase.js` for the project URL and anon key

## Shared storage

- Data is stored in the `rotation_states` table
- The current app uses one shared row: `id = 'shared'`
- Changes made on one device are saved to Supabase
- Other devices load the same shared data
- A local browser cache is still kept as a fallback

## Current features

- Generate Saturday sessions for each month
- Mark each session as normal, meeting, or holiday
- Configure teachers, classes, and attendance statuses
- Auto-build the rotation table
- Save notes for each session
- Sync shared data through Supabase
