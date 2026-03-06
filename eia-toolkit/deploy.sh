#!/bin/bash
# ============================================================
# EIA Toolkit — Lambda deploy script
# Run from the lambda/ folder.
# Requires: Python 3.12+, AWS CLI configured, role created
# ============================================================
set -e

FUNCTION_NAME="eia-report-generator"
REGION="ap-northeast-1"
ROLE_ARN="${LAMBDA_ROLE_ARN:-}"   # Set this env var or replace below

if [ -z "$ROLE_ARN" ]; then
  echo "Error: Set LAMBDA_ROLE_ARN environment variable"
  echo "Example: export LAMBDA_ROLE_ARN=arn:aws:iam::123456789012:role/lambda-eia-role"
  exit 1
fi

echo "── Installing dependencies ──────────────────────────────"
rm -rf package/
mkdir package/
pip install python-docx -t ./package/ --quiet
cp lambda_function.py ./package/

echo "── Building zip ─────────────────────────────────────────"
cd package/
zip -r ../eia-report.zip . --quiet
cd ..
echo "Zip size: $(du -sh eia-report.zip | cut -f1)"

echo "── Deploying to AWS Lambda ($REGION) ────────────────────"
# Try update first, create if it doesn't exist
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION > /dev/null 2>&1; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://eia-report.zip \
    --region $REGION \
    --no-cli-pager
else
  echo "Creating new function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime python3.12 \
    --handler lambda_function.lambda_handler \
    --zip-file fileb://eia-report.zip \
    --role $ROLE_ARN \
    --region $REGION \
    --memory-size 512 \
    --timeout 60 \
    --environment "Variables={}" \
    --no-cli-pager

  echo "── Creating Function URL ────────────────────────────────"
  aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id allow-public-url \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region $REGION \
    --no-cli-pager

  aws lambda create-function-url-config \
    --function-name $FUNCTION_NAME \
    --auth-type NONE \
    --cors '{
      "AllowOrigins": ["https://your-app.vercel.app"],
      "AllowMethods": ["POST","OPTIONS"],
      "AllowHeaders": ["Content-Type"]
    }' \
    --region $REGION \
    --no-cli-pager
fi

echo "── Getting Function URL ─────────────────────────────────"
URL=$(aws lambda get-function-url-config \
  --function-name $FUNCTION_NAME \
  --region $REGION \
  --query 'FunctionUrl' \
  --output text \
  --no-cli-pager)

echo ""
echo "✅ Done! Function URL:"
echo "   $URL"
echo ""
echo "Add this to your Vercel environment variables:"
echo "   VITE_LAMBDA_URL=$URL"
echo ""
echo "Test it:"
echo "   python test_lambda.py $URL"
