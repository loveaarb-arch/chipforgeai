import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chipChatMessagesTable, chipProjectVersionsTable, chipProjectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateProjectBody,
  CreateProjectResponse,
  DeleteProjectParams,
  GenerateProjectHdlParams,
  GenerateProjectHdlResponse,
  GetProjectParams,
  GetProjectResponse,
  GetProjectVersionParams,
  GetProjectVersionResponse,
  ListProjectChatMessagesParams,
  ListProjectChatMessagesResponse,
  ListProjectVersionsParams,
  ListProjectVersionsResponse,
  ListProjectsResponse,
  RestoreProjectVersionParams,
  RestoreProjectVersionResponse,
  SaveProjectVersionBody,
  SaveProjectVersionParams,
  SaveProjectVersionResponse,
  SendProjectChatMessageBody,
  SendProjectChatMessageParams,
  SendProjectChatMessageResponse,
  UpdateProjectBody,
  UpdateProjectDesignBody,
  UpdateProjectDesignParams,
  UpdateProjectDesignResponse,
  UpdateProjectParams,
  UpdateProjectResponse,
  ValidateProjectDesignParams,
  ValidateProjectDesignResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  buildLockedProjectMessage,
  buildRefusalMessage,
  generateArchitecture,
  generateHdl,
  runSafetyCheck,
  validateDesign,
} from "../lib/design";
import {
  EMPTY_DESIGN,
  decryptDesign,
  encryptDesign,
  getProjectVersion,
  listChatMessages,
  listOwnedProjects,
  listProjectVersions,
  loadOwnedProject,
  toChatMessageResponse,
  toProjectResponse,
  toProjectSummaryResponse,
  toVersionResponse,
  toVersionSummaryResponse,
} from "../lib/projectStore";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/projects", async (req, res) => {
  const projects = await listOwnedProjects(req.userId!);
  res.json(ListProjectsResponse.parse(projects.map(toProjectSummaryResponse)));
});

router.post("/projects", async (req, res) => {
  const body = CreateProjectBody.parse(req.body);
  const [project] = await db
    .insert(chipProjectsTable)
    .values({
      ownerId: req.userId!,
      name: body.name,
      description: body.description ?? null,
      currentVersionNumber: 0,
      encryptedDesign: encryptDesign(EMPTY_DESIGN),
    })
    .returning();
  res.status(201).json(CreateProjectResponse.parse(toProjectResponse(project!)));
});

router.get("/projects/:id", async (req, res) => {
  const { id } = GetProjectParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(GetProjectResponse.parse(toProjectResponse(result.project)));
});

router.patch("/projects/:id", async (req, res) => {
  const { id } = UpdateProjectParams.parse(req.params);
  const body = UpdateProjectBody.parse(req.body);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const [updated] = await db
    .update(chipProjectsTable)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined
        ? { description: body.description }
        : {}),
    })
    .where(eq(chipProjectsTable.id, id))
    .returning();
  res.json(UpdateProjectResponse.parse(toProjectResponse(updated!)));
});

router.delete("/projects/:id", async (req, res) => {
  const { id } = DeleteProjectParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  await db.delete(chipProjectsTable).where(eq(chipProjectsTable.id, id));
  res.status(204).end();
});

router.patch("/projects/:id/design", async (req, res) => {
  const { id } = UpdateProjectDesignParams.parse(req.params);
  const body = UpdateProjectDesignBody.parse(req.body);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const [updated] = await db
    .update(chipProjectsTable)
    .set({
      encryptedDesign: encryptDesign({
        components: body.components,
        connections: body.connections,
        // Manual structural edits invalidate previously generated HDL/netlist.
        hdlCode: null,
        netlist: null,
      }),
    })
    .where(eq(chipProjectsTable.id, id))
    .returning();
  res.json(UpdateProjectDesignResponse.parse(toProjectResponse(updated!)));
});

router.get("/projects/:id/versions", async (req, res) => {
  const { id } = ListProjectVersionsParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const versions = await listProjectVersions(id);
  res.json(ListProjectVersionsResponse.parse(versions.map(toVersionSummaryResponse)));
});

router.post("/projects/:id/versions", async (req, res) => {
  const { id } = SaveProjectVersionParams.parse(req.params);
  const body = SaveProjectVersionBody.parse(req.body ?? {});
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const nextVersionNumber = result.project.currentVersionNumber + 1;
  const [version] = await db
    .insert(chipProjectVersionsTable)
    .values({
      projectId: id,
      versionNumber: nextVersionNumber,
      label: body.label ?? null,
      changeNote: body.changeNote ?? null,
      encryptedDesign: result.project.encryptedDesign,
    })
    .returning();
  await db
    .update(chipProjectsTable)
    .set({ currentVersionNumber: nextVersionNumber })
    .where(eq(chipProjectsTable.id, id));
  res.status(201).json(SaveProjectVersionResponse.parse(toVersionResponse(version!)));
});

router.get("/projects/:id/versions/:versionId", async (req, res) => {
  const { id, versionId } = GetProjectVersionParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const version = await getProjectVersion(id, versionId);
  if (!version) {
    res.status(404).json({ error: "Version not found." });
    return;
  }
  res.json(GetProjectVersionResponse.parse(toVersionResponse(version)));
});

router.post("/projects/:id/versions/:versionId/restore", async (req, res) => {
  const { id, versionId } = RestoreProjectVersionParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const version = await getProjectVersion(id, versionId);
  if (!version) {
    res.status(404).json({ error: "Version not found." });
    return;
  }
  const [updated] = await db
    .update(chipProjectsTable)
    .set({ encryptedDesign: version.encryptedDesign })
    .where(eq(chipProjectsTable.id, id))
    .returning();
  res.json(RestoreProjectVersionResponse.parse(toProjectResponse(updated!)));
});

router.get("/projects/:id/chat", async (req, res) => {
  const { id } = ListProjectChatMessagesParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const messages = await listChatMessages(id);
  res.json(ListProjectChatMessagesResponse.parse(messages.map(toChatMessageResponse)));
});

router.post("/projects/:id/chat", async (req, res) => {
  const { id } = SendProjectChatMessageParams.parse(req.params);
  const body = SendProjectChatMessageBody.parse(req.body);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Once a project is locked (an earlier message tripped the safety
  // classifier), it stays locked permanently — no further design requests
  // are evaluated, even reframed or "it's just for education" follow-ups.
  // Other projects owned by the same user are unaffected.
  if (result.project.locked) {
    const [userMessageRow] = await db
      .insert(chipChatMessagesTable)
      .values({ projectId: id, role: "user", content: body.content, blocked: true })
      .returning();
    const [assistantMessageRow] = await db
      .insert(chipChatMessagesTable)
      .values({
        projectId: id,
        role: "assistant",
        content: buildLockedProjectMessage(result.project.lockedCategory),
        blocked: true,
      })
      .returning();
    res.json(
      SendProjectChatMessageResponse.parse({
        userMessage: toChatMessageResponse(userMessageRow!),
        assistantMessage: toChatMessageResponse(assistantMessageRow!),
        blocked: true,
        project: toProjectResponse(result.project),
      }),
    );
    return;
  }

  const safety = await runSafetyCheck(body.content);

  const [userMessageRow] = await db
    .insert(chipChatMessagesTable)
    .values({
      projectId: id,
      role: "user",
      content: body.content,
      blocked: !safety.allowed,
    })
    .returning();

  if (!safety.allowed) {
    req.log.warn(
      { projectId: id, category: safety.category },
      "Chat message blocked by safety filter — locking project",
    );
    const [lockedProject] = await db
      .update(chipProjectsTable)
      .set({ locked: true, lockedCategory: safety.category })
      .where(eq(chipProjectsTable.id, id))
      .returning();
    const [assistantMessageRow] = await db
      .insert(chipChatMessagesTable)
      .values({
        projectId: id,
        role: "assistant",
        content: buildRefusalMessage(safety.category),
        blocked: true,
      })
      .returning();
    res.json(
      SendProjectChatMessageResponse.parse({
        userMessage: toChatMessageResponse(userMessageRow!),
        assistantMessage: toChatMessageResponse(assistantMessageRow!),
        blocked: true,
        project: toProjectResponse(lockedProject!),
      }),
    );
    return;
  }

  const currentDesign = decryptDesign(result.project.encryptedDesign);
  const priorMessages = await listChatMessages(id);
  const recentHistory = priorMessages
    .filter((m) => m.id !== userMessageRow!.id)
    .slice(-10)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const { design, explanation } = await generateArchitecture({
    userMessage: body.content,
    currentDesign: {
      components: currentDesign.components,
      connections: currentDesign.connections,
    },
    recentHistory,
  });

  const [updatedProject] = await db
    .update(chipProjectsTable)
    .set({
      encryptedDesign: encryptDesign({
        components: design.components,
        connections: design.connections,
        hdlCode: null,
        netlist: null,
      }),
    })
    .where(eq(chipProjectsTable.id, id))
    .returning();

  const [assistantMessageRow] = await db
    .insert(chipChatMessagesTable)
    .values({
      projectId: id,
      role: "assistant",
      content: explanation,
      blocked: false,
    })
    .returning();

  res.json(
    SendProjectChatMessageResponse.parse({
      userMessage: toChatMessageResponse(userMessageRow!),
      assistantMessage: toChatMessageResponse(assistantMessageRow!),
      blocked: false,
      project: toProjectResponse(updatedProject!),
    }),
  );
});

router.post("/projects/:id/validate", async (req, res) => {
  const { id } = ValidateProjectDesignParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const design = decryptDesign(result.project.encryptedDesign);
  const validation = await validateDesign({
    components: design.components,
    connections: design.connections,
  });
  res.json(ValidateProjectDesignResponse.parse(validation));
});

router.post("/projects/:id/hdl", async (req, res) => {
  const { id } = GenerateProjectHdlParams.parse(req.params);
  const result = await loadOwnedProject(id, req.userId!);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const design = decryptDesign(result.project.encryptedDesign);
  const { hdlCode, netlist } = await generateHdl({
    components: design.components,
    connections: design.connections,
  });
  const [updated] = await db
    .update(chipProjectsTable)
    .set({
      encryptedDesign: encryptDesign({
        components: design.components,
        connections: design.connections,
        hdlCode,
        netlist: JSON.stringify(netlist),
      }),
    })
    .where(eq(chipProjectsTable.id, id))
    .returning();
  res.json(GenerateProjectHdlResponse.parse(toProjectResponse(updated!)));
});

export default router;
