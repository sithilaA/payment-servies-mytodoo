import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { dbConnect } from './config/database';
import apiRoutes from './routes/api';
import { requestIdMiddleware } from './middlewares/requestId';
import { requestLogger } from './middlewares/requestLogger';

dotenv.config();

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json()); // Parsing JSON bodies
app.use(requestIdMiddleware);
app.use(requestLogger);
// app.use(morgan('dev')); // Replaced by custom logger

// Database
dbConnect();

// Routes
app.use('/api/v1', apiRoutes);

// Swagger
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

if (process.env.SWAGGER_ENABLED === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log('Swagger Docs available at /api-docs');
}

// Health Check
// Health Check
import { sequelize } from './config/database'; // Ensure sequelize is imported if not already in upper scope (it wasn't imported in app.ts, wait.. dbConnect is imported).
// Need to import sequelize to check status.
// Actually, let's just do it cleanly.

app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'UP', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'DOWN', database: 'disconnected' });
  }
});

import { errorHandler } from './middlewares/errorHandler';

app.use((req, res) => {
  res.status(404).json({ status: 'error', code: 404, message: 'Not Found' });
});

app.use(errorHandler);

export default app;
