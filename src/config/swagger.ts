import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Payment Microservice API',
      version: '1.0.0',
      description: 'API documentation for the Payment, Payout, and Escrow services.',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Local Development Server',
      },
    ],
    components: {
      schemas: {
        Earning: {
          type: 'object',
          properties: {
            external_user_id: { type: 'string' },
            external_username: { type: 'string' },
            task_price: { type: 'number' },
            service_fee: { type: 'number' },
            commission_fee: { type: 'number' },
            transaction_ref: { type: 'string' },
          },
        },
        PayoutRequest: {
          type: 'object',
          properties: {
            external_user_id: { type: 'string' },
            amount: { type: 'number' },
            method: { type: 'string', enum: ['BANK', 'CARD'] },
          },
        },
        EscrowCreate: {
            type: 'object',
            properties: {
              payer_id: { type: 'string' },
              payee_id: { type: 'string' },
              amount: { type: 'number' },
              task_id: { type: 'string' }
            }
        }
      },
    },
  },
  apis: ['./src/routes/*.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
