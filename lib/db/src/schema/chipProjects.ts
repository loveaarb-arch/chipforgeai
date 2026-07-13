import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// `encryptedDesign` stores an AES-256-GCM encrypted JSON blob of the shape
// `{ components, connections, hdlCode, netlist }` (see api-server/src/lib/crypto.ts).
// This is the project's mutable "working" design — explicit Saves snapshot it
// into chipProjectVersionsTable rows.
export const chipProjectsTable = pgTable("chip_projects", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  currentVersionNumber: integer("current_version_number").notNull().default(0),
  encryptedDesign: text("encrypted_design").notNull(),
  // Set permanently once a chat message in this project is flagged by the
  // safety classifier. A locked project can no longer send chat messages —
  // the user must start a new project. This does not affect any other
  // project the user owns.
  locked: boolean("locked").notNull().default(false),
  lockedCategory: text("locked_category"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertChipProjectSchema = createInsertSchema(
  chipProjectsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChipProject = z.infer<typeof insertChipProjectSchema>;
export type ChipProjectRow = typeof chipProjectsTable.$inferSelect;
