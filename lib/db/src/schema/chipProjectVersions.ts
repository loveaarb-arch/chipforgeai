import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chipProjectsTable } from "./chipProjects";

// A read-only snapshot of a project's design at the moment the user tapped
// "Save". `encryptedDesign` uses the same encrypted blob shape as
// chipProjectsTable.encryptedDesign.
export const chipProjectVersionsTable = pgTable("chip_project_versions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => chipProjectsTable.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  label: text("label"),
  changeNote: text("change_note"),
  encryptedDesign: text("encrypted_design").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertChipProjectVersionSchema = createInsertSchema(
  chipProjectVersionsTable,
).omit({ id: true, createdAt: true });
export type InsertChipProjectVersion = z.infer<
  typeof insertChipProjectVersionSchema
>;
export type ChipProjectVersionRow =
  typeof chipProjectVersionsTable.$inferSelect;
