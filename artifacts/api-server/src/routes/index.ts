import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import accountRouter from "./account";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(projectsRouter);

export default router;
