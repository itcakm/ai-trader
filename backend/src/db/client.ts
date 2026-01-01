import { DynamoDB } from 'aws-sdk';

/**
 * DynamoDB DocumentClient configuration
 * Uses environment variables for configuration with sensible defaults
 */
const dynamoDbConfig: DynamoDB.DocumentClient.DocumentClientOptions & DynamoDB.Types.ClientConfiguration = {
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT
  })
};

/**
 * Singleton DynamoDB DocumentClient instance
 */
export const documentClient = new DynamoDB.DocumentClient(dynamoDbConfig);

/**
 * Export the raw DynamoDB client for table management operations
 */
export const dynamoDb = new DynamoDB(dynamoDbConfig);
