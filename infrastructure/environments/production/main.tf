# Production Environment Main Configuration
# This file will instantiate all modules with production-specific configurations

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

  # Backup configuration (7-day retention for production)
  redis_snapshot_retention_days = var.redis_snapshot_retention_days
  redis_maintenance_window      = var.redis_maintenance_window
  redis_snapshot_window         = var.redis_snapshot_window

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
  enable_dynamodb_key = true # Use customer-managed keys for production
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
#------------------------------------------------------------------------------
module "timestream" {
  source = "../../modules/timestream"

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

  # Timestream ARNs
  timestream_database_arn    = module.timestream.database_arn
  timestream_table_arns      = module.timestream.all_table_arns_list
  enable_timestream_policies = true

  # KMS key ARNs
  kms_key_arns        = compact([module.kms.secrets_key_arn, module.kms.s3_key_arn, module.kms.dynamodb_key_arn])
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

  # Longer recovery window for production
  recovery_window_in_days = 30

  # Lambda role ARNs for resource policies
  lambda_role_arns = module.iam.all_lambda_role_arns

  # Enable rotation for production
  enable_rotation = true

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

  # Timestream configuration
  timestream_database_name = module.timestream.database_name

  # Secrets ARNs
  secrets_arns = merge(
    module.secrets.exchange_secret_arns,
    module.secrets.ai_provider_secret_arns,
    module.secrets.infrastructure_secret_arns
  )

  # Lambda configuration - enable provisioned concurrency for production
  log_retention_days             = var.log_retention_days
  enable_provisioned_concurrency = var.enable_provisioned_concurrency

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.iam, module.secrets]
}

#------------------------------------------------------------------------------
# ACM Module
#------------------------------------------------------------------------------
module "acm" {
  source = "../../modules/acm"

  environment  = var.environment
  project_name = var.project_name

  domain_name     = var.domain_name
  api_domain_name = var.api_domain_name

  # DNS validation - set to false if Route53 zone doesn't exist yet
  create_route53_records = false
  wait_for_validation    = false

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }
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

  # Throttling configuration - higher limits for production
  throttling_rate_limit  = var.api_throttling_rate_limit
  throttling_burst_limit = var.api_throttling_burst_limit

  # Caching - enabled for production
  enable_caching    = true
  cache_size        = "0.5"
  cache_ttl_seconds = 300

  # Logging
  log_retention_days       = var.log_retention_days
  enable_access_logging    = true
  enable_execution_logging = true
  logging_level            = "ERROR" # Less verbose for production

  # API keys
  enable_api_keys = true

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

  # Protection rules - enabled for production
  enable_sql_injection_protection = var.enable_sql_injection_protection
  enable_xss_protection           = var.enable_xss_protection

  # CloudFront WAF - enabled for production (requires CloudFront module)
  create_cloudfront_waf = true

  # API Gateway association
  api_gateway_stage_arn = module.api_gateway.stage_arn

  # Logging - enabled for production with dedicated WAF log bucket
  enable_logging              = true
  create_waf_log_bucket       = true
  waf_log_retention_days      = 90
  log_blocked_requests_only   = false
  redact_authorization_header = true

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.api_gateway]
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
# Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6
# Production: Cross-region backup and vault lock enabled
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

  # KMS key for backup encryption
  kms_key_arn              = module.kms.dynamodb_key_arn
  cross_region_kms_key_arn = var.backup_cross_region_kms_key_arn

  # Retention - 35 days for production environment
  test_retention_days       = 7
  production_retention_days = 35

  # Cross-region backup - enabled for production (Requirement 22.4)
  enable_cross_region_backup = true
  backup_region              = var.backup_region

  # Vault lock - enabled for production (Requirement 22.6)
  enable_vault_lock             = true
  vault_lock_min_retention_days = 7
  vault_lock_max_retention_days = 365
  vault_lock_changeable_days    = 3

  # Continuous backup - enabled for production
  enable_continuous_backup = true

  # SNS notifications for backup events
  sns_topic_arn = null # Will be populated when SNS module is integrated

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.dynamodb, module.kms]
}


#------------------------------------------------------------------------------
# Budgets Module
# Requirements: 23.1, 23.2, 23.3
# Production: Service-specific budgets enabled for detailed cost tracking
#------------------------------------------------------------------------------
module "budgets" {
  source = "../../modules/budgets"

  environment  = var.environment
  project_name = var.project_name

  # Budget configuration - higher limit for production
  monthly_budget_amount = var.monthly_budget_amount

  # Alert thresholds
  alert_threshold_50  = 50
  alert_threshold_80  = 80
  alert_threshold_100 = 100

  # Notification configuration
  notification_email_addresses = var.budget_notification_emails

  # Service-specific budgets - enabled for production
  create_service_budgets    = true
  lambda_budget_amount      = var.lambda_budget_amount
  dynamodb_budget_amount    = var.dynamodb_budget_amount
  api_gateway_budget_amount = var.api_gateway_budget_amount

  # Cost allocation tags enabled
  enable_cost_allocation_tags = true

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
# Production: CodePipeline and ECR enabled for more robust deployment options
#------------------------------------------------------------------------------
module "cicd" {
  source = "../../modules/cicd"

  environment  = var.environment
  project_name = var.project_name

  # GitHub Actions configuration
  create_github_oidc_provider = var.create_github_oidc_provider
  github_repositories         = var.github_repositories

  # CodePipeline configuration - enabled for production
  create_codepipeline_role = true

  # ECR configuration - enabled for production (container-based deployment option)
  create_ecr_repository     = true
  ecr_image_retention_count = 50

  # S3 bucket ARNs for deployment
  lambda_deployment_bucket_arn = module.s3.lambda_deployments_bucket_arn
  frontend_assets_bucket_arn   = module.s3.frontend_assets_bucket_arn

  # Lambda function ARNs for deployment permissions
  lambda_function_arns = module.lambda.all_function_arns_list

  # CloudFront distribution ARN for cache invalidation
  cloudfront_distribution_arn = null # Will be populated when CloudFront module is integrated

  # Logging configuration - longer retention for production
  log_retention_days = var.log_retention_days

  tags = {
    Owner      = var.owner
    CostCenter = var.cost_center
  }

  depends_on = [module.s3, module.lambda]
}
