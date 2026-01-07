# Operational Runbook

## Overview

This runbook provides guidance for common operational tasks, troubleshooting, and incident response for the AI-Assisted Crypto Trading System.

## Table of Contents

1. [Common Operations](#common-operations)
2. [Troubleshooting](#troubleshooting)
3. [Incident Response](#incident-response)
4. [Rollback Procedures](#rollback-procedures)

---

## Common Operations

### Deploying Updates

#### Backend Deployment
```bash
# Deploy to test environment
./deployment/scripts/deploy-backend.sh test

# Deploy to production environment
./deployment/scripts/deploy-backend.sh production
```

#### Frontend Deployment
```bash
# Deploy to test environment
./deployment/scripts/deploy-frontend.sh test

# Deploy to production environment
./deployment/scripts/deploy-frontend.sh production
```

### Checking System Health

```bash
# Run health checks
./deployment/tests/health-checks.sh <environment>

# Run full validation
./deployment/scripts/validate-deployment.sh <environment>
```

### Viewing Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/<environment>-crypto-trading-<function> --follow

# View recent errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/<environment>-crypto-trading-<function> \
  --filter-pattern "ERROR"
```

### Managing Secrets

```bash
# Update a secret
aws secretsmanager update-secret \
  --secret-id <secret-arn> \
  --secret-string '{"api_key":"...","api_secret":"..."}'

# Rotate Lambda to pick up new secrets
aws lambda update-function-configuration \
  --function-name <function-name> \
  --environment "Variables={FORCE_REFRESH=$(date +%s)}"
```

---

## Troubleshooting

### Lambda Function Errors

1. **Check CloudWatch Logs**
   ```bash
   aws logs tail /aws/lambda/<function-name> --since 1h
   ```

2. **Check Lambda metrics**
   - Go to CloudWatch > Metrics > Lambda
   - Check Errors, Duration, Throttles

3. **Common issues:**
   - Timeout: Increase timeout in Lambda configuration
   - Memory: Increase memory allocation
   - Permissions: Check IAM role permissions

### API Gateway Issues

1. **Check API Gateway logs**
   - Enable access logging in API Gateway
   - Check CloudWatch Logs for API Gateway

2. **Test endpoint directly**
   ```bash
   curl -v https://<api-domain>/api/<endpoint>
   ```

3. **Common issues:**
   - 403 Forbidden: Check API key or authorization
   - 502 Bad Gateway: Lambda function error
   - 504 Gateway Timeout: Lambda timeout

### Database Connectivity

1. **DynamoDB**
   ```bash
   aws dynamodb describe-table --table-name <table-name>
   aws dynamodb scan --table-name <table-name> --limit 1
   ```

2. **Redis**
   - Check ElastiCache cluster status
   - Verify security group allows Lambda access

3. **Timestream**
   ```bash
   aws timestream-write describe-database --database-name <database-name>
   ```

---

## Incident Response

### High Error Rate

1. **Identify affected functions**
   - Check CloudWatch alarms
   - Review error logs

2. **Assess impact**
   - Check affected endpoints
   - Determine user impact

3. **Mitigate**
   - Consider rollback if recent deployment
   - Scale resources if needed
   - Enable circuit breakers

4. **Communicate**
   - Update status page
   - Notify stakeholders

### Performance Degradation

1. **Check metrics**
   - Lambda duration
   - API Gateway latency
   - Database response times

2. **Identify bottleneck**
   - X-Ray traces
   - CloudWatch Insights queries

3. **Remediate**
   - Scale Lambda concurrency
   - Optimize database queries
   - Enable caching

---

## Rollback Procedures

### Lambda Rollback

```bash
# List available versions
aws lambda list-versions-by-function --function-name <function-name>

# Rollback to previous version
./deployment/scripts/rollback-backend.sh <environment>
```

### Frontend Rollback

```bash
# Rollback frontend
./deployment/scripts/rollback-frontend.sh <environment>
```

### Infrastructure Rollback

```bash
# Revert to previous Terraform state
cd infrastructure/environments/<environment>
terraform plan -target=<resource>
terraform apply -target=<resource>
```

---

## Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | [TBD] |
| Platform Team | [TBD] |
| Security Team | [TBD] |

---

*Last updated: 2026-01-04*
