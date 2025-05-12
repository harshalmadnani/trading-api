const request = require('supertest');
const AWS = require('aws-sdk');
const express = require('express');

// Mock AWS services
jest.mock('aws-sdk', () => {
  const mockLambda = {
    createFunction: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        FunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function'
      })
    }),
    invoke: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Payload: JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({ message: 'KMS decryption successful', privateKeyLength: 1024 })
        })
      })
    }),
    deleteFunction: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    addPermission: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    })
  };

  const mockEvents = {
    putRule: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        RuleArn: 'arn:aws:events:us-east-1:123456789012:rule/test-rule'
      })
    }),
    putTargets: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    })
  };

  const mockKMS = {
    decrypt: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Plaintext: Buffer.from('mock-decrypted-key')
      })
    })
  };

  return {
    Lambda: jest.fn(() => mockLambda),
    EventBridge: jest.fn(() => mockEvents),
    KMS: jest.fn(() => mockKMS),
    config: {
      update: jest.fn()
    }
  };
});

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'mock-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';
process.env.AWS_LAMBDA_ROLE_ARN = 'mock-role-arn';
process.env.ENCRYPTED_PRIVATE_KEY = 'mock-encrypted-key';

// Import the app after mocking AWS
const app = require('./index');

describe('Trading API', () => {
  describe('POST /test-kms', () => {
    it('should test KMS functionality and return success', async () => {
      const response = await request(app)
        .post('/test-kms')
        .expect(200);
      
      expect(response.body).toHaveProperty('body');
      const body = JSON.parse(response.body.body);
      expect(body).toHaveProperty('message', 'KMS decryption successful');
    });

    it('should handle AWS Lambda errors', async () => {
      // Mock a Lambda creation error
      const originalCreateFunction = AWS.Lambda().createFunction;
      AWS.Lambda().createFunction = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Lambda creation failed'))
      });

      const response = await request(app)
        .post('/test-kms')
        .expect(500);
      
      expect(response.body).toHaveProperty('error', 'Lambda creation failed');
      
      // Restore the original mock
      AWS.Lambda().createFunction = originalCreateFunction;
    });
  });

  describe('POST /create-scheduled-lambda', () => {
    it('should create a scheduled Lambda function', async () => {
      const response = await request(app)
        .post('/create-scheduled-lambda')
        .send({
          code: 'console.log("Hello, world!");',
          interval: 'rate(1 hour)',
          functionName: 'test-function'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Scheduled Lambda function created successfully');
      expect(response.body).toHaveProperty('functionArn');
      expect(response.body).toHaveProperty('ruleArn');
    });

    it('should return 400 if required parameters are missing', async () => {
      const response = await request(app)
        .post('/create-scheduled-lambda')
        .send({
          code: 'console.log("Hello, world!");',
          // Missing interval and functionName
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('error', 'Missing required parameters');
    });

    it('should handle Lambda creation errors', async () => {
      // Mock a Lambda creation error
      const originalCreateFunction = AWS.Lambda().createFunction;
      AWS.Lambda().createFunction = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Lambda creation failed'))
      });

      const response = await request(app)
        .post('/create-scheduled-lambda')
        .send({
          code: 'console.log("Hello, world!");',
          interval: 'rate(1 hour)',
          functionName: 'test-function'
        })
        .expect(500);
      
      expect(response.body).toHaveProperty('error', 'Lambda creation failed');
      
      // Restore the original mock
      AWS.Lambda().createFunction = originalCreateFunction;
    });

    it('should handle EventBridge rule creation errors', async () => {
      // Mock an EventBridge rule creation error
      const originalPutRule = AWS.EventBridge().putRule;
      AWS.EventBridge().putRule = jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Rule creation failed'))
      });

      const response = await request(app)
        .post('/create-scheduled-lambda')
        .send({
          code: 'console.log("Hello, world!");',
          interval: 'rate(1 hour)',
          functionName: 'test-function'
        })
        .expect(500);
      
      expect(response.body).toHaveProperty('error', 'Rule creation failed');
      
      // Restore the original mock
      AWS.EventBridge().putRule = originalPutRule;
    });
  });

  describe('AWS Configuration', () => {
    it('should configure AWS with environment variables', () => {
      expect(AWS.config.update).toHaveBeenCalledWith({
        region: 'us-east-1',
        accessKeyId: 'mock-access-key',
        secretAccessKey: 'mock-secret-key'
      });
    });
  });
}); 