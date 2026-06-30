import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { initializeDatabase } from './database/init';
import authRouter from './api/auth';
import templatesRouter from './api/templates';
import assetsRouter from './api/assets';
import fontsRouter from './api/fonts';

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API server
  crossOriginResourcePolicy: false
}));

// CORS with credentials
const allowedOrigins = CORS_ORIGIN.split(',').map(origin => origin.trim());
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Allow cookies
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parsing
app.use(cookieParser());

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes (public)
app.use('/api/auth', authRouter);

// API Routes (protected)
app.use('/api/templates', templatesRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/fonts', fontsRouter);

// Initialize database
(async () => {
  try {
    await initializeDatabase();
    console.log('✓ Database initialized');

    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ CORS enabled for ${CORS_ORIGIN}`);
    });
  } catch (error) {
    console.error('✗ Failed to initialize:', error);
    process.exit(1);
  }
})();

export default app;
