import { config } from 'dotenv';
import { resolve } from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
config({ path: resolve(__dirname, '../', envFile) });
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { initializeDatabase } from './database/init';
import authRouter from './api/auth';
import templatesRouter from './api/templates';
import assetsRouter from './api/assets';
import fontsRouter from './api/fonts';

const app = express();
app.set('trust proxy', 1); // Trust Cloudflare/nginx reverse proxy
const PORT = process.env.PORT || 4000;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_PORT = process.env.SSL_PORT || '4443';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

// HTTPS redirect in production (skip OPTIONS preflight)
if (NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API server
  crossOriginResourcePolicy: false,
  hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

// CORS with credentials
const allowedOrigins = CORS_ORIGIN.split(',').map(origin => origin.trim());
console.log(`✓ CORS origins loaded: ${allowedOrigins.join(', ') || '(none)'}`);
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`✗ CORS blocked origin: ${origin}. Allowed: ${allowedOrigins.join(', ')}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
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

    // HTTP server (always)
    const httpServer = createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`✓ HTTP  on http://localhost:${PORT}`);
      console.log(`✓ CORS enabled for ${CORS_ORIGIN}`);
    });

    // HTTPS server (if cert/key provided)
    if (SSL_CERT_PATH && SSL_KEY_PATH) {
      const httpsOptions = {
        cert: readFileSync(SSL_CERT_PATH),
        key: readFileSync(SSL_KEY_PATH),
      };
      const httpsServer = createHttpsServer(httpsOptions, app);
      httpsServer.listen(SSL_PORT, () => {
        console.log(`✓ HTTPS on https://localhost:${SSL_PORT}`);
      });
    }
  } catch (error) {
    console.error('✗ Failed to initialize:', error);
    process.exit(1);
  }
})();

export default app;
