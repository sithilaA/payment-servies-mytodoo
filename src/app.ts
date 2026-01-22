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

import { errorHandler } from './middlewares/errorHandler';

// Health Check
app.get('/health', (req, res) => res.json({ status: 'UP' }));

// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use(errorHandler);

export default app;
