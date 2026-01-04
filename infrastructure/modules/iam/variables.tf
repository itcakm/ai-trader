# IAM Module Variables

variable "environment" {
  type        = string
  description = "Environment name (test/production)"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
  default     = "crypto-trading"
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to resources"
  default     = {}
}

#------------------------------------------------------------------------------
# DynamoDB Table ARNs (for per-table policies)
#------------------------------------------------------------------------------
variable "dynamodb_table_arns" {
  type        = map(string)
  description = "Map of DynamoDB table ARNs by logical table name"
  default     = {}
}

variable "dynamodb_gsi_arns" {
  type        = list(string)
  description = "List of DynamoDB GSI ARNs"
  default     = []
}

#------------------------------------------------------------------------------
# S3 Bucket ARNs (for per-bucket policies)
#------------------------------------------------------------------------------
variable "s3_bucket_arns" {
  type        = map(string)
  description = "Map of S3 bucket ARNs by bucket purpose"
  default     = {}
}

variable "enable_s3_policies" {
  type        = bool
  description = "Enable S3 bucket policies (set to true when S3 module is included)"
  default     = false
}

#------------------------------------------------------------------------------
# Secrets Manager ARNs (for per-secret policies)
#------------------------------------------------------------------------------
variable "secrets_arns" {
  type        = map(string)
  description = "Map of Secrets Manager secret ARNs by secret name"
  default     = {}
}

variable "exchange_secret_arns" {
  type        = map(string)
  description = "Map of exchange secret ARNs by exchange name"
  default     = {}
}

variable "ai_provider_secret_arns" {
  type        = map(string)
  description = "Map of AI provider secret ARNs by provider name"
  default     = {}
}

variable "infrastructure_secret_arns" {
  type        = map(string)
  description = "Map of infrastructure secret ARNs by secret name"
  default     = {}
}

variable "enable_secrets_policies" {
  type        = bool
  description = "Enable Secrets Manager policies (set to true when Secrets module is included)"
  default     = false
}

#------------------------------------------------------------------------------
# Timestream ARNs
#------------------------------------------------------------------------------
variable "timestream_database_arn" {
  type        = string
  description = "ARN of the Timestream database"
  default     = ""
}

variable "timestream_table_arns" {
  type        = list(string)
  description = "List of Timestream table ARNs"
  default     = []
}

variable "enable_timestream_policies" {
  type        = bool
  description = "Enable Timestream policies (set to true when Timestream module is included)"
  default     = false
}

#------------------------------------------------------------------------------
# KMS Key ARNs
#------------------------------------------------------------------------------
variable "kms_key_arns" {
  type        = list(string)
  description = "List of KMS key ARNs for encryption/decryption"
  default     = []
}

variable "enable_kms_policies" {
  type        = bool
  description = "Enable KMS policies (set to true when KMS module is included)"
  default     = false
}

#------------------------------------------------------------------------------
# VPC Configuration
#------------------------------------------------------------------------------
variable "vpc_id" {
  type        = string
  description = "VPC ID for Lambda VPC access"
  default     = ""
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for Lambda VPC access"
  default     = []
}

#------------------------------------------------------------------------------
# ElastiCache Configuration
#------------------------------------------------------------------------------
variable "elasticache_cluster_arn" {
  type        = string
  description = "ARN of the ElastiCache Redis cluster"
  default     = ""
}

#------------------------------------------------------------------------------
# SNS Topic ARNs
#------------------------------------------------------------------------------
variable "sns_topic_arns" {
  type        = list(string)
  description = "List of SNS topic ARNs for publishing"
  default     = []
}

#------------------------------------------------------------------------------
# Step Functions ARNs
#------------------------------------------------------------------------------
variable "step_function_arns" {
  type        = list(string)
  description = "List of Step Functions state machine ARNs"
  default     = []
}

#------------------------------------------------------------------------------
# EventBridge Configuration
#------------------------------------------------------------------------------
variable "eventbridge_bus_arns" {
  type        = list(string)
  description = "List of EventBridge event bus ARNs"
  default     = []
}

#------------------------------------------------------------------------------
# CloudWatch Log Group Configuration
#------------------------------------------------------------------------------
variable "log_group_prefix" {
  type        = string
  description = "Prefix for CloudWatch log groups"
  default     = "/aws/lambda"
}
