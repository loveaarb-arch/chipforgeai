import { db } from "@workspace/db";
import {
  chipChatMessagesTable,
  chipProjectVersionsTable,
  chipProjectsTable,
  type ChipChatMessageRow,
  type ChipProjectRow,
  type ChipProjectVersionRow,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { decryptJson, encryptJson } from "./crypto";
import { normalizeConnections, type ChipComponentData, type ChipConnectionData } from "./design";

export interface StoredDesign {
  components: ChipComponentData[];
  connections: ChipConnectionData[];
  hdlCode: string | null;
  netlist: string | null;
  xdcConstraints: string | null;
  sdcConstraints: string | null;
}

export const EMPTY_DESIGN: StoredDesign = {
  components: [],
  connections: [],
  hdlCode: null,
  netlist: null,
  xdcConstraints: null,
  sdcConstraints: null,
};

export function encryptDesign(design: StoredDesign): string {
  return encryptJson(design);
}

export function decryptDesign(encrypted: string): StoredDesign {
  const design = decryptJson<StoredDesign>(encrypted);
  // Self-heals any previously-stored connections missing "label" (see
  // normalizeConnections) so already-broken projects recover on next read
  // instead of 500ing forever.
  // Also self-heals xdcConstraints/sdcConstraints added after initial launch.
  return {
    ...design,
    connections: normalizeConnections(design.connections),
    xdcConstraints: design.xdcConstraints ?? null,
    sdcConstraints: design.sdcConstraints ?? null,
  };
}

export type OwnershipResult =
  | { ok: true; project: ChipProjectRow }
  | { ok: false; status: 403 | 404; error: string };

export async function loadOwnedProject(
  projectId: number,
  userId: string,
): Promise<OwnershipResult> {
  const [project] = await db
    .select()
    .from(chipProjectsTable)
    .where(eq(chipProjectsTable.id, projectId));

  if (!project) {
    return { ok: false, status: 404, error: "Project not found." };
  }
  if (project.ownerId !== userId) {
    return {
      ok: false,
      status: 403,
      error: "You do not have permission to access this project.",
    };
  }
  return { ok: true, project };
}

export function toProjectResponse(project: ChipProjectRow) {
  const design = decryptDesign(project.encryptedDesign);
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    currentVersionNumber: project.currentVersionNumber,
    design: {
      components: design.components,
      connections: design.connections,
    },
    hdlCode: design.hdlCode,
    netlist: design.netlist,
    xdcConstraints: design.xdcConstraints,
    sdcConstraints: design.sdcConstraints,
    locked: project.locked,
    lockedCategory: project.lockedCategory,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function toProjectSummaryResponse(project: ChipProjectRow) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    currentVersionNumber: project.currentVersionNumber,
    locked: project.locked,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function toVersionResponse(version: ChipProjectVersionRow) {
  const design = decryptDesign(version.encryptedDesign);
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    changeNote: version.changeNote,
    design: {
      components: design.components,
      connections: design.connections,
    },
    hdlCode: design.hdlCode,
    netlist: design.netlist,
    createdAt: version.createdAt,
  };
}

export function toVersionSummaryResponse(version: ChipProjectVersionRow) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    label: version.label,
    changeNote: version.changeNote,
    createdAt: version.createdAt,
  };
}

export function toChatMessageResponse(message: ChipChatMessageRow) {
  return {
    id: message.id,
    role: message.role as "user" | "assistant",
    content: message.content,
    blocked: message.blocked,
    createdAt: message.createdAt,
  };
}

export async function listOwnedProjects(userId: string) {
  return db
    .select()
    .from(chipProjectsTable)
    .where(eq(chipProjectsTable.ownerId, userId))
    .orderBy(desc(chipProjectsTable.updatedAt));
}

export async function listProjectVersions(projectId: number) {
  return db
    .select()
    .from(chipProjectVersionsTable)
    .where(eq(chipProjectVersionsTable.projectId, projectId))
    .orderBy(desc(chipProjectVersionsTable.versionNumber));
}

export async function getProjectVersion(projectId: number, versionId: number) {
  const [version] = await db
    .select()
    .from(chipProjectVersionsTable)
    .where(
      and(
        eq(chipProjectVersionsTable.id, versionId),
        eq(chipProjectVersionsTable.projectId, projectId),
      ),
    );
  return version;
}

export async function listChatMessages(projectId: number) {
  return db
    .select()
    .from(chipChatMessagesTable)
    .where(eq(chipChatMessagesTable.projectId, projectId))
    .orderBy(chipChatMessagesTable.createdAt);
}
