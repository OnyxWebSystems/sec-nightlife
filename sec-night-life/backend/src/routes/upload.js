import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const ALLOWED = [
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  // Resumes / documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const MAX = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX },
  fileFilter: (req, file, cb) => {
    cb(null, ALLOWED.includes(file.mimetype));
  }
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

router.post('/', authenticateToken, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const r = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream(
          {
            folder: 'sec-nightlife',
            // Allow PDFs/docs in addition to images
            resource_type: 'auto',
          },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        s.end(req.file.buffer);
      });
      return res.json({ file_url: r.secure_url });
    }
    const b = req.file.buffer.toString('base64');
    res.json({ file_url: 'data:' + req.file.mimetype + ';base64,' + b });
  } catch (err) {
    next(err);
  }
});

export default router;
