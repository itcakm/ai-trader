# Deployment Summary - Test

## Overview

| Property | Value |
|----------|-------|
| Environment | test |
| Deployment Date | 2026-01-04 15:29:32 UTC |
| Git Commit | cdd40de |
| Git Branch | main |
| Git Tag | none |
| AWS Region | eu-central-1 |

## Endpoints

### Frontend
- **URL:** https://test.acinaces.com
- **CloudFront Distribution:** E1234567890ABC

### API
- **Base URL:** https://api.test.acinaces.com
- **API Gateway Endpoint:** https://api.test.acinaces.com
- **Stage URL:** https://api.test.acinaces.com/api

## Lambda Functions

| Function | Name |
|----------|------|
| strategies | test-crypto-trading-strategies |
| templates | test-crypto-trading-templates |
| risk-profiles | test-crypto-trading-risk-profiles |

## Data Stores

### DynamoDB Tables

| Table | Name |
|-------|------|
| strategies | test-crypto-trading-strategies |
| templates | test-crypto-trading-templates |
| risk-profiles | test-crypto-trading-risk-profiles |

### Redis
- **Endpoint:** test-redis.cache.amazonaws.com
- **Port:** 6379

### Timestream
- **Database:** test-crypto-trading-timestream

## S3 Buckets

| Purpose | Bucket Name |
|---------|-------------|
| Frontend Assets | test-crypto-trading-frontend-assets |
| Lambda Deployment | test-crypto-trading-lambda-deployment |

## Secrets

### Exchange Credentials

| Exchange | Secret ARN |
|----------|------------|
| binance | arn:aws:secretsmanager:eu-central-1:123456789012:secret:test/exchange/binance |
| coinbase | arn:aws:secretsmanager:eu-central-1:123456789012:secret:test/exchange/coinbase |

### AI Provider Credentials

| Provider | Secret ARN |
|----------|------------|
| gemini | arn:aws:secretsmanager:eu-central-1:123456789012:secret:test/ai/gemini |
| openai | arn:aws:secretsmanager:eu-central-1:123456789012:secret:test/ai/openai |

## Environment Variables

The following environment variables are configured for this deployment:

| Variable | Value |
|----------|-------|
| ENVIRONMENT | test |
| AWS_REGION | eu-central-1 |
| DOMAIN | test.acinaces.com |
| API_DOMAIN | api.test.acinaces.com |
| LOG_LEVEL | debug |
| ENABLE_ANALYTICS | false |
| ENABLE_ERROR_TRACKING | false |
| ENABLE_REAL_TIME_UPDATES | true |

## Monitoring

### CloudWatch
- **Dashboard:** test-crypto-trading-dashboard
- **Log Groups:** /aws/lambda/test-crypto-trading-*

### Alerts
- **SNS Topic:** test-crypto-trading-alerts

---
*Generated on 2026-01-04 15:29:32 UTC*
