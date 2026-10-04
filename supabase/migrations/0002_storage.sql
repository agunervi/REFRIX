-- =====================================================================
-- Imágenes de productos: bucket privado + políticas por inventario.
-- Ruta de cada archivo:  <inventory_id>/<product_id>-<timestamp>.<ext>
-- El primer segmento de la ruta decide quién puede leer o escribir.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  false,
  2097152,                                           -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_select on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and private.try_uuid((storage.foldername(name))[1]) in (select private.my_inventory_ids())
  );

create policy product_images_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and private.try_uuid((storage.foldername(name))[1]) in (select private.my_writable_inventory_ids())
  );

create policy product_images_update on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and private.try_uuid((storage.foldername(name))[1]) in (select private.my_writable_inventory_ids())
  )
  with check (
    bucket_id = 'product-images'
    and private.try_uuid((storage.foldername(name))[1]) in (select private.my_writable_inventory_ids())
  );

create policy product_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and private.try_uuid((storage.foldername(name))[1]) in (select private.my_writable_inventory_ids())
  );
