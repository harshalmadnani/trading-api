require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const bodyParser = require('body-parser');
const AdmZip = require('adm-zip');

const app = express();
const port = process.env.PORT || 3000;

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();
const events = new AWS.EventBridge();
const kms = new AWS.KMS();

app.use(cors());
app.use(bodyParser.json());

// Test endpoint to verify KMS functionality
app.post('/test-kms', async (req, res) => {
  try {
    // Create a test Lambda function
    const testFunctionName = 'kms-test-function';
    const testCode = `
const AWS = require('aws-sdk');
const kms = new AWS.KMS();

exports.handler = async (event) => {
  try {
    // Attempt to decrypt the private key
    const encryptedKey = process.env.ENCRYPTED_PRIVATE_KEY;
    const decryptedData = await kms.decrypt({
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    }).promise();
    
    const privateKey = decryptedData.Plaintext.toString('utf-8');
    
    // Return success if decryption worked
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'KMS decryption successful',
        privateKeyLength: privateKey.length
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack
      })
    };
  }
};`;

    // Create the test Lambda function
    const zip = new AdmZip();
    zip.addFile('index.js', Buffer.from(testCode));
    const zipBuffer = zip.toBuffer();

    const lambdaParams = {
      FunctionName: testFunctionName,
      Runtime: 'nodejs18.x',
      Role: process.env.AWS_LAMBDA_ROLE_ARN,
      Handler: 'index.handler',
      Code: {
        ZipFile: zipBuffer
      },
      Timeout: 30,
      MemorySize: 128,
      Environment: {
        Variables: {
          ENCRYPTED_PRIVATE_KEY: process.env.ENCRYPTED_PRIVATE_KEY
        }
      }
    };

    const lambdaFunction = await lambda.createFunction(lambdaParams).promise();

    // Invoke the function immediately
    const invokeParams = {
      FunctionName: testFunctionName,
      InvocationType: 'RequestResponse'
    };

    const result = await lambda.invoke(invokeParams).promise();
    const response = JSON.parse(result.Payload);

    // Clean up - delete the test function
    await lambda.deleteFunction({ FunctionName: testFunctionName }).promise();

    res.json(response);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});

// Endpoint to create a new scheduled Lambda function
app.post('/create-scheduled-lambda', async (req, res) => {
  try {
    const { code, interval, functionName } = req.body;

    if (!code || !interval || !functionName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Create the Lambda function code with KMS decryption
    const functionCode = `
const AWS = require('aws-sdk');
const kms = new AWS.KMS();

exports.handler = async (event) => {
  try {
    // Decrypt the private key using KMS
    const encryptedKey = process.env.ENCRYPTED_PRIVATE_KEY;
    const decryptedData = await kms.decrypt({
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    }).promise();
    
    const privateKey = decryptedData.Plaintext.toString('utf-8');
    
    // Your trading bot code will have access to the decrypted private key
    ${code}
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Function executed successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};`;

    // Create a zip file containing the Lambda function code
    const zip = new AdmZip();
    zip.addFile('index.js', Buffer.from(functionCode));
    const zipBuffer = zip.toBuffer();

    // Create Lambda function with KMS permissions
    const lambdaParams = {
      FunctionName: functionName,
      Runtime: 'nodejs18.x',
      Role: process.env.AWS_LAMBDA_ROLE_ARN,
      Handler: 'index.handler',
      Code: {
        ZipFile: zipBuffer
      },
      Timeout: 600, // 10 minutes in seconds
      MemorySize: 128,
      Environment: {
        Variables: {
          ENCRYPTED_PRIVATE_KEY: process.env.ENCRYPTED_PRIVATE_KEY
        }
      }
    };

    const lambdaFunction = await lambda.createFunction(lambdaParams).promise();

    // Create EventBridge rule for scheduling
    const ruleParams = {
      Name: `${functionName}-rule`,
      ScheduleExpression: interval,
      State: 'ENABLED'
    };

    const rule = await events.putRule(ruleParams).promise();

    // Add permission for EventBridge to invoke Lambda
    const permissionParams = {
      Action: 'lambda:InvokeFunction',
      FunctionName: functionName,
      Principal: 'events.amazonaws.com',
      StatementId: `${functionName}-event-invoke`,
      SourceArn: rule.RuleArn
    };

    await lambda.addPermission(permissionParams).promise();

    // Create target for the rule
    const targetParams = {
      Rule: ruleParams.Name,
      Targets: [{
        Id: `${functionName}-target`,
        Arn: lambdaFunction.FunctionArn
      }]
    };

    await events.putTargets(targetParams).promise();

    res.json({
      message: 'Scheduled Lambda function created successfully',
      functionArn: lambdaFunction.FunctionArn,
      ruleArn: rule.RuleArn
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Only start the server if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Export the app for testing
module.exports = app; 