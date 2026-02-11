import app from './app';
import http from 'http';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
