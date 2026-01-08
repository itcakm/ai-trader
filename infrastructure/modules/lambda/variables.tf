# Lambda Module Variables
# Defines all input variables for Lambda function configuration

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for Lambda functions"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for Lambda functions"
}

variable "security_group_ids" {
  type        = list(string)
  description = "Security group IDs for Lambda functions"
}

variable "lambda_execution_role_arns" {
  type        = map(string)
  description = "Map of Lambda execution role ARNs by function group"
}

variable "s3_deployment_bucket" {
  type        = string
  description = "S3 bucket for Lambda deployment packages"
}

variable "s3_deployment_key_prefix" {
  type        = string
  description = "S3 key prefix for Lambda deployment packages"
  default     = "lambda"
}

variable "runtime" {
  type        = string
  description = "Lambda runtime"
  default     = "nodejs20.x"
}

variable "architecture" {
  type        = string
  description = "Lambda architecture (x86_64 or arm64)"
  default     = "arm64"
}

variable "memory_size_default" {
  type        = number
  description = "Default memory size for Lambda functions (MB)"
  default     = 256
}

variable "timeout_default" {
  type        = number
  description = "Default timeout for Lambda functions (seconds)"
  default     = 30
}

variable "enable_provisioned_concurrency" {
  type        = bool
  description = "Enable provisioned concurrency for latency-sensitive functions"
  default     = false
}

variable "provisioned_concurrency_count" {
  type        = number
  description = "Number of provisioned concurrent executions"
  default     = 5
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention in days"
  default     = 30
}

# Environment variables passed to Lambda functions
variable "dynamodb_table_names" {
  type        = map(string)
  description = "Map of DynamoDB table names by logical name"
  default     = {}
}

variable "redis_endpoint" {
  type        = string
  description = "Redis cluster endpoint"
  default     = ""
}

variable "redis_port" {
  type        = number
  description = "Redis cluster port"
  default     = 6379
}

variable "secrets_arns" {
  type        = map(string)
  description = "Map of Secrets Manager ARNs by secret name"
  default     = {}
}

variable "timestream_database_name" {
  type        = string
  description = "Timestream database name"
  default     = ""
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for resources"
  default     = {}
}

variable "excluded_functions" {
  type        = list(string)
  description = "List of function names to exclude from deployment (e.g., functions without packages yet)"
  default     = []
}

#------------------------------------------------------------------------------
# Cognito Configuration
# Required for auth Lambda functions
#------------------------------------------------------------------------------
variable "cognito_user_pool_id" {
  type        = string
  description = "Cognito User Pool ID"
  default     = ""
}

variable "cognito_client_id" {
  type        = string
  description = "Cognito App Client ID"
  default     = ""
}

variable "cognito_issuer" {
  type        = string
  description = "Cognito token issuer URL"
  default     = ""
}

variable "cognito_jwks_uri" {
  type        = string
  description = "Cognito JWKS URI for token validation"
  default     = ""
}
