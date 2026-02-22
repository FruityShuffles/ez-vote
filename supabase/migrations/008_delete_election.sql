create policy "Owners can delete their elections"
  on public.elections for delete
  using (owner_id = auth.uid());
