import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import fedapayWebhookRouter from "./fedapay-webhook.js";
import numbersRouter from "./numbers.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fedapayWebhookRouter);
router.use(numbersRouter);

export default router;
