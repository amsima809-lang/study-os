-- The drawn page is one of the note's existing private image attachments.
ALTER TABLE notes ADD COLUMN handwriting_image_index INTEGER CHECK (handwriting_image_index >= 0);

-- Earlier PencilKit saves recorded stroke bounds against the exact image they describe.
UPDATE notes SET handwriting_image_index = (
  SELECT image_index FROM sketch_pages WHERE note_id = notes.id AND stroke_bounds IS NOT NULL
) WHERE EXISTS (
  SELECT 1 FROM sketch_pages WHERE note_id = notes.id AND stroke_bounds IS NOT NULL
);
