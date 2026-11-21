import { Router } from "express";
import { basename } from "node:path";
import type { DB } from "./db.js";

/** Notes, original course materials and extracted page images belong to the account that uploaded them. */
export function createUploadsRouter(db: DB, root: string) {
  const router = Router();
  const owned = db.prepare(`SELECT 1 FROM notes n, json_each(n.image_paths) img WHERE n.user_id = @user AND img.value = @path
    UNION ALL SELECT 1 FROM materials m WHERE m.user_id = @user AND m.file_path = @path
    UNION ALL SELECT 1 FROM material_pages p JOIN materials m ON m.id = p.material_id WHERE m.user_id = @user AND p.image_path = @path
    LIMIT 1`);
  router.get("/:name", (req, res) => {
    const name = req.params.name;
    if (basename(name) !== name || !owned.get({ user: req.user!.id, path: `/api/uploads/${name}` })) {
      return res.sendStatus(404);
    }
    res.set("Cache-Control", "private, no-store");
    res.sendFile(name, { root });
  });
  return router;
}
