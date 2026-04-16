/**
 * Legacy host-events API — retired. Use /api/host/parties instead.
 */
import { Router } from 'express';

const router = Router();

router.use((req, res) => {
  res.status(410).json({
    error: 'Gone',
    message: 'Host events API has moved. Use /api/host/parties and the Host dashboard.',
  });
});

export default router;
