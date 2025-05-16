require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const cors = require('cors');
const bodyParser = require('body-parser');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

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

app.use(cors());
app.use(bodyParser.json());

// Endpoint to create a new scheduled Lambda function
app.post('/create-scheduled-lambda', async (req, res) => {
  try {
    const { code, interval, functionName, env, PRIVATE_KEY, PUBLIC_KEY } = req.body;

    if (!code || !interval || !functionName) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Prepare environment variables
    const environmentVariables = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      API_KEY: process.env.API_KEY,
      ...(env || {}),
      ...(PRIVATE_KEY ? { PRIVATE_KEY } : {}),
      ...(PUBLIC_KEY ? { PUBLIC_KEY } : {})
    };

    // Create a zip file containing the Lambda function code
    const zip = new AdmZip();
    const codeFolderPath = path.join(__dirname, 'code');
    const files = fs.readdirSync(codeFolderPath);
    for (const file of files) {
      const filePath = path.join(codeFolderPath, file);
      let fileContent = fs.readFileSync(filePath);
      if (file === 'baseline.js') {
        // Replace {ai-code} in baseline.js
        let baselineJsContent = fileContent.toString();
        baselineJsContent = baselineJsContent.replace('{ai-code}', code);
        fileContent = Buffer.from(baselineJsContent);
      }
      zip.addFile(`code/${file}`, fileContent);
    }

    // Create Lambda function
    const lambdaParams = {
      FunctionName: functionName,
      Runtime: 'nodejs18.x',
      Role: process.env.AWS_LAMBDA_ROLE_ARN,
      Handler: 'code/baseline.handler',
      Code: {
        ZipFile: zip.toBuffer()
      },
      Timeout: 600, // 10 minutes in seconds
      MemorySize: 128,
      Environment: {
        Variables: environmentVariables
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 