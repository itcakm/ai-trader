variable "environment" {
  type        = string
  description = "Environment name (test/production)"
  default     = "production"
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "eu-central-1"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

# Networking
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones"
}

variable "single_nat_gateway" {
  type        = bool
  description = "Use single NAT Gateway (should be false for production)"
  default     = false
}

# Domain
variable "domain_name" {
  type        = string
  description = "Frontend domain name"
}

variable "api_domain_name" {
  type        = string
  description = "API domain name"
}

# DynamoDB
variable "dynamodb_billing_mode" {
  type        = string
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  default     = "PROVISIONED"
}

variable "enable_autoscaling" {
  type        = bool
  description = "Enable auto-scaling for DynamoDB provisioned capacity"
  default     = true
}


# Lambda
variable "lambda_memory_default" {
  type        = number
  description = "Default memory size for Lambda functions (MB)"
  default     = 512
}

variable "lambda_timeout_default" {
  type        = number
  description = "Default timeout for Lambda functions (seconds)"
  default     = 30
}

variable "enable_provisioned_concurrency" {
  type        = bool
  description = "Enable provisioned concurrency for latency-sensitive functions"
  default     = true
}

# Redis
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.r6g.large"
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in Redis cluster"
  default     = 2
}

variable "redis_multi_az" {
  type        = bool
  description = "Enable Multi-AZ for Redis"
  default     = true
}

variable "redis_snapshot_retention_days" {
  type        = number
  description = "Number of days to retain Redis snapshots (7 days for production)"
  default     = 7
}

variable "redis_maintenance_window" {
  type        = string
  description = "Weekly maintenance window for Redis (UTC)"
  default     = "sun:05:00-sun:07:00"
}

variable "redis_snapshot_window" {
  type        = string
  description = "Daily time range for Redis snapshots (UTC)"
  default     = "03:00-05:00"
}

# Timestream
variable "timestream_memory_retention_hours" {
  type        = number
  description = "Timestream memory store retention in hours"
  default     = 168
}

variable "timestream_magnetic_retention_days" {
  type        = number
  description = "Timestream magnetic store retention in days"
  default     = 365
}

# S3 Lifecycle
variable "audit_log_retention_days" {
  type        = number
  description = "Retention period for audit logs in days (7 years for compliance)"
  default     = 2555
}

# CloudWatch
variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 90
}

# API Gateway Throttling
variable "api_throttling_rate_limit" {
  type        = number
  description = "API Gateway rate limit (requests per second)"
  default     = 10000
}

variable "api_throttling_burst_limit" {
  type        = number
  description = "API Gateway burst limit"
  default     = 20000
}

# Budgets
variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget amount in USD"
  default     = 5000
}

# Tags
variable "owner" {
  type        = string
  description = "Owner tag for resources"
  default     = "devops"
}

variable "cost_center" {
  type        = string
  description = "Cost center tag for resources"
  default     = "trading-platform"
}


# WAF Configuration
variable "waf_rate_limit" {
  type        = number
  description = "WAF rate limit (requests per 5 minutes per IP)"
  default     = 2000
}

variable "enable_sql_injection_protection" {
  type        = bool
  description = "Enable SQL injection protection (recommended for production)"
  default     = true
}

variable "enable_xss_protection" {
  type        = bool
  description = "Enable XSS protection (recommended for production)"
  default     = true
}

# Backup Configuration
variable "backup_region" {
  type        = string
  description = "AWS region for cross-region backup"
  default     = "eu-west-1"
}

variable "backup_cross_region_kms_key_arn" {
  type        = string
  description = "KMS key ARN in backup region for encrypting cross-region backups"
  default     = null
}


# Budget Notifications
variable "budget_notification_emails" {
  type        = list(string)
  description = "List of email addresses for budget notifications"
  default     = []
}

# Service-Specific Budget Amounts
variable "lambda_budget_amount" {
  type        = number
  description = "Monthly budget for Lambda service"
  default     = 1000
}

variable "dynamodb_budget_amount" {
  type        = number
  description = "Monthly budget for DynamoDB service"
  default     = 1500
}

variable "api_gateway_budget_amount" {
  type        = number
  description = "Monthly budget for API Gateway service"
  default     = 500
}


# CI/CD Configuration
variable "create_github_oidc_provider" {
  type        = bool
  description = "Whether to create the GitHub OIDC provider"
  default     = true
}

variable "github_repositories" {
  type        = list(string)
  description = "List of GitHub repository patterns allowed to assume the CI/CD role"
  default     = []
}

#------------------------------------------------------------------------------
# Cognito Configuration
# Requirements: 1.8, 1.9 - SES and Lambda trigger configuration
#------------------------------------------------------------------------------
variable "ses_identity_arn" {
  type        = string
  description = "ARN of SES identity for Cognito email delivery (production)"
  default     = ""
}

variable "enable_cognito_lambda_triggers" {
  type        = bool
  description = "Enable Cognito Lambda triggers (set to true when Lambda functions are deployed)"
  default     = false
}

variable "cognito_pre_signup_lambda_arn" {
  type        = string
  description = "ARN of the pre-signup Lambda trigger function"
  default     = ""
}

variable "cognito_post_confirmation_lambda_arn" {
  type        = string
  description = "ARN of the post-confirmation Lambda trigger function"
  default     = ""
}

#------------------------------------------------------------------------------
# Auth Lambda Configuration
# Requirements: 3.1-3.12 - Auth endpoints proxied through API Gateway
#------------------------------------------------------------------------------
variable "auth_lambda_invoke_arn" {
  type        = string
  description = "Invoke ARN of the auth Lambda function"
  default     = ""
}

variable "auth_lambda_function_name" {
  type        = string
  description = "Name of the auth Lambda function"
  default     = ""
}
