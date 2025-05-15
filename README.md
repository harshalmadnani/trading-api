# Trading API - AWS Lambda Scheduler

This API allows you to create scheduled AWS Lambda functions that execute custom code at specified intervals.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on the `.env.example` template and fill in your AWS credentials:
```bash
cp .env.example .env
```

3. Update the `.env` file with your AWS credentials and configuration:
- AWS_REGION: Your AWS region (e.g., us-east-1)
- AWS_ACCESS_KEY_ID: Your AWS access key
- AWS_SECRET_ACCESS_KEY: Your AWS secret key
- AWS_LAMBDA_ROLE_ARN: ARN of the IAM role that Lambda will assume

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Usage

### Create a Scheduled Lambda Function

**Endpoint:** `POST /create-scheduled-lambda`

**Request Body:**
```json
{
  "functionName": "my-scheduled-function",
  "code": "console.log('Hello World!');",
  "interval": "rate(5 minutes)",
  "env": {
    "MY_ENV_VAR": "some_value"
  }
}
```

**Parameters:**
- `functionName`: Unique name for your Lambda function
- `code`: JavaScript code to be executed by the Lambda function
- `interval`: AWS EventBridge schedule expression (e.g., "rate(5 minutes)", "cron(0 12 * * ? *)")
- `env` (optional): Object containing environment variables to set in the Lambda function

**Example cURL Request:**
```sh
curl -X POST http://localhost:3010/create-scheduled-lambda \
  -H "Content-Type: application/json" \
  -d '{
    "code": "console.log(\"ENV TEST\", process.env.TEST_VAR);",
    "interval": "rate(5 minutes)",
    "functionName": "testEnvLambda",
    "env": {
      "TEST_VAR": "hello_env"
    }
  }'
```

## Testing and Verifying Environment Variables

1. After creating the Lambda, go to the AWS Lambda Console and find your function (e.g., `testEnvLambda`).
2. Use the AWS Console to invoke the function manually, or wait for the scheduled event.
3. Check the function's logs in CloudWatch (Monitor > View logs in CloudWatch) for output like:
   ```
   ENV TEST hello_env
   ```
This confirms that the environment variable was set correctly.

**Response:**
```json
{
  "message": "Scheduled Lambda function created successfully",
  "functionArn": "arn:aws:lambda:region:account-id:function:function-name",
  "ruleArn": "arn:aws:events:region:account-id:rule/rule-name"
}
```

## Notes

- The Lambda function timeout is set to 10 minutes
- The code you provide will be wrapped in a try-catch block
- Make sure your AWS IAM role has the necessary permissions for Lambda and EventBridge
- The interval must be a valid AWS EventBridge schedule expression 