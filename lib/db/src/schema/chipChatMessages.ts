import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chipProjectsTable } from "./chipProjects";

export const chipChatMessagesTable = pgTable("chip_chat_messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => chipProjectsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertChipChatMessageSchema = createInsertSchema(
  chipChatMessagesTable,
).omit({ id: true, createdAt: true });
export type InsertChipChatMessage = z.infer<
  typeof insertChipChatMessageSchema
>;
export type ChipChatMessageRow = typeof chipChatMessagesTable.$inferSelect;
