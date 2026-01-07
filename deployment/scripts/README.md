# Deployment Scripts

This directory contains all deployment scripts for the AI-Assisted Crypto Trading System.

## Script Execution Sequence

The main deployment orchestrator (`deploy.sh`) executes scripts in the following order:

```
┌─────────────────────────────────────────────────────────────────┐
│                         deploy.sh                                │
│                   (Main Orchestrator)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: deploy-infrastructure.sh                               │
│  - Terraform init, plan, apply                                   │
│  - Creates VPC, Lambda, DynamoDB, S3, API Gateway, etc.          │
│  - Generates manifest file with resource IDs                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: deploy-backend.sh                                      │
│  - Installs dependencies (npm ci)                                │
│  - Builds TypeScript                                             │
│  - Runs tests (unless --skip-tests)                              │
│  - Creates Lambda deployment packages (.zip)                     │
│  - Uploads packages to S3                                        │
│  - Updates Lambda functions and publishes versions               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: populate-secrets.sh                                    │
│  - Prompts for exchange API credentials (Binance, Coinbase, etc.)│
│  - Prompts for AI provider API keys (OpenAI, Gemini, DeepSeek)   │
│  - Stores secrets in AWS Secrets Manager                         │
│  - Refreshes Lambda functions to pick up new secrets             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: deploy-frontend.sh                                     │
│  - Installs dependencies                                         │
│  - Calls generate-frontend-config.sh (creates .env.local)        │
│  - Builds Next.js application                                    │
│  - Runs tests (unless --skip-tests)                              │
│  - Exports static files                                          │
│  - Uploads to S3 with proper cache headers                       │
│  - Invalidates CloudFront cache                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: validate-deployment.sh                                 │
│  - DNS validation                                                │
│  - SSL/TLS validation                                            │
│  - API health checks                                             │
│  - Frontend checks                                               │
│  - Smoke tests                                                   │
│  - Monitoring checks                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 6: generate-docs.sh                                       │
│  - Generates deployment summary                                  │
│  - Creates operational runbook                                   │
│  - Produces production readiness checklist                       │
└─────────────────────────────────────────────────────────────────┘
```

## Script Descriptions

| Script | Purpose |
|--------|---------|
| `deploy.sh` | Main orchestrator - runs all deployment phases in sequence |
| `deploy-infrastructure.sh` | Deploys AWS infrastructure using Terraform |
| `deploy-backend.sh` | Builds and deploys Lambda functions |
| `deploy-frontend.sh` | Builds and deploys Next.js frontend to S3/CloudFront |
| `populate-secrets.sh` | Interactively populates AWS Secrets Manager |
| `generate-manifest.sh` | Generates/validates deployment manifest from Terraform outputs |
| `generate-frontend-config.sh` | Creates frontend `.env.local` from manifest |
| `generate-docs.sh` | Generates deployment documentation |
| `validate-deployment.sh` | Runs all validation checks |
| `rollback-backend.sh` | Rolls back Lambda functions to previous versions |
| `rollback-frontend.sh` | Rolls back frontend to previous S3 versions |

## Usage

### Full Deployment
```bash
# Deploy to test environment
./deploy.sh test

# Deploy to production (requires manual approval)
./deploy.sh production

# Deploy without running tests
./deploy.sh test --skip-tests
```

### Individual Scripts
```bash
# Infrastructure only
./deploy-infrastructure.sh test

# Backend only (requires manifest from infrastructure)
./deploy-backend.sh test

# Frontend only (requires manifest from infrastructure)
./deploy-frontend.sh test

# Populate secrets interactively
./populate-secrets.sh test

# Validate deployment
./validate-deployment.sh test
```

### Rollback
```bash
# Rollback all Lambda functions to previous version
./rollback-backend.sh test

# Rollback specific Lambda function
./rollback-backend.sh test --function strategies

# Rollback frontend
./rollback-frontend.sh test

# Preview rollback without making changes
./rollback-backend.sh test --dry-run
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform installed
- Node.js and npm installed
- jq installed (for JSON processing)

## Environment Configuration

Scripts read configuration from `deployment/config/<environment>.env` files:
- `deployment/config/test.env`
- `deployment/config/production.env`

## Manifest Files

Infrastructure deployment generates manifest files at:
- `deployment/manifests/test-manifest.json`
- `deployment/manifests/production-manifest.json`

These contain all resource IDs and endpoints needed by subsequent deployment phases.
