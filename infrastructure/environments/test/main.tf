# Test Environment Main Configuration
# This file instantiates all modules with test-specific configurations

locals {
  environment = var.environment
  name_prefix = "${var.project_name}-${var.environment}"
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

#------------------------------------------------------------------------------
# VPC Module
#------------------------------------------------------------------------------
module "vpc" {
  source = "../../modules/vpc"

  environment        = var.environment
  project_name       = var.project_name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  enable_nat_gateway = true
  single_nat_gateway = var.single_nat_gateway

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# KMS Module
#------------------------------------------------------------------------------
module "kms" {
  source = "../../modules/kms"

  environment  = var.environment
  project_name = var.project_name

  enable_secrets_key  = true
  enable_s3_key       = true
  enable_dynamodb_key = false # Use AWS-managed keys for test environment
  enable_key_rotation = true

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# DynamoDB Module
#------------------------------------------------------------------------------
module "dynamodb" {
  source = "../../modules/dynamodb"

  environment  = var.environment
  project_name = var.project_name

  billing_mode                  = var.dynamodb_billing_mode
  enable_point_in_time_recovery = true
  enable_autoscaling            = var.enable_autoscaling

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# S3 Module
#------------------------------------------------------------------------------
module "s3" {
  source = "../../modules/s3"

  environment  = var.environment
  project_name = var.project_name

  audit_log_retention_days = var.audit_log_retention_days
  enable_access_logging    = true

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# Timestream Module
# Note: Disabled by default - requires AWS support to enable for new accounts
#------------------------------------------------------------------------------
module "timestream" {
  source = "../../modules/timestream"
  count  = var.enable_timestream ? 1 : 0

  environment  = var.environment
  project_name = var.project_name

  memory_store_retention_hours  = var.timestream_memory_retention_hours
  magnetic_store_retention_days = var.timestream_magnetic_retention_days
  enable_magnetic_store_writes  = true
  create_iam_policies           = true

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# ElastiCache Redis Module
#------------------------------------------------------------------------------
module "elasticache" {
  source = "../../modules/elasticache"

  environment  = var.environment
  project_name = var.project_name

  # Network configuration
  private_subnet_ids      = module.vpc.private_subnet_ids
  redis_security_group_id = module.vpc.redis_security_group_id

  # Redis cluster configuration
  redis_node_type       = var.redis_node_type
  redis_num_cache_nodes = var.redis_num_cache_nodes
  redis_multi_az        = var.redis_multi_az

  # Backup configuration
  redis_snapshot_retention_days = var.redis_snapshot_retention_days
  redis_maintenance_window      = var.redis_maintenance_window
  redis_snapshot_window         = var.redis_snapshot_window

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# IAM Module
#------------------------------------------------------------------------------
module "iam" {
  source = "../../modules/iam"

  environment  = var.environment
  project_name = var.project_name

  # DynamoDB table ARNs for per-table policies
  dynamodb_table_arns = module.dynamodb.table_arns
  dynamodb_gsi_arns   = module.dynamodb.all_gsi_arns

  # S3 bucket ARNs for per-bucket policies
  s3_bucket_arns     = module.s3.all_bucket_arns
  enable_s3_policies = true

  # Timestream ARNs - conditional based on module enablement
  timestream_database_arn    = var.enable_timestream ? module.timestream[0].database_arn : ""
  timestream_table_arns      = var.enable_timestream ? module.timestream[0].all_table_arns_list : []
  enable_timestream_policies = var.enable_timestream

  # KMS key ARNs
  kms_key_arns        = compact([module.kms.secrets_key_arn, module.kms.s3_key_arn])
  enable_kms_policies = true

  # VPC configuration for Lambda access
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# Secrets Manager Module
#------------------------------------------------------------------------------
module "secrets" {
  source = "../../modules/secrets"

  environment  = var.environment
  project_name = var.project_name

  # KMS key for encryption
  kms_key_arn = module.kms.secrets_key_arn

  # Shorter recovery window for test environment
  recovery_window_in_days = 0

  # Lambda role ARNs for resource policies
  lambda_role_arns = module.iam.all_lambda_role_arns

  # Disable rotation for test environment
  enable_rotation = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.iam]
}

#------------------------------------------------------------------------------
# Lambda Module
#------------------------------------------------------------------------------
module "lambda" {
  source = "../../modules/lambda"

  environment  = var.environment
  project_name = var.project_name

  # VPC configuration
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.vpc.lambda_security_group_id]

  # IAM execution roles
  lambda_execution_role_arns = module.iam.lambda_execution_role_arns

  # S3 deployment bucket
  s3_deployment_bucket     = module.s3.lambda_deployments_bucket_id
  s3_deployment_key_prefix = "lambda"

  # DynamoDB table names for environment variables
  dynamodb_table_names = module.dynamodb.table_names

  # Redis configuration
  redis_endpoint = module.elasticache.redis_primary_endpoint_address
  redis_port     = module.elasticache.redis_port

  # Timestream configuration - conditional
  timestream_database_name = var.enable_timestream ? module.timestream[0].database_name : ""

  # Secrets ARNs
  secrets_arns = merge(
    module.secrets.exchange_secret_arns,
    module.secrets.ai_provider_secret_arns,
    module.secrets.infrastructure_secret_arns
  )

  # Lambda configuration
  log_retention_days             = var.log_retention_days
  enable_provisioned_concurrency = var.enable_provisioned_concurrency

  # Auth functions will be deployed after backend packages are created
  # Run deploy-backend.sh first to create auth-*.zip packages in S3
  excluded_functions = []

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.iam, module.secrets]
}


#------------------------------------------------------------------------------
# Route53 Module - Hosted Zone
# Requirements: 18.1
# Note: Creates hosted zone first for ACM DNS validation
#------------------------------------------------------------------------------
module "route53" {
  source = "../../modules/route53"

  environment  = var.environment
  project_name = var.project_name

  domain_name     = var.domain_name
  api_domain_name = var.api_domain_name

  create_hosted_zone = true

  # Disable all records - will be created by route53_records after API Gateway and CloudFront
  create_cloudfront_record  = false
  create_www_record         = false
  create_api_gateway_record = false

  # Health checks - disabled for test environment
  enable_health_checks = false
  enable_failover      = false
  enable_dnssec        = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# ACM Module
# Note: Apply Route53 first (terraform apply -target=module.route53), then
# run full apply to create DNS validation records
#------------------------------------------------------------------------------
module "acm" {
  source = "../../modules/acm"

  environment  = var.environment
  project_name = var.project_name

  domain_name     = var.domain_name
  api_domain_name = var.api_domain_name

  # DNS validation using Route53 hosted zone
  # Set to true after Route53 hosted zone is created
  create_route53_records = var.enable_acm_dns_validation
  route53_zone_id        = var.enable_acm_dns_validation ? module.route53.hosted_zone_id : ""
  wait_for_validation    = var.enable_acm_dns_validation

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.route53]
}

#------------------------------------------------------------------------------
# API Gateway Module
#------------------------------------------------------------------------------
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment  = var.environment
  project_name = var.project_name

  # Domain configuration
  api_domain_name = var.api_domain_name
  certificate_arn = module.acm.api_certificate_arn
  frontend_domain = var.domain_name

  # Lambda integration
  lambda_function_arns        = module.lambda.function_arns
  lambda_function_invoke_arns = module.lambda.function_invoke_arns
  lambda_function_names       = module.lambda.function_names

  # Throttling configuration
  throttling_rate_limit  = var.api_throttling_rate_limit
  throttling_burst_limit = var.api_throttling_burst_limit

  # Caching - disabled for test environment
  enable_caching = false

  # Logging
  log_retention_days       = var.log_retention_days
  enable_access_logging    = true
  enable_execution_logging = true
  logging_level            = "INFO"

  # API Gateway CloudWatch role - use existing role
  create_cloudwatch_role       = false
  existing_cloudwatch_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/crypto-trading-test-api-gateway-cloudwatch"

  # API keys
  enable_api_keys = true

  # Auth Lambda configuration
  # Will be populated when auth Lambda is deployed
  auth_lambda_invoke_arn    = var.auth_lambda_invoke_arn
  auth_lambda_function_name = var.auth_lambda_function_name

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.lambda, module.acm]
}


#------------------------------------------------------------------------------
# WAF Module
# Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 7.10
#------------------------------------------------------------------------------
module "waf" {
  source = "../../modules/waf"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment  = var.environment
  project_name = var.project_name

  # Rate limiting
  rate_limit            = var.waf_rate_limit
  cloudfront_rate_limit = var.waf_rate_limit

  # Protection rules - disabled for test environment
  enable_sql_injection_protection = var.enable_sql_injection_protection
  enable_xss_protection           = var.enable_xss_protection

  # CloudFront WAF - enabled when CloudFront is enabled
  create_cloudfront_waf = var.enable_cloudfront

  # API Gateway association
  associate_api_gateway = true
  api_gateway_stage_arn = module.api_gateway.stage_arn

  # Logging - disabled for test environment to reduce costs
  enable_logging        = false
  create_waf_log_bucket = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.api_gateway]
}

#------------------------------------------------------------------------------
# CloudFront Module
# Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.9
# Creates CloudFront distribution for serving frontend from S3
#------------------------------------------------------------------------------
module "cloudfront" {
  source = "../../modules/cloudfront"
  count  = var.enable_cloudfront ? 1 : 0

  environment  = var.environment
  project_name = var.project_name

  # S3 Origin Configuration
  s3_bucket_id                   = module.s3.frontend_assets_bucket_id
  s3_bucket_arn                  = module.s3.frontend_assets_bucket_arn
  s3_bucket_regional_domain_name = module.s3.frontend_assets_bucket_domain_name

  # Let CloudFront manage the S3 bucket policy for OAI access
  manage_s3_bucket_policy = true

  # Domain and Certificate Configuration
  domain_name         = var.domain_name
  acm_certificate_arn = module.acm.frontend_validated_certificate_arn

  # WAF Integration
  waf_web_acl_arn = module.waf.cloudfront_web_acl_arn

  # Cache Configuration - use defaults for static assets (1 year) and dynamic (no cache)
  default_ttl       = 86400      # 1 day for HTML
  max_ttl           = 31536000   # 1 year
  static_assets_ttl = 31536000   # 1 year for _next/static/*

  # Compression enabled
  enable_compression = true

  # Logging - disabled for test environment to reduce costs
  enable_logging = false

  # Price class - use cheapest for test
  price_class = var.cloudfront_price_class

  # Geographic restrictions - none for test
  geo_restriction_type = "none"

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.acm, module.s3, module.waf]
}

#------------------------------------------------------------------------------
# Step Functions Module
# Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7
#------------------------------------------------------------------------------
module "step_functions" {
  source = "../../modules/step-functions"

  environment  = var.environment
  project_name = var.project_name

  # IAM role for Step Functions
  step_functions_role_arn = module.iam.step_functions_role_arn

  # Lambda function ARNs for state machine tasks
  lambda_function_arns = module.lambda.function_arns

  # Logging configuration
  log_retention_days = var.log_retention_days

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.lambda, module.iam]
}

#------------------------------------------------------------------------------
# EventBridge Module
# Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
#------------------------------------------------------------------------------
module "eventbridge" {
  source = "../../modules/eventbridge"

  environment  = var.environment
  project_name = var.project_name

  # Lambda function configuration
  lambda_function_arns  = module.lambda.function_arns
  lambda_function_names = module.lambda.function_names

  # Enable scheduled rules
  enable_scheduled_rules = true

  # Enable risk event rules
  enable_risk_event_rules = true

  # SNS topics for notifications (empty for now, will be populated when SNS module is added)
  sns_topic_arns = {}

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.lambda]
}

#------------------------------------------------------------------------------
# Backup Module
# Requirements: 22.1, 22.2, 22.3, 22.5
# Note: Cross-region backup and vault lock disabled for test environment
#------------------------------------------------------------------------------
module "backup" {
  source = "../../modules/backup"

  providers = {
    aws               = aws
    aws.backup_region = aws.backup_region
  }

  environment  = var.environment
  project_name = var.project_name

  # DynamoDB table ARNs to back up
  dynamodb_table_arns = module.dynamodb.all_table_arns_list

  # KMS key for backup encryption (optional for test)
  kms_key_arn = null

  # Retention - 7 days for test environment
  test_retention_days       = 7
  production_retention_days = 35

  # Cross-region backup - disabled for test environment
  enable_cross_region_backup = false

  # Vault lock - disabled for test environment
  enable_vault_lock = false

  # Continuous backup - disabled for test environment
  enable_continuous_backup = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.dynamodb]
}


#------------------------------------------------------------------------------
# Budgets Module
# Requirements: 23.1, 23.2, 23.3, 23.4
# Note: Disabled by default for test - requires notification emails
#------------------------------------------------------------------------------
#------------------------------------------------------------------------------
# Route53 Records Module - API Gateway and CloudFront A Records
# Requirements: 18.3
# Note: Creates A records for API Gateway and CloudFront after they're created
# Set enable_route53_api_records=true after API Gateway is deployed
#------------------------------------------------------------------------------
module "route53_records" {
  source = "../../modules/route53"
  count  = var.enable_route53_api_records ? 1 : 0

  environment  = var.environment
  project_name = var.project_name

  domain_name     = var.domain_name
  api_domain_name = var.api_domain_name

  # Use existing hosted zone
  create_hosted_zone = false
  hosted_zone_id     = module.route53.hosted_zone_id

  # CloudFront records - enabled when CloudFront is enabled
  create_cloudfront_record       = var.enable_cloudfront
  create_www_record              = var.enable_cloudfront
  cloudfront_domain_name         = var.enable_cloudfront ? module.cloudfront[0].distribution_domain_name : ""
  cloudfront_hosted_zone_id      = var.enable_cloudfront ? module.cloudfront[0].distribution_hosted_zone_id : ""

  # API Gateway records
  create_api_gateway_record  = true
  api_gateway_domain_name    = module.api_gateway.regional_domain_name
  api_gateway_hosted_zone_id = module.api_gateway.regional_zone_id

  # Health checks - disabled for test environment
  enable_health_checks = false
  enable_failover      = false
  enable_dnssec        = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.api_gateway, module.route53, module.cloudfront]
}

#------------------------------------------------------------------------------
# Budgets Module
# Requirements: 23.1, 23.2, 23.3, 23.4
# Note: Disabled by default for test - requires notification emails
#------------------------------------------------------------------------------
module "budgets" {
  source = "../../modules/budgets"
  count  = var.enable_budgets && length(var.budget_notification_emails) > 0 ? 1 : 0

  environment  = var.environment
  project_name = var.project_name

  # Budget configuration
  monthly_budget_amount = var.monthly_budget_amount

  # Alert thresholds
  alert_threshold_50  = 50
  alert_threshold_80  = 80
  alert_threshold_100 = 100

  # Notification configuration
  notification_email_addresses = var.budget_notification_emails

  # Service-specific budgets - disabled for test environment
  create_service_budgets = false

  # Cost allocation tags enabled
  enable_cost_allocation_tags = true

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# Cognito Module
# Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
# Creates Cognito User Pool and App Client for authentication
#------------------------------------------------------------------------------
module "cognito" {
  source = "../../modules/cognito"

  environment  = var.environment
  project_name = var.project_name

  # Password policy - Requirements 1.1
  password_minimum_length    = 12
  password_require_lowercase = true
  password_require_uppercase = true
  password_require_numbers   = true
  password_require_symbols   = true

  # MFA configuration - Requirements 1.2
  mfa_configuration = "OPTIONAL"

  # Token validity - Requirements 1.5
  access_token_validity_hours = 1
  id_token_validity_hours     = 1
  refresh_token_validity_days = 30

  # Email configuration - Requirements 1.9
  # Use Cognito default for test environment
  domain           = var.domain_name
  ses_identity_arn = ""

  # Lambda triggers - Requirements 1.8
  # Disabled for test environment until Lambda triggers are deployed
  enable_lambda_triggers       = false
  pre_signup_lambda_arn        = ""
  post_confirmation_lambda_arn = ""

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
}

#------------------------------------------------------------------------------
# CI/CD Module
# Requirements: 21.1, 21.2, 21.3, 21.5
# Creates IAM roles for GitHub Actions and CodePipeline, ECR repository,
# and CloudWatch log groups for CI/CD execution
#------------------------------------------------------------------------------
module "cicd" {
  source = "../../modules/cicd"

  environment  = var.environment
  project_name = var.project_name

  # GitHub Actions configuration
  create_github_oidc_provider = var.create_github_oidc_provider
  github_repositories         = var.github_repositories

  # CodePipeline configuration - disabled for test environment
  create_codepipeline_role = false

  # ECR configuration - disabled for test environment (Lambda-based deployment)
  create_ecr_repository = false

  # S3 bucket ARNs for deployment
  lambda_deployment_bucket_arn = module.s3.lambda_deployments_bucket_arn
  frontend_assets_bucket_arn   = module.s3.frontend_assets_bucket_arn

  # Lambda function ARNs for deployment permissions
  lambda_function_arns = module.lambda.all_function_arns_list

  # CloudFront distribution ARN for cache invalidation
  cloudfront_distribution_arn = var.enable_cloudfront ? module.cloudfront[0].distribution_arn : null

  # Logging configuration
  log_retention_days = var.log_retention_days

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.s3, module.lambda, module.cloudfront]
}
