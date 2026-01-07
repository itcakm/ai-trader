variable "environment" {
  type        = string
  description = "Environment name (test/production)"
  default     = "test"
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
  description = "Use single NAT Gateway (cost optimization for test)"
  default     = true
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
  default     = "PAY_PER_REQUEST"
}

variable "enable_autoscaling" {
  type        = bool
  description = "Enable auto-scaling for DynamoDB provisioned capacity"
  default     = false
}


# Lambda
variable "lambda_memory_default" {
  type        = number
  description = "Default memory size for Lambda functions (MB)"
  default     = 256
}

variable "lambda_timeout_default" {
  type        = number
  description = "Default timeout for Lambda functions (seconds)"
  default     = 30
}

variable "enable_provisioned_concurrency" {
  type        = bool
  description = "Enable provisioned concurrency for latency-sensitive functions"
  default     = false
}

# Redis
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in Redis cluster"
  default     = 1
}

variable "redis_multi_az" {
  type        = bool
  description = "Enable Multi-AZ for Redis"
  default     = false
}

variable "redis_snapshot_retention_days" {
  type        = number
  description = "Number of days to retain Redis snapshots (0 to disable)"
  default     = 0
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
  default     = 24
}

variable "timestream_magnetic_retention_days" {
  type        = number
  description = "Timestream magnetic store retention in days"
  default     = 30
}

# S3 Lifecycle
variable "audit_log_retention_days" {
  type        = number
  description = "Retention period for audit logs in days"
  default     = 90
}

# CloudWatch
variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

# API Gateway Throttling
variable "api_throttling_rate_limit" {
  type        = number
  description = "API Gateway rate limit (requests per second)"
  default     = 1000
}

variable "api_throttling_burst_limit" {
  type        = number
  description = "API Gateway burst limit"
  default     = 2000
}

# Budgets
variable "monthly_budget_amount" {
  type        = number
  description = "Monthly budget amount in USD"
  default     = 500
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
  default     = false
}

variable "enable_xss_protection" {
  type        = bool
  description = "Enable XSS protection (recommended for production)"
  default     = false
}


# Budget Notifications
variable "budget_notification_emails" {
  type        = list(string)
  description = "List of email addresses for budget notifications"
  default     = []
}

# Enable/Disable modules
variable "enable_timestream" {
  type        = bool
  description = "Enable Timestream module (requires AWS support to enable for new accounts)"
  default     = false
}

variable "enable_budgets" {
  type        = bool
  description = "Enable AWS Budgets module"
  default     = false
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


# Route53 / ACM Configuration
variable "enable_acm_dns_validation" {
  type        = bool
  description = "Enable ACM DNS validation via Route53 (set to true after Route53 hosted zone is created)"
  default     = true
}


variable "enable_route53_api_records" {
  type        = bool
  description = "Enable Route53 A records for API Gateway (set to true after API Gateway is deployed)"
  default     = true
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

#------------------------------------------------------------------------------
# CloudFront Configuration
#------------------------------------------------------------------------------
variable "enable_cloudfront" {
  type        = bool
  description = "Enable CloudFront distribution for frontend"
  default     = true
}

variable "cloudfront_price_class" {
  type        = string
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)"
  default     = "PriceClass_100"
}
