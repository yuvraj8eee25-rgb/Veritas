# Profile avatars

Avatars use the private Supabase Storage bucket `avatars`. The browser uploads
to `<authenticated-user-id>/avatar.<extension>` and stores that path in the
existing `profiles.progress.avatarFileId` value. Authenticated Storage policies
limit reads and writes to that user's folder. The app creates a one-hour signed
URL to display the image. Replacing an avatar overwrites the same path.

Apply `supabase/migrations/0010_private_avatars.sql` before using avatar upload.
No service-role key belongs in the frontend; Supabase Auth and row-level Storage
policies authorize all operations.

If a profile still contains an Appwrite file ID from an earlier version, the
private Supabase bucket cannot resolve that ID. The database value is retained;
the user should upload the image again to establish its Supabase path.
