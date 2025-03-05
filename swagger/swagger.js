const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Revas API',
      version: '1.0.0',
      description: 'API documentation for the Revas Platform',
    },
    servers: [
      {
        url: 'http://localhost:3000/api', 
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Admin',
        description: 'Admin-specific operations',
      },
      {
        name: 'Account Managers',
        description: 'Endpoints related to account managers',
      },
      {
        name: 'Users',
        description: 'Endpoints related to users product registration and management',
      },
    ],
  },
  apis: ['./routes/*.js'], // Path to your route files
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
